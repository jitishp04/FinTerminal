"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { type Command, tickerCommand } from "@/lib/commands";
import { fetchApi, pollEvery } from "@/lib/fetchApi";
import { formatCompact, formatInteger, formatPercent, formatPrice } from "@/lib/format";
import {
  filterRows,
  MARKET_CAPS,
  nextSort,
  rangePosition,
  SCREENS,
  type ScreenId,
  type Sort,
  type SortKey,
  sortRows,
} from "@/lib/screens";
import type { Screen, ScreenRow } from "@/lib/types";
import { QUOTE_TABLE } from "./quotes";
import { SourceError } from "./SourceError";

// The server keeps a screen for 4 minutes.
const REFRESH = 5 * 60_000;

const FIELD = "rounded-sm border border-border bg-panel px-1.5 py-0.5 focus:border-amber focus:outline-none";

/** The columns, with the panel width each needs. */
const COLUMNS: { key: SortKey; label: string; title: string; show: string; align?: "left" }[] = [
  { key: "symbol", label: "Symbol", title: "Symbol", show: "", align: "left" },
  { key: "name", label: "Name", title: "Company name", show: "hidden @2xl:table-cell", align: "left" },
  { key: "price", label: "Last", title: "Last price", show: "" },
  { key: "changePercent", label: "% Chg", title: "Change on the day", show: "" },
  { key: "volume", label: "Volume", title: "Volume today", show: "hidden @lg:table-cell" },
  { key: "marketCap", label: "Mkt cap", title: "Market capitalization", show: "hidden @md:table-cell" },
  { key: "peRatio", label: "P/E", title: "Trailing price to earnings", show: "" },
  { key: "range", label: "52-week range", title: "Where the price sits between its 52-week low and high", show: "hidden @xl:table-cell" },
];

/** A P/E bound from its field: blank for none. */
const bound = (text: string) => (text.trim() === "" || Number.isNaN(Number(text)) ? undefined : Number(text));

/** EQS: one of Yahoo's stock screens, sortable, with a market-cap floor and a P/E range. Clicking a row opens its thesis check. */
export function EquityScreener({ onOpen }: { onOpen: (command: Command) => void }) {
  const [id, setId] = useState<ScreenId>(SCREENS[0].id);
  const [sort, setSort] = useState<Sort | null>(null);
  const [minMarketCap, setMinMarketCap] = useState(0);
  const [minPe, setMinPe] = useState("");
  const [maxPe, setMaxPe] = useState("");
  const screen = useQuery({
    queryKey: ["screen", id],
    queryFn: () => fetchApi<Screen>(`/api/screen?id=${id}`),
    refetchInterval: pollEvery(REFRESH),
    // Fresh until the next poll, so switching windows doesn't refetch it.
    staleTime: REFRESH,
  });
  const rows = useMemo(
    () => sortRows(filterRows(screen.data?.rows ?? [], { minMarketCap, minPe: bound(minPe), maxPe: bound(maxPe) }), sort),
    [screen.data, minMarketCap, minPe, maxPe, sort],
  );

  return (
    <div className="@container flex h-full flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <label className="flex items-center gap-1.5">
          <span className="text-muted">Screen</span>
          <select value={id} onChange={(e) => setId(e.target.value as ScreenId)} className={FIELD}>
            {SCREENS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-muted">Market cap</span>
          <select value={minMarketCap} onChange={(e) => setMinMarketCap(Number(e.target.value))} className={FIELD}>
            {MARKET_CAPS.map(({ label, value }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <span className="flex items-center gap-1.5">
          <span className="text-muted">P/E</span>
          <input
            value={minPe}
            onChange={(e) => setMinPe(e.target.value)}
            inputMode="decimal"
            aria-label="Lowest P/E"
            placeholder="min"
            className={`w-12 ${FIELD}`}
          />
          <span className="text-muted">to</span>
          <input
            value={maxPe}
            onChange={(e) => setMaxPe(e.target.value)}
            inputMode="decimal"
            aria-label="Highest P/E"
            placeholder="max"
            className={`w-12 ${FIELD}`}
          />
        </span>
      </div>

      {screen.isPending && (
        <p role="status" className="text-muted">
          Running the screen…
        </p>
      )}
      {screen.isError && <SourceError error={screen.error} />}
      {screen.data && (
        <>
          <p className="text-xs text-muted">
            {screen.data.description.replace(/\.?$/, ".")} {summary(screen.data, rows.length)}
          </p>
          {rows.length === 0 ? (
            <p role="status" className="text-muted">
              {screen.data.rows.length === 0 ? "Yahoo finds nothing for this screen right now." : "No stocks pass these filters."}
            </p>
          ) : (
            // Keeps a usable height in a short panel, which then scrolls to it.
            <div className="min-h-40 flex-1 overflow-auto">
              <table className={QUOTE_TABLE}>
                <thead className="sticky top-0 bg-background text-xs text-muted">
                  <tr className="border-b border-border">
                    {COLUMNS.map((column) => (
                      <Header key={column.key} column={column} sort={sort} onSort={() => setSort(nextSort(sort, column.key))} />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <Row key={row.symbol} row={row} onOpen={() => onOpen(tickerCommand(row.symbol))} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted">Yahoo&apos;s screens and prices. Click a column to sort, a row to open its thesis check.</p>
        </>
      )}
    </div>
  );
}

/** "243 stocks match; showing all 243.", "3,804 stocks match; showing Yahoo's first 250.", or with filters, how many pass. */
function summary({ total, rows }: Screen, shown: number): string {
  const matches = total === 1 ? "1 stock matches" : `${formatInteger(total)} stocks match`;
  const of = rows.length < total ? `Yahoo's first ${rows.length}` : `all ${rows.length}`;
  return shown === rows.length ? `${matches}; showing ${of}.` : `${matches}; ${formatInteger(shown)} of ${of} pass the filters.`;
}

function Header({ column, sort, onSort }: { column: (typeof COLUMNS)[number]; sort: Sort | null; onSort: () => void }) {
  const sorted = sort?.key === column.key ? sort : null;
  return (
    <th
      scope="col"
      title={column.title}
      aria-sort={sorted ? (sorted.descending ? "descending" : "ascending") : undefined}
      // The range's low, bar and high are three cells, so their columns line the bars up.
      colSpan={column.key === "range" ? 3 : undefined}
      className={`${column.show} ${column.align === "left" ? "text-left" : ""} ${column.key === "range" ? "text-center!" : ""}`}
    >
      <button type="button" onClick={onSort} className={`hover:text-foreground ${sorted ? "text-amber" : ""}`}>
        {column.label}
        {sorted && (sorted.descending ? " ▼" : " ▲")}
      </button>
    </th>
  );
}

function Row({ row, onOpen }: { row: ScreenRow; onOpen: () => void }) {
  const { symbol, name, price, changePercent, volume, marketCap, peRatio, week52Low, week52High } = row;
  const tone = !changePercent ? "text-muted" : changePercent > 0 ? "text-up" : "text-down";
  const position = rangePosition(row);
  return (
    <tr onClick={onOpen} className="cursor-pointer hover:bg-border">
      <td className="text-left">
        {/* Tells screen readers the row opens something; the click bubbles up to the row. */}
        <button type="button" title={name} className="font-semibold text-amber focus-visible:outline focus-visible:outline-amber">
          {symbol}
        </button>
      </td>
      {/* Takes the spare width, so a long company name is what gives way. */}
      <td className="hidden w-full max-w-0 truncate text-left text-muted @2xl:table-cell">{name}</td>
      <td>{formatPrice(price)}</td>
      <td className={tone}>{changePercent === undefined ? "—" : formatPercent(changePercent)}</td>
      <td className="hidden @lg:table-cell">{volume === undefined ? "—" : formatCompact(volume)}</td>
      <td className="hidden @md:table-cell">{marketCap === undefined ? "—" : formatCompact(marketCap)}</td>
      <td className={peRatio === undefined ? "text-muted" : ""}>{peRatio === undefined ? "—" : peRatio.toFixed(1)}</td>
      <td className="hidden text-xs text-muted @xl:table-cell">{position === undefined ? "" : formatPrice(week52Low!)}</td>
      <td className="hidden @xl:table-cell">
        {position === undefined ? (
          <span className="text-muted">—</span>
        ) : (
          // The dot is where the price sits between the low and the high.
          <span aria-hidden className="relative block h-1 w-16 rounded-full bg-border">
            <span className="absolute -top-0.5 size-2 -translate-x-1/2 rounded-full bg-amber" style={{ left: `${position * 100}%` }} />
          </span>
        )}
      </td>
      <td className="hidden text-left! text-xs text-muted @xl:table-cell">{position === undefined ? "" : formatPrice(week52High!)}</td>
    </tr>
  );
}

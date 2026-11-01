"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { type Ref, useEffect, useRef, useState } from "react";
import { fetchApi, pollEvery } from "@/lib/fetchApi";
import { formatChange, formatInteger, formatPrice } from "@/lib/format";
import { expiryLabel, inTheMoney, nearStrikes, priceIndex, putCallRatios, strikeRows, type StrikeRow } from "@/lib/options";
import type { OptionChain, OptionContract } from "@/lib/types";
import { QuoteLine } from "./QuoteLine";
import { SourceError } from "./SourceError";
import { Toggle } from "./Toggle";

// The server keeps a chain for 50 s.
const REFRESH = 60_000;

const FIELD = "rounded-sm border border-border bg-panel px-1.5 py-0.5 focus:border-amber focus:outline-none";

type Side = "call" | "put";

/**
 * The columns of each side, from the strike outward. Below @2xl only one side shows, chosen by a toggle;
 * from there both do, and the panel's width decides how many columns fit.
 */
const COLUMNS: { label: string; title: string; show: string; cell: (c: OptionContract) => string; tone?: (c: OptionContract) => string }[] = [
  { label: "Bid", title: "Bid", show: "", cell: (c) => price(c.bid) },
  { label: "Ask", title: "Ask", show: "", cell: (c) => price(c.ask) },
  { label: "Last", title: "Last price", show: "@2xl:hidden @3xl:table-cell", cell: (c) => price(c.last) },
  {
    label: "Chg",
    title: "Change on the day",
    show: "hidden @md:table-cell @2xl:hidden @5xl:table-cell",
    cell: (c) => (c.change === undefined ? "—" : formatChange(c.change, 2)),
    tone: (c) => (!c.change ? "text-muted" : c.change > 0 ? "text-up" : "text-down"),
  },
  { label: "Vol", title: "Volume today", show: "", cell: (c) => count(c.volume) },
  { label: "OI", title: "Open interest", show: "", cell: (c) => count(c.openInterest) },
  { label: "IV", title: "Implied volatility, Yahoo's", show: "", cell: (c) => volatility(c.impliedVolatility) },
];
const CALL_COLUMNS = [...COLUMNS].reverse();

const price = (value: number | undefined) => (value === undefined ? "—" : formatPrice(value, 2));
const count = (value: number | undefined) => (value === undefined ? "—" : formatInteger(value));
const volatility = (value: number | undefined) => (value === undefined ? "—" : `${(value * 100).toFixed(1)}%`);
const ratio = (value: number | undefined) => (value === undefined ? "—" : value.toFixed(2));

/** OMON: one expiration's calls and puts, by strike, around the price. */
export function OptionsMonitor({ symbol }: { symbol: string }) {
  // Undefined is the nearest expiration.
  const [expiry, setExpiry] = useState<string>();
  const [allStrikes, setAllStrikes] = useState(false);
  const [side, setSide] = useState<Side>("call");
  const chain = useQuery({
    queryKey: ["options", symbol, expiry ?? "nearest"],
    queryFn: () =>
      fetchApi<OptionChain>(`/api/options?symbol=${encodeURIComponent(symbol)}${expiry ? `&expiry=${expiry}` : ""}`),
    refetchInterval: pollEvery(REFRESH),
    // Fresh until the next poll, so switching windows doesn't refetch it.
    staleTime: REFRESH,
    // Keeps the last expiration's chain on screen while the next one loads.
    placeholderData: keepPreviousData,
  });

  return (
    <div className="@container flex h-full flex-col gap-1.5">
      <QuoteLine symbol={symbol} />
      {chain.isPending && (
        <p role="status" className="text-muted">
          Loading the option chain…
        </p>
      )}
      {chain.isError && <SourceError error={chain.error} />}
      {chain.data && (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <label className="flex items-center gap-1.5">
              <span className="text-muted">Expires</span>
              <select value={chain.data.expiration} onChange={(e) => setExpiry(e.target.value)} className={FIELD}>
                {chain.data.expirations.map((day) => (
                  <option key={day} value={day}>
                    {expiryLabel(day, new Date())}
                  </option>
                ))}
              </select>
            </label>
            <Toggle pressed={allStrikes} onClick={() => setAllStrikes(!allStrikes)}>
              All strikes
            </Toggle>
            <div role="group" aria-label="Side" className="flex items-center gap-0.5 @2xl:hidden">
              <Toggle pressed={side === "call"} onClick={() => setSide("call")}>
                Calls
              </Toggle>
              <Toggle pressed={side === "put"} onClick={() => setSide("put")}>
                Puts
              </Toggle>
            </div>
            <Ratios chain={chain.data} />
          </div>
          <Chain chain={chain.data} allStrikes={allStrikes} side={side} loading={chain.isPlaceholderData} />
          <p className="text-xs text-muted">
            Yahoo&apos;s quotes, which can be 15 minutes late. Shaded: in the money at {formatPrice(chain.data.price, 2)}.
          </p>
        </>
      )}
    </div>
  );
}

function Ratios({ chain }: { chain: OptionChain }) {
  const { volume, openInterest } = putCallRatios(chain);
  return (
    <span className="text-muted" title="The puts' total over the calls', for this expiration">
      Put/call <span className="text-foreground">{ratio(volume)}</span> volume ·{" "}
      <span className="text-foreground">{ratio(openInterest)}</span> open interest
    </span>
  );
}

function Chain({ chain, allStrikes, side, loading }: { chain: OptionChain; allStrikes: boolean; side: Side; loading: boolean }) {
  const all = strikeRows(chain);
  const rows = allStrikes ? all : nearStrikes(all, chain.price);
  const line = priceIndex(rows, chain.price);
  // Below @2xl, the side the toggle didn't choose gives way.
  // Important, so it beats a column's own @md:table-cell whatever order the CSS comes in.
  const only = (cellSide: Side) => (cellSide === side ? "" : "@max-2xl:hidden!");

  // Brings the price line to the middle of a short panel, for each expiration and when all strikes show, not on each poll.
  const box = useRef<HTMLDivElement>(null);
  const priceLine = useRef<HTMLTableRowElement>(null);
  const view = `${chain.expiration}:${allStrikes}`;
  useEffect(() => {
    const outer = box.current;
    const inner = priceLine.current;
    if (outer && inner) outer.scrollTop = inner.offsetTop - outer.clientHeight / 2;
  }, [view]);

  if (rows.length === 0) {
    return (
      <p role="status" className="text-muted">
        No contracts for this expiration.
      </p>
    );
  }
  return (
    // Keeps a usable height in a short panel, which then scrolls to it.
    <div ref={box} aria-busy={loading} className={`min-h-40 flex-1 overflow-auto ${loading ? "opacity-60" : ""}`}>
      <table className="w-full text-right whitespace-nowrap tabular-nums [&_td]:px-1 [&_td]:py-0.5 [&_th]:px-1 [&_th]:py-0.5 [&_th]:font-normal">
        <thead className="sticky top-0 bg-background text-xs text-muted">
          {/* One cell a column, not a span: a span counts the columns a narrow panel hides. */}
          <tr className="tracking-wider uppercase">
            {CALL_COLUMNS.map(({ label, show }) => (
              <th key={label} className={`${show} ${only("call")}`}>
                {label === "Bid" ? "Calls" : ""}
              </th>
            ))}
            <th />
            {COLUMNS.map(({ label, show }) => (
              <th key={label} className={`text-left! ${show} ${only("put")}`}>
                {label === "Bid" ? "Puts" : ""}
              </th>
            ))}
          </tr>
          <tr className="border-b border-border">
            {CALL_COLUMNS.map(({ label, title, show }) => (
              <th key={label} scope="col" title={title} className={`${show} ${only("call")}`}>
                {label}
              </th>
            ))}
            <th scope="col" className="text-center!">
              Strike
            </th>
            {COLUMNS.map(({ label, title, show }) => (
              <th key={label} scope="col" title={title} className={`${show} ${only("put")}`}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <Row key={row.strike} row={row} price={chain.price} only={only} line={i === line ? priceLine : undefined} />
          ))}
          {line === rows.length && <PriceLine price={chain.price} ref={priceLine} />}
        </tbody>
      </table>
    </div>
  );
}

interface RowProps {
  row: StrikeRow;
  price: number;
  only: (side: Side) => string;
  /** Set when the price falls just below this strike, so the price line goes first. */
  line?: Ref<HTMLTableRowElement>;
}

function Row({ row: { strike, call, put }, price, only, line }: RowProps) {
  const cells = (cellSide: Side, contract: OptionContract | undefined, columns: typeof COLUMNS) => {
    const shade = contract && inTheMoney(cellSide, strike, price) ? "bg-amber/10" : "";
    return columns.map(({ label, show, cell, tone }) => (
      <td key={label} className={`${show} ${only(cellSide)} ${shade} ${contract && tone ? tone(contract) : contract ? "" : "text-muted"}`}>
        {contract ? cell(contract) : ""}
      </td>
    ));
  };
  return (
    <>
      {line && <PriceLine price={price} ref={line} />}
      <tr className="hover:bg-border">
        {cells("call", call, CALL_COLUMNS)}
        <th scope="row" className="bg-panel text-center! font-semibold!">
          {formatPrice(strike, 2)}
        </th>
        {cells("put", put, COLUMNS)}
      </tr>
    </>
  );
}

/** The underlying's price, between the strikes either side of it. */
function PriceLine({ price, ref }: { price: number; ref: Ref<HTMLTableRowElement> }) {
  return (
    <tr ref={ref}>
      <td colSpan={2 * COLUMNS.length + 1} className="border-y border-amber/60 py-0! text-center! text-xs text-amber">
        {formatPrice(price, 2)}
      </td>
    </tr>
  );
}

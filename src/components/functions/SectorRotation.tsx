"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { Command } from "@/lib/commands";
import { fetchApi, pollEvery, RETRY_EVERY } from "@/lib/fetchApi";
import { formatPercent, formatPrice } from "@/lib/format";
import { SECTORS } from "@/lib/monitors";
import { change, MOMENTUM_WEEKS, quadrant, rotation, TREND_WEEKS } from "@/lib/rotation";
import type { Rotation } from "@/lib/types";
import { QUOTE_TABLE } from "./quotes";
import { type MapSector, QUADRANT_COLORS, RotationMap } from "./RotationMap";
import { SourceError } from "./SourceError";
import { Toggle } from "./Toggle";

// The chart cache holds weekly bars for 10 minutes.
const REFRESH = 10 * 60_000;
// Weeks of path behind each dot.
const TAILS = [4, 8, 12];

const weekOf = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const tone = (value: number | undefined) => (!value ? "text-muted" : value > 0 ? "text-up" : "text-down");

/** ROT: the 11 sectors by trend and momentum against SPY, on a map and in a table. Clicking one opens its chart here. */
export function SectorRotation({ onOpen }: { onOpen: (command: Command) => void }) {
  const [tail, setTail] = useState(4);
  const [active, setActive] = useState<string>();
  const query = useQuery({
    queryKey: ["rotation"],
    queryFn: () => fetchApi<Rotation>("/api/rotation"),
    // A sector that didn't come back is asked for again soon, as the panel says.
    refetchInterval: (q) => (q.state.data?.missing.length ? RETRY_EVERY : pollEvery(REFRESH)(q)),
    // Fresh until the next poll, so switching windows doesn't refetch it.
    staleTime: REFRESH,
  });

  if (query.isPending) {
    return (
      <p role="status" className="text-muted">
        Loading sectors…
      </p>
    );
  }
  if (query.isLoadingError) return <SourceError error={query.error} />;

  const { benchmark, sectors, missing } = query.data;
  const rows = SECTORS.map(({ symbol, name }) => {
    const weeks = sectors.find((s) => s.symbol === symbol)?.weeks ?? [];
    const points = rotation(weeks, benchmark.weeks);
    const latest = points.at(-1);
    return { symbol, name, points, latest, quadrant: latest && quadrant(latest), week: change(weeks, 1), month: change(weeks, 4) };
  });
  const onMap: MapSector[] = rows.flatMap(({ symbol, name, points, quadrant }) =>
    quadrant ? [{ symbol, name, quadrant, points: points.slice(-1 - tail) }] : [],
  );
  const lastWeek = benchmark.weeks.at(-1)?.week;
  const open = (symbol: string) => onOpen({ fn: "GP", symbol, args: [] });
  const notSent = SECTORS.filter((s) => missing.includes(s.symbol)).map((s) => `${s.name} (${s.symbol})`);

  return (
    <div className="@container h-full">
      <div className="flex h-full flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-x-3 text-xs">
          <div role="group" aria-label="Tail" className="flex items-center gap-0.5">
            <span aria-hidden className="mr-1 text-muted">
              Tail
            </span>
            {TAILS.map((weeks) => (
              <Toggle key={weeks} pressed={weeks === tail} onClick={() => setTail(weeks)}>
                {weeks}W
              </Toggle>
            ))}
          </div>
          {lastWeek && <span className="ml-auto text-muted">Week of {weekOf.format(new Date(lastWeek))}</span>}
        </div>
        {notSent.length > 0 && (
          <p role="alert" className="text-down">
            Yahoo Finance didn&apos;t send {notSent.join(", ")}. Retrying…
          </p>
        )}
        <div className="flex flex-1 flex-col gap-3 @3xl:flex-row">
          {/* Keeps a usable size in a short panel, which then scrolls to the table. */}
          <div className="relative min-h-64 min-w-0 flex-1">
            <RotationMap sectors={onMap} active={active} onActive={setActive} onOpen={open} />
          </div>
          <div className="shrink-0 @3xl:w-[30rem]">
            {/* Tighter cells in a phone-width panel, so every column fits. */}
            <table className={`${QUOTE_TABLE} @max-md:[&_td]:px-0.5! @max-md:[&_th]:px-0.5!`}>
              <thead className="text-xs text-muted">
                <tr className="border-b border-border">
                  <th scope="col" className="text-left">
                    ETF
                  </th>
                  <th scope="col" className="hidden text-left @md:table-cell">
                    Sector
                  </th>
                  <th scope="col" className="text-left">
                    Quadrant
                  </th>
                  <th scope="col">Trend</th>
                  <th scope="col">Momentum</th>
                  <th scope="col">1W</th>
                  <th scope="col">4W</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ symbol, name, latest, quadrant, week, month }) => (
                  <tr
                    key={symbol}
                    onClick={() => open(symbol)}
                    onPointerEnter={() => setActive(symbol)}
                    onPointerLeave={() => setActive(undefined)}
                    className={`cursor-pointer hover:bg-border ${active === symbol ? "bg-border" : ""}`}
                  >
                    <td className="text-left">
                      {/* Tells screen readers the row opens something; the click bubbles up to the row. */}
                      <button
                        type="button"
                        title={name}
                        onFocus={() => setActive(symbol)}
                        onBlur={() => setActive(undefined)}
                        className="font-semibold text-amber focus-visible:outline focus-visible:outline-amber"
                      >
                        {symbol}
                      </button>
                    </td>
                    {/* Takes the spare width, so a long name is what gives way. */}
                    <td className="hidden w-full max-w-0 truncate text-left text-muted @md:table-cell">{name}</td>
                    <td className="text-left">
                      {quadrant ? (
                        <span className="flex items-center gap-1.5">
                          <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: QUADRANT_COLORS[quadrant] }} />
                          {quadrant}
                        </span>
                      ) : (
                        <span className="text-muted">No data</span>
                      )}
                    </td>
                    <td>{latest ? formatPrice(latest.trend, 2) : "—"}</td>
                    <td>{latest ? formatPrice(latest.momentum, 2) : "—"}</td>
                    <td className={tone(week)}>{week === undefined ? "—" : formatPercent(week)}</td>
                    <td className={tone(month)}>{month === undefined ? "—" : formatPercent(month)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="text-xs text-muted">
          Trend compares each sector&apos;s strength against SPY with its {TREND_WEEKS}-week average, and momentum
          compares trend with its {MOMENTUM_WEEKS}-week average. Weekly closes, dividends included.
          {query.isError && " Couldn't refresh."}
        </p>
      </div>
    </div>
  );
}

"use client";

import { useQuery } from "@tanstack/react-query";
import { bpChange, invertedSegments } from "@/lib/curve";
import { fetchApi, pollEvery } from "@/lib/fetchApi";
import { formatChange, formatPrice } from "@/lib/format";
import { MACRO_REFRESH } from "@/lib/macro";
import type { YieldCurve as Curve } from "@/lib/types";
import { MacroError } from "./MacroError";
import { QUOTE_TABLE } from "./quotes";
import { YieldCurveChart } from "./YieldCurveChart";

const percent = (value: number) => formatPrice(value, 2);
const bp = (yieldNow: number, yieldThen: number) => formatChange(bpChange(yieldNow, yieldThen), 0);

/** CURV: the Treasury curve against a month and a year ago, with each tenor's yields and changes. */
export function YieldCurve() {
  const curve = useQuery({
    queryKey: ["curve"],
    queryFn: () => fetchApi<Curve>("/api/curve"),
    refetchInterval: pollEvery(MACRO_REFRESH),
    // Fresh until the next poll, so switching windows doesn't refetch it.
    staleTime: MACRO_REFRESH,
  });

  if (curve.isPending) {
    return (
      <p role="status" className="text-muted">
        Loading yield curve…
      </p>
    );
  }
  if (curve.isLoadingError) return <MacroError error={curve.error} />;

  const { dates, points } = curve.data;
  const inverted = invertedSegments(points);
  return (
    <div className="@container h-full">
      <div className="flex h-full flex-col gap-1.5">
        <ul aria-label="Curves" className="flex flex-wrap gap-x-3 text-xs text-muted">
          <Key line="border-solid border-foreground">Latest {dates.latest}</Key>
          <Key line="border-dashed border-amber">1M ago {dates.monthAgo}</Key>
          <Key line="border-dotted border-link">1Y ago {dates.yearAgo}</Key>
          <Key line="border-solid border-down">
            {inverted.length > 0 ? `Inverted ${inverted.join(", ")}` : "No inversions"}
          </Key>
        </ul>
        <div className="flex flex-1 flex-col gap-3 @md:flex-row">
          {/* Keeps a usable height in a short panel, which then scrolls to it. */}
          <div className="relative min-h-40 min-w-0 flex-1">
            <YieldCurveChart curve={curve.data} />
          </div>
          <div className="shrink-0 @md:w-60 @2xl:w-80">
            {/* Tighter rows, so that all eleven fit a quarter of the screen beside the chart. */}
            <table className={`${QUOTE_TABLE} [&_td]:py-0! [&_th]:py-0!`}>
              <thead className="text-xs text-muted">
                <tr className="border-b border-border">
                  <th scope="col" className="text-left">
                    Tenor
                  </th>
                  <th scope="col">Latest</th>
                  <th scope="col" className="hidden @2xl:table-cell">
                    1M ago
                  </th>
                  <th scope="col" className="hidden @2xl:table-cell">
                    1Y ago
                  </th>
                  <th scope="col">1M bp</th>
                  <th scope="col">1Y bp</th>
                </tr>
              </thead>
              <tbody>
                {points.map(({ tenor, latest, monthAgo, yearAgo, inverted: down }) => (
                  <tr key={tenor}>
                    <th scope="row" className="text-left font-semibold! text-amber">
                      {tenor}
                    </th>
                    <td className={down ? "text-down" : undefined}>{percent(latest)}</td>
                    <td className="hidden text-muted @2xl:table-cell">{percent(monthAgo)}</td>
                    <td className="hidden text-muted @2xl:table-cell">{percent(yearAgo)}</td>
                    <td>{bp(latest, monthAgo)}</td>
                    <td>{bp(latest, yearAgo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="text-xs text-muted">
          FRED runs a day behind treasury.gov. Tenors aren&apos;t to scale.
          {curve.isError && " Couldn't refresh."}
        </p>
      </div>
    </div>
  );
}

function Key({ line, children }: { line: string; children: string | string[] }) {
  return (
    <li className="flex items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden className={`inline-block w-4 border-t-2 ${line}`} />
      {children}
    </li>
  );
}

"use client";

import { useQuery } from "@tanstack/react-query";
import type { Command } from "@/lib/commands";
import { fetchApi, pollEvery } from "@/lib/fetchApi";
import { formatIndicator, MACRO_REFRESH, sparkPoints } from "@/lib/macro";
import type { MacroIndicator } from "@/lib/types";
import { MacroError } from "./MacroError";
import { QUOTE_TABLE } from "./quotes";

const TREND_WIDTH = 72;
const TREND_HEIGHT = 16;

/** ECO: the main US indicators. Clicking a row charts its FRED series here. */
export function MacroDashboard({ onOpen }: { onOpen: (command: Command) => void }) {
  const dashboard = useQuery({
    queryKey: ["macro"],
    queryFn: async () => (await fetchApi<{ indicators: MacroIndicator[] }>("/api/macro")).indicators,
    refetchInterval: pollEvery(MACRO_REFRESH),
    // Fresh until the next poll, so switching windows doesn't refetch it.
    staleTime: MACRO_REFRESH,
  });

  if (dashboard.isPending) {
    return (
      <p role="status" className="text-muted">
        Loading indicators…
      </p>
    );
  }
  if (dashboard.isLoadingError) return <MacroError error={dashboard.error} />;

  return (
    <div className="@container flex flex-col gap-2">
      <table className={QUOTE_TABLE}>
        <thead className="text-xs text-muted">
          <tr className="border-b border-border">
            <th scope="col" className="text-left">
              Indicator
            </th>
            <th scope="col">Latest</th>
            <th scope="col">Prior</th>
            <th scope="col">Period</th>
            <th scope="col" className="hidden @md:table-cell">
              2 years
            </th>
          </tr>
        </thead>
        <tbody>
          {dashboard.data.map((indicator) => (
            <tr
              key={indicator.id}
              onClick={() => onOpen({ fn: "ECO", args: [indicator.id] })}
              className="cursor-pointer hover:bg-border"
            >
              {/* In a narrow panel, the name is what gives way. */}
              <td className="w-full max-w-0 text-left">
                {/* Tells screen readers the row opens something; the click bubbles up to the row. */}
                <button
                  type="button"
                  title={indicator.id}
                  className="block max-w-full truncate font-semibold text-amber focus-visible:outline focus-visible:outline-amber"
                >
                  {indicator.label}
                </button>
              </td>
              <td>{formatIndicator(indicator.latest, indicator)}</td>
              <td className="text-muted">{formatIndicator(indicator.prior, indicator)}</td>
              <td className="text-muted">{indicator.period}</td>
              <td className="hidden text-muted @md:table-cell">
                <Trend values={indicator.trend} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted">
        CPI is seasonally adjusted, so it can differ a little from the headline rate. Charts show each series as FRED
        publishes it.
        {dashboard.isError && " Couldn't refresh."}
      </p>
    </div>
  );
}

/** Up isn't good or bad here, so the line stays neutral. */
function Trend({ values }: { values: number[] }) {
  return (
    <svg aria-hidden width={TREND_WIDTH} height={TREND_HEIGHT} className="ml-auto block overflow-visible">
      <polyline points={sparkPoints(values, TREND_WIDTH, TREND_HEIGHT)} fill="none" stroke="currentColor" />
    </svg>
  );
}

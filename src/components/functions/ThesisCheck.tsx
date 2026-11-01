"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { fetchApi, pollEvery } from "@/lib/fetchApi";
import { readWeeks, type SignalLabel, type ThesisWeek } from "@/lib/thesis";
import type { Thesis } from "@/lib/types";
import { QuoteLine } from "./QuoteLine";
import { SourceError } from "./SourceError";
import { ThesisChart } from "./ThesisChart";

// The server keeps a symbol's weeks for 9 minutes.
const REFRESH = 10 * 60_000;

const BUY_RULE =
  "BUY: pullback in an uptrend. Price is above a rising 40-week line and this week touched the lower Bollinger Band or RSI fell to 40 or below. In the 2026-10-17 test this was followed by about +3% over the next half-year vs an ordinary week. A prompt to look closer, not an order.";
const VOL_RULE =
  "VOL: heavy buying in an uptrend. An up week closing in the top half of its range on more than 2x the 20-week average volume, while price is above a rising 40-week line. In the 2026-10-18 test this was followed by about +7% over the next half-year and +12% over the next year vs an ordinary week. A prompt to look closer, not an order.";
const RULES: Record<SignalLabel, string> = { BUY: BUY_RULE, VOL: VOL_RULE, "BUY+VOL": `${BUY_RULE} ${VOL_RULE}` };
const MOMENTUM_RULE =
  "Strong momentum: the week closed above the upper band with RSI at 70 or higher. Followed by better than average returns in the test, so it is not a reason on its own to trim.";

/** What the signals on a week mean, if it has any. */
function ruleFor(week: ThesisWeek | undefined): string | undefined {
  if (!week) return undefined;
  const rules = [week.label && RULES[week.label], week.momentum && MOMENTUM_RULE].filter(Boolean);
  return rules.length > 0 ? rules.join(" ") : undefined;
}

/** THS: the weekly trend, strength against the market, Bollinger Bands, RSI and buy signals. */
export function ThesisCheck({ symbol }: { symbol: string }) {
  const [hovered, setHovered] = useState<number>();
  const thesis = useQuery({
    queryKey: ["thesis", symbol],
    queryFn: () => fetchApi<Thesis>(`/api/thesis?symbol=${encodeURIComponent(symbol)}`),
    refetchInterval: pollEvery(REFRESH),
    // Fresh until the next poll, so switching windows doesn't refetch it.
    staleTime: REFRESH,
  });
  const weeks = useMemo(() => (thesis.data ? readWeeks(thesis.data) : []), [thesis.data]);
  const rule = ruleFor(weeks.find((week) => week.bar.time === hovered));

  return (
    <div className="flex h-full flex-col gap-1.5">
      <QuoteLine symbol={symbol} />
      {thesis.isPending && (
        <p role="status" className="text-muted">
          Loading weekly history…
        </p>
      )}
      {thesis.isError && !thesis.data && <SourceError error={thesis.error} />}
      {thesis.data && weeks.length === 0 && (
        <p role="status" className="text-muted">
          No price history for {symbol}.
        </p>
      )}
      {thesis.data && weeks.length > 0 && (
        <>
          {/* Keeps a usable size in a short panel, which then scrolls to it. */}
          <div className="relative min-h-56 flex-1">
            <ThesisChart weeks={weeks} label={`${symbol} weekly chart`} onHover={setHovered} />
            {rule && (
              <p className="pointer-events-none absolute top-1 right-16 left-1 z-10 rounded-sm bg-panel/90 px-1.5 py-0.5 text-xs">{rule}</p>
            )}
          </div>
          <p className="text-xs text-muted">
            Weekly. Middle pane: strength against the {thesis.data.benchmark.name}, above 0 when beating it. Point at a label for its
            rule.
          </p>
        </>
      )}
    </div>
  );
}

"use client";

import type { Command } from "@/lib/commands";
import { formatPercent, formatPrice } from "@/lib/format";
import { HEAT_CAP, heatColor } from "@/lib/heatmap";
import { SECTORS } from "@/lib/monitors";
import { QuotesError, useQuotes } from "./quotes";

const SYMBOLS = SECTORS.map((sector) => sector.symbol);

/** The 11 sectors as tiles colored by the day's change. Clicking one opens its chart here. */
export function SectorHeatmap({ onOpen }: { onOpen: (command: Command) => void }) {
  const { quotes, error, hasData, loading } = useQuotes(SYMBOLS);

  return (
    <div className="flex min-h-full flex-col gap-1.5">
      <QuotesError error={error} hasData={hasData} />
      {/* Tiles fill a tall panel, and keep their height in a short one, which then scrolls. */}
      <div className="grid flex-1 auto-rows-[minmax(3.5rem,1fr)] grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-1">
        {SECTORS.map(({ symbol, name }) => {
          const quote = quotes.get(symbol);
          return (
            <button
              key={symbol}
              type="button"
              onClick={() => onOpen({ fn: "GP", symbol, args: [] })}
              style={{ backgroundColor: heatColor(quote?.changePercent) }}
              className="flex min-w-0 flex-col justify-between rounded-sm p-1.5 text-left transition-colors hover:outline hover:outline-foreground focus-visible:outline focus-visible:outline-amber"
            >
              <span className="flex items-baseline justify-between gap-1">
                <span className="min-w-0 truncate">{name}</span>
                <span className="text-xs">{symbol}</span>
              </span>
              <span className="flex items-baseline justify-between gap-1">
                <span className="text-base font-semibold">
                  {quote?.changePercent === undefined ? (loading ? "…" : "—") : formatPercent(quote.changePercent)}
                </span>
                <span className="text-xs">{quote && formatPrice(quote.price)}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted">Color shows today&rsquo;s change, strongest at ±{HEAT_CAP}%.</p>
    </div>
  );
}

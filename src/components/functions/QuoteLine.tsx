"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetchApi";
import { formatChange, formatPercent, formatPrice, priceDecimals } from "@/lib/format";
import { withTrade } from "@/lib/live";
import type { Quote } from "@/lib/types";
import { LIVE_REFRESH, useLive } from "./useLive";

const QUOTE_REFRESH = 15_000;

/** Name, last price and the day's change, polled, and live for a US stock or fund. Panels showing one symbol share the request. */
export function QuoteLine({ symbol }: { symbol: string }) {
  const { trades, live } = useLive([symbol]);
  const refresh = live.has(symbol) ? LIVE_REFRESH : QUOTE_REFRESH;
  const { data, error } = useQuery({
    queryKey: ["quote", symbol],
    queryFn: async () =>
      (await fetchApi<{ quotes: Quote[] }>(`/api/quote?symbols=${encodeURIComponent(symbol)}`)).quotes[0] ?? null,
    refetchInterval: refresh,
    // Fresh until the next poll, so switching windows doesn't refetch it.
    staleTime: refresh,
  });
  const quote = data && withTrade(data, trades.get(symbol));

  if (!quote) {
    return <p className="truncate text-muted">{quote === null ? `No quote for ${symbol}` : (error?.message ?? symbol)}</p>;
  }
  const decimals = priceDecimals(quote.price);
  const change = quote.change ?? 0;
  const tone = change > 0 ? "text-up" : change < 0 ? "text-down" : "text-muted";
  return (
    <p className="flex items-baseline gap-2 whitespace-nowrap">
      <span className="min-w-0 truncate text-muted">{quote.name}</span>
      <span className="ml-auto text-base font-semibold">{formatPrice(quote.price, decimals)}</span>
      {quote.change !== undefined && (
        <span className={tone}>
          {change > 0 ? "▲ " : change < 0 ? "▼ " : ""}
          {formatChange(change, decimals)}
          {quote.changePercent !== undefined && ` (${formatPercent(quote.changePercent)})`}
        </span>
      )}
      {quote.currency && <span className="text-xs text-muted">{quote.currency}</span>}
      {error && (
        <span title={error.message} className="text-xs text-down">
          out of date
        </span>
      )}
    </p>
  );
}

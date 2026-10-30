"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { fetchApi } from "@/lib/fetchApi";
import { formatChange, formatPercent, formatPrice, priceDecimals } from "@/lib/format";
import type { Quote } from "@/lib/types";

// What W, WEI and the other quote tables share.

const REFRESH = 10_000;

export const QUOTE_TABLE =
  "w-full text-right whitespace-nowrap [&_td]:px-1 [&_td]:py-0.5 [&_th]:px-1 [&_th]:py-0.5 [&_th]:font-normal";

/** Quotes for a list, refreshed by one batched request. Panels showing the same list share it. */
export function useQuotes(symbols: string[]) {
  const { data, error, isPlaceholderData, dataUpdatedAt } = useQuery({
    queryKey: ["quotes", symbols],
    queryFn: async () =>
      (await fetchApi<{ quotes: Quote[] }>(`/api/quote?symbols=${symbols.map(encodeURIComponent).join(",")}`)).quotes,
    enabled: symbols.length > 0,
    refetchInterval: REFRESH,
    // Fresh until the next poll, so switching windows doesn't refetch it.
    staleTime: REFRESH,
    // Keeps the rows on screen while a changed list loads.
    placeholderData: keepPreviousData,
  });
  const quotes = useMemo(() => new Map(data?.map((q) => [q.symbol, q])), [data]);
  return {
    quotes,
    error,
    hasData: data !== undefined,
    loading: isPlaceholderData || (data === undefined && !error),
    updatedAt: dataUpdatedAt,
  };
}

/** Keeps the last prices on screen when a refresh fails. */
export function QuotesError({ error, hasData }: { error: Error | null; hasData: boolean }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-down">
      {hasData ? `Prices may be out of date. ${error.message}` : error.message}
    </p>
  );
}

interface QuoteCellsProps {
  quote?: Quote;
  loading: boolean;
  /** Shown as the last price when there's no quote. */
  missing?: string;
  /** Overrides the decimals that `priceDecimals` picks. */
  decimals?: number;
}

/** The Last, Change and % Change cells of a row. */
export function QuoteCells({ quote, loading, missing = "—", decimals }: QuoteCellsProps) {
  const change = quote?.change ?? 0;
  const tone = change > 0 ? "text-up" : change < 0 ? "text-down" : "text-muted";
  const places = decimals ?? priceDecimals(quote?.price ?? 0);
  return (
    <>
      <td>
        {quote ? (
          <LastPrice price={quote.price} decimals={places} />
        ) : (
          <span className="text-muted">{loading ? "…" : missing}</span>
        )}
      </td>
      <td className={tone}>
        {quote?.change === undefined
          ? "—"
          : `${change > 0 ? "▲ " : change < 0 ? "▼ " : ""}${formatChange(change, places)}`}
      </td>
      <td className={tone}>{quote?.changePercent === undefined ? "—" : formatPercent(quote.changePercent)}</td>
    </>
  );
}

/** Flashes green or red when the price changes. */
function LastPrice({ price, decimals }: { price: number; decimals: number }) {
  const [seen, setSeen] = useState({ price, flash: "" });
  if (price !== seen.price) {
    setSeen({ price, flash: price > seen.price ? "animate-flash-up" : "animate-flash-down" });
  }
  // The key restarts the animation on every change.
  return (
    <span key={price} className={`rounded-sm px-0.5 ${seen.flash}`}>
      {formatPrice(price, decimals)}
    </span>
  );
}

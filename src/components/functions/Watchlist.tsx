"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import type { Command } from "@/lib/commands";
import { formatCompact, formatPrice, priceDecimals } from "@/lib/format";
import type { Quote } from "@/lib/types";
import { addSymbol, parseWatchlist, removeSymbol, watchlistStore } from "@/lib/watchlist";
import { QUOTE_TABLE, QuoteCells, QuotesError, useQuotes } from "./quotes";

/** Your symbols, refreshed by one batched request. W panels share the list and the request. */
export function Watchlist({ onOpen }: { onOpen: (command: Command) => void }) {
  const raw = useSyncExternalStore(watchlistStore.subscribe, watchlistStore.getSnapshot, watchlistStore.getServerSnapshot);
  const symbols = useMemo(() => parseWatchlist(raw), [raw]);
  const [draft, setDraft] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const { quotes, error, hasData, loading } = useQuotes(symbols);

  const save = (next: string[]) => watchlistStore.save(JSON.stringify(next));

  function add() {
    if (!draft.trim()) return;
    const result = addSymbol(symbols, draft);
    if (!result.ok) {
      setAddError(result.error);
      return;
    }
    save(result.symbols);
    setDraft("");
  }

  return (
    <div className="@container flex flex-col gap-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="flex items-center gap-1.5"
      >
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setAddError(null);
          }}
          aria-label="Symbol to add"
          aria-invalid={addError !== null}
          placeholder="Add a symbol, e.g. TSLA"
          autoComplete="off"
          spellCheck={false}
          className="w-52 min-w-0 rounded-sm border border-border bg-panel px-1.5 py-0.5 placeholder:text-muted focus:border-amber focus:outline-none"
        />
        <button type="submit" className="rounded-sm px-1.5 py-0.5 text-muted hover:bg-border hover:text-foreground">
          Add
        </button>
        {addError && (
          <p role="alert" className="min-w-0 truncate text-down">
            {addError}
          </p>
        )}
      </form>

      <QuotesError error={error} hasData={hasData} />

      {symbols.length === 0 ? (
        <p role="status" className="text-muted">
          Your watchlist is empty. Add a symbol above.
        </p>
      ) : (
        <table className={QUOTE_TABLE}>
          <thead className="text-xs text-muted">
            <tr className="border-b border-border">
              <th scope="col" className="text-left">
                Symbol
              </th>
              <th scope="col">Last</th>
              <th scope="col">Change</th>
              <th scope="col">% Change</th>
              <th scope="col" className="hidden @md:table-cell">
                Volume
              </th>
              <th scope="col" className="hidden @lg:table-cell">
                Day range
              </th>
              <th scope="col">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {symbols.map((symbol) => (
              <Row
                key={symbol}
                symbol={symbol}
                quote={quotes.get(symbol)}
                loading={loading}
                missing={error ? "—" : "No data"}
                onOpen={() => onOpen({ fn: "GP", symbol, args: [] })}
                onRemove={() => save(removeSymbol(symbols, symbol))}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

interface RowProps {
  symbol: string;
  quote?: Quote;
  loading: boolean;
  /** Shown as the last price when there's no quote. */
  missing: string;
  onOpen: () => void;
  onRemove: () => void;
}

function Row({ symbol, quote, loading, missing, onOpen, onRemove }: RowProps) {
  return (
    <tr onClick={onOpen} className="cursor-pointer hover:bg-border">
      <td className="text-left">
        {/* Tells screen readers the row opens something; the click bubbles up to the row. */}
        <button
          type="button"
          title={quote?.name}
          className="font-semibold text-amber focus-visible:outline focus-visible:outline-amber"
        >
          {symbol}
        </button>
      </td>
      <QuoteCells quote={quote} loading={loading} missing={missing} />
      <td className="hidden @md:table-cell">{quote?.volume ? formatCompact(quote.volume) : "—"}</td>
      <td className="hidden @lg:table-cell">{dayRange(quote)}</td>
      <td className="w-px">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove ${symbol}`}
          title={`Remove ${symbol}`}
          className="rounded-sm px-1 text-muted hover:bg-border hover:text-down"
        >
          ×
        </button>
      </td>
    </tr>
  );
}

function dayRange(quote?: Quote) {
  if (quote?.dayLow === undefined || quote.dayHigh === undefined) return "—";
  const decimals = priceDecimals(quote.price);
  return `${formatPrice(quote.dayLow, decimals)} – ${formatPrice(quote.dayHigh, decimals)}`;
}

"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { type Command, tickerCommand } from "@/lib/commands";
import { fetchApi } from "@/lib/fetchApi";
import { formatCompact } from "@/lib/format";
import type { MoverType, Quote } from "@/lib/types";
import { QUOTE_TABLE, QuoteCells, QuotesError } from "./quotes";
import { Toggle } from "./Toggle";

const REFRESH = 60_000;
const LISTS: { type: MoverType; label: string }[] = [
  { type: "gainers", label: "Gainers" },
  { type: "losers", label: "Losers" },
  { type: "actives", label: "Most active" },
];

/** The day's top US stocks, one list at a time. Clicking a row opens its thesis check here. */
export function TopMovers({ onOpen }: { onOpen: (command: Command) => void }) {
  const [type, setType] = useState<MoverType>("gainers");
  const { data, error } = useQuery({
    queryKey: ["movers", type],
    queryFn: async () => (await fetchApi<{ quotes: Quote[] }>(`/api/movers?type=${type}`)).quotes,
    refetchInterval: REFRESH,
    // Fresh until the next poll, so switching windows doesn't refetch it.
    staleTime: REFRESH,
  });

  return (
    <div className="@container flex flex-col gap-2">
      <div role="group" aria-label="List" className="flex items-center gap-0.5 text-xs">
        {LISTS.map(({ type: list, label }) => (
          <Toggle key={list} pressed={list === type} onClick={() => setType(list)}>
            {label}
          </Toggle>
        ))}
      </div>

      <QuotesError error={error} hasData={data !== undefined} />

      {data === undefined && !error && (
        <p role="status" className="text-muted">
          Loading…
        </p>
      )}
      {data?.length === 0 && (
        <p role="status" className="text-muted">
          Yahoo has no stocks on this list right now.
        </p>
      )}
      {data && data.length > 0 && (
        <table className={QUOTE_TABLE}>
          <thead className="text-xs text-muted">
            <tr className="border-b border-border">
              <th scope="col" className="text-left">
                Symbol
              </th>
              <th scope="col" className="hidden text-left @lg:table-cell">
                Name
              </th>
              <th scope="col">Last</th>
              <th scope="col">Change</th>
              <th scope="col">% Change</th>
              <th scope="col" className="hidden @md:table-cell">
                Volume
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((quote) => (
              <tr
                key={quote.symbol}
                onClick={() => onOpen(tickerCommand(quote.symbol))}
                className="cursor-pointer hover:bg-border"
              >
                <td className="text-left">
                  {/* Tells screen readers the row opens something; the click bubbles up to the row. */}
                  <button
                    type="button"
                    title={quote.name}
                    className="font-semibold text-amber focus-visible:outline focus-visible:outline-amber"
                  >
                    {quote.symbol}
                  </button>
                </td>
                {/* Takes the spare width, so a long company name is what gives way. */}
                <td className="hidden w-full max-w-0 truncate text-left text-muted @lg:table-cell">{quote.name}</td>
                <QuoteCells quote={quote} loading={false} />
                <td className="hidden @md:table-cell">{quote.volume ? formatCompact(quote.volume) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

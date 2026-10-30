"use client";

import { useMemo } from "react";
import type { Command } from "@/lib/commands";
import { formatUpdated } from "@/lib/format";
import type { MonitorGroup } from "@/lib/monitors";
import { QUOTE_TABLE, QuoteCells, QuotesError, useQuotes } from "./quotes";

interface QuoteMonitorProps {
  groups: MonitorGroup[];
  onOpen: (command: Command) => void;
}

/** A fixed list of instruments in titled groups. Clicking a row opens its chart here. */
export function QuoteMonitor({ groups, onOpen }: QuoteMonitorProps) {
  const symbols = useMemo(() => groups.flatMap((group) => group.items.map((item) => item.symbol)), [groups]);
  const { quotes, error, hasData, loading, updatedAt } = useQuotes(symbols);

  return (
    <div className="@container flex flex-col gap-2">
      <QuotesError error={error} hasData={hasData} />
      <table className={QUOTE_TABLE}>
        <thead className="text-xs text-muted">
          <tr className="border-b border-border">
            <th scope="col" className="text-left">
              Name
            </th>
            <th scope="col">Last</th>
            <th scope="col">Change</th>
            <th scope="col">% Change</th>
            <th scope="col" className="hidden @md:table-cell">
              Time
            </th>
          </tr>
        </thead>
        {groups.map((group) => (
          <tbody key={group.title}>
            <tr>
              <th colSpan={5} scope="rowgroup" className="pt-2! text-left text-xs tracking-wider text-muted uppercase">
                {group.title}
              </th>
            </tr>
            {group.items.map(({ symbol, name }) => {
              const quote = quotes.get(symbol);
              return (
                <tr
                  key={symbol}
                  onClick={() => onOpen({ fn: "GP", symbol, args: [] })}
                  className="cursor-pointer hover:bg-border"
                >
                  {/* In a narrow panel, the name is what gives way. */}
                  <td className="w-full max-w-0 text-left @md:w-auto @md:max-w-none">
                    {/* Tells screen readers the row opens something; the click bubbles up to the row. */}
                    <button
                      type="button"
                      title={symbol}
                      className="block max-w-full truncate font-semibold text-amber focus-visible:outline focus-visible:outline-amber"
                    >
                      {name}
                    </button>
                  </td>
                  <QuoteCells quote={quote} loading={loading} />
                  <td className="hidden text-muted @md:table-cell">
                    {quote?.time === undefined ? "—" : formatUpdated(quote.time, new Date(updatedAt))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </div>
  );
}

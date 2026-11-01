"use client";

import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { fetchApi } from "@/lib/fetchApi";
import { filingsUrl, formName, isInsiderForm, type FilingFilter } from "@/lib/filings";
import type { Filings } from "@/lib/types";
import { QuoteLine } from "./QuoteLine";
import { SourceError } from "./SourceError";
import { Toggle } from "./Toggle";

// The server keeps a company's list for an hour.
const STALE_AFTER = 60 * 60_000;

/** CF and INS: a company's recent SEC filings of the chosen kind, each linking to its document. `controls` go above the filters. */
export function FilingsList({ symbol, filters, controls }: { symbol: string; filters: FilingFilter[]; controls?: ReactNode }) {
  const [filter, setFilter] = useState(filters[0]);
  // No placeholder data: another company's filings must never show under this one's name.
  const filings = useQuery({
    queryKey: ["filings", symbol, filter.forms],
    queryFn: () => fetchApi<Filings>(filingsUrl(symbol, filter.forms)),
    staleTime: STALE_AFTER,
  });

  return (
    <div className="flex h-full flex-col gap-1.5">
      <QuoteLine symbol={symbol} />
      {controls}
      <div role="group" aria-label="Form" className="flex flex-wrap items-center gap-0.5 text-xs">
        {filters.map((option) => (
          <Toggle key={option.label} pressed={option === filter} onClick={() => setFilter(option)}>
            {option.label}
          </Toggle>
        ))}
      </div>

      {filings.isPending && (
        <p role="status" className="text-muted">
          Loading filings…
        </p>
      )}
      {filings.isError && <SourceError error={filings.error} />}
      {filings.data && <FilingsTable data={filings.data} />}
    </div>
  );
}

function FilingsTable({ data: { symbol, filings, filesAsHolder } }: { data: Filings }) {
  if (filings.length === 0) {
    return (
      <p role="status" className="text-muted">
        No matching forms in {symbol}&apos;s recent SEC filings.
      </p>
    );
  }
  return (
    <>
      {/* Keeps a usable height in a short panel, which then scrolls to it. */}
      <div className="@container min-h-40 flex-1 overflow-auto">
        <table className="w-full text-left whitespace-nowrap [&_td]:px-1.5 [&_td]:py-0.5 [&_th]:px-1.5 [&_th]:py-0.5 [&_th]:font-normal">
          <thead className="sticky top-0 bg-background text-xs text-muted">
            <tr className="border-b border-border">
              <th scope="col">Form</th>
              <th scope="col">Filed</th>
              <th scope="col">Report date</th>
              <th scope="col" className="hidden w-full @md:table-cell">
                Type
              </th>
            </tr>
          </thead>
          <tbody>
            {filings.map(({ form, filed, reportDate, url }) => (
              <tr key={url}>
                <td>
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`${form}, filed ${filed}, on sec.gov`}
                    className="block text-link hover:underline"
                  >
                    {form}
                  </a>
                </td>
                <td>{filed}</td>
                <td>{reportDate ?? "—"}</td>
                <td className="hidden text-muted @md:table-cell">{formName(form)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        Up to 100, newest first, from the SEC&apos;s recent list, which goes back at least a year. Links open on sec.gov
        in a new tab.
        {filesAsHolder &&
          filings.some(({ form }) => isInsiderForm(form)) &&
          ` ${symbol} also files these as a large holder of other companies' stock, so a row may be about one of them.`}
      </p>
    </>
  );
}

"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { fetchApi, FetchError } from "@/lib/fetchApi";
import { keyStats } from "@/lib/keyStats";
import {
  formatCell,
  notAvailableMessage,
  STATEMENT_TABS,
  statementView,
  type StatementRow,
  type StatementTab,
} from "@/lib/statements";
import { FINANCIAL_PERIODS, type FinancialPeriod, type Financials, type Profile } from "@/lib/types";
import { QuoteLine } from "./QuoteLine";
import { Toggle } from "./Toggle";
import { useProfile } from "./useProfile";

// Filings only change a few times a year.
const STALE_AFTER = 60 * 60_000;
const RATIOS = new Set([
  "Market cap",
  "P/E (TTM)",
  "Forward P/E",
  "EPS (TTM)",
  "Dividend yield",
  "Gross margin",
  "Operating margin",
  "Profit margin",
]);
const PERIOD_LABELS: Record<FinancialPeriod, string> = { annual: "Annual", quarterly: "Quarterly" };

/** FA: income statement, balance sheet and cash flow from SEC filings, with ratios on top. */
export function FinancialStatements({ symbol }: { symbol: string }) {
  const [tab, setTab] = useState<StatementTab>("income");
  const [period, setPeriod] = useState<FinancialPeriod>("annual");
  const profile = useProfile(symbol);
  // No placeholder data: another company's numbers must never show under this one's name.
  const financials = useQuery({
    queryKey: ["financials", symbol, period],
    queryFn: () => fetchApi<Financials>(`/api/financials?symbol=${encodeURIComponent(symbol)}&period=${period}`),
    staleTime: STALE_AFTER,
  });

  return (
    <div className="flex h-full flex-col gap-1.5">
      <QuoteLine symbol={symbol} />
      {profile.data && <Ratios profile={profile.data} />}
      <div role="toolbar" aria-label="Statement options" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <div role="group" aria-label="Statement" className="flex items-center gap-0.5">
          {STATEMENT_TABS.map(({ key, label }) => (
            <Toggle key={key} pressed={key === tab} onClick={() => setTab(key)}>
              {label}
            </Toggle>
          ))}
        </div>
        <div role="group" aria-label="Period" className="flex items-center gap-0.5">
          {FINANCIAL_PERIODS.map((option) => (
            <Toggle key={option} pressed={option === period} onClick={() => setPeriod(option)}>
              {PERIOD_LABELS[option]}
            </Toggle>
          ))}
        </div>
      </div>

      {financials.isPending && (
        <p role="status" className="text-muted">
          Loading statements…
        </p>
      )}
      {financials.isError && <StatementsError error={financials.error} type={profile.data?.type} />}
      {financials.data && <Statement financials={financials.data} tab={tab} />}
    </div>
  );
}

function Ratios({ profile }: { profile: Profile }) {
  const ratios = keyStats(profile).filter(([label, value]) => RATIOS.has(label) && value !== undefined);
  return (
    <dl aria-label="Ratios" className="flex flex-wrap gap-x-4 text-xs">
      {ratios.map(([label, value]) => (
        <div key={label} className="flex gap-1.5 whitespace-nowrap">
          <dt className="text-muted">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function StatementsError({ error, type }: { error: Error; type: string | undefined }) {
  // "Not available" is an answer, not a failure, so it doesn't read as an alarm.
  if (error instanceof FetchError && error.status === 404) {
    return (
      <p role="status" className="text-muted">
        {notAvailableMessage(type) ?? error.message}
      </p>
    );
  }
  return (
    <p role="alert" className="text-down">
      {error.message}
    </p>
  );
}

function Statement({ financials, tab }: { financials: Financials; tab: StatementTab }) {
  const { periods, rows } = statementView(financials, tab);
  return (
    <>
      {/* Keeps a usable height in a short panel, which then scrolls to it. */}
      <div className="min-h-40 flex-1 overflow-auto">
        <table className="w-full text-right whitespace-nowrap [&_td]:px-1.5 [&_td]:py-0.5 [&_th]:px-1.5 [&_th]:py-0.5">
          <thead className="sticky top-0 bg-background text-xs text-muted">
            <tr className="border-b border-border">
              <th scope="col" className="sticky left-0 bg-background text-left font-normal">
                USD millions
              </th>
              {periods.map(({ end, label }) => (
                <th key={end} scope="col" title={`Ended ${end}`} className="font-normal">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Row key={row.key} row={row} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        From SEC filings. Per-share figures are in dollars, not adjusted for later stock splits.
        {financials.period === "quarterly" &&
          " Q4 and quarterly cash flow are worked out from year-to-date totals."}
      </p>
    </>
  );
}

function Row({ row }: { row: StatementRow }) {
  const derivedRatio = row.kind === "margin" || row.kind === "growth";
  return (
    <tr className={row.total ? "font-semibold" : derivedRatio ? "text-muted" : ""}>
      <th scope="row" className={`sticky left-0 bg-background text-left ${row.total ? "font-semibold" : "font-normal"}`}>
        {row.label}
      </th>
      {row.values.map((value, i) => (
        <td key={i} className={row.kind === "growth" ? growthTone(value) : ""}>
          {formatCell(row.kind, value)}
        </td>
      ))}
    </tr>
  );
}

function growthTone(value: number | null) {
  if (value === null || value === 0) return "";
  return value > 0 ? "text-up" : "text-down";
}

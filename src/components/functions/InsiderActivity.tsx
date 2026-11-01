"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { fetchApi } from "@/lib/fetchApi";
import { INSIDER_FILTERS } from "@/lib/filings";
import { formatCompact, formatInteger, formatPrice } from "@/lib/format";
import { codeName } from "@/lib/form4";
import type { InsiderTrade, InsiderTrades } from "@/lib/types";
import { FilingsList } from "./FilingsList";
import { QuoteLine } from "./QuoteLine";
import { SourceError } from "./SourceError";
import { Toggle } from "./Toggle";

// The server keeps a company's list for an hour, and each filing for a day.
const STALE_AFTER = 60 * 60_000;

type View = "trades" | "filings";

/** INS: what insiders bought and sold, from their Form 4s, or the list of their filings. */
export function InsiderActivity({ symbol }: { symbol: string }) {
  const [view, setView] = useState<View>("trades");
  const controls = (
    <div role="group" aria-label="View" className="flex items-center gap-0.5 text-xs">
      <Toggle pressed={view === "trades"} onClick={() => setView("trades")}>
        Trades
      </Toggle>
      <Toggle pressed={view === "filings"} onClick={() => setView("filings")}>
        Filings
      </Toggle>
    </div>
  );
  if (view === "filings") return <FilingsList symbol={symbol} filters={INSIDER_FILTERS} controls={controls} />;
  return (
    <div className="flex h-full flex-col gap-1.5">
      <QuoteLine symbol={symbol} />
      {controls}
      <Trades symbol={symbol} />
    </div>
  );
}

function Trades({ symbol }: { symbol: string }) {
  const trades = useQuery({
    queryKey: ["insider-trades", symbol],
    queryFn: () => fetchApi<InsiderTrades>(`/api/insider-trades?symbol=${encodeURIComponent(symbol)}`),
    staleTime: STALE_AFTER,
  });

  if (trades.isPending) {
    return (
      <p role="status" className="text-muted">
        Reading Form 4 filings… The first time takes a few seconds: each filing is a request to the SEC.
      </p>
    );
  }
  if (trades.isError) return <SourceError error={trades.error} />;

  const { name, trades: rows, filings, skipped, aboutOthers, since } = trades.data;
  if (filings === 0 || rows.length === 0) {
    return (
      <p role="status" className="text-muted">
        {filings === 0
          ? `No Form 4 filings in ${symbol}'s recent SEC filings.`
          : `${symbol}'s latest ${filings} Form 4 filings have no common-stock trades of its own.`}
      </p>
    );
  }
  return (
    <>
      <p className="text-xs text-muted">
        {formatInteger(rows.length)} trades in {name}&apos;s latest {filings} Form 4 filings, back to {since}.
        {skipped > 0 && <span className="text-down"> {skipped === 1 ? "1 filing" : `${skipped} filings`} couldn&apos;t be read.</span>}
      </p>
      {/* Keeps a usable height in a short panel, which then scrolls to it. */}
      <div className="@container min-h-40 flex-1 overflow-auto">
        <table className="w-full text-right whitespace-nowrap [&_td]:px-1 [&_td]:py-0.5 [&_th]:px-1 [&_th]:py-0.5 [&_th]:font-normal">
          <thead className="sticky top-0 bg-background text-xs text-muted">
            <tr className="border-b border-border">
              <th scope="col" className="hidden text-left @md:table-cell">
                Date
              </th>
              <th scope="col" className="text-left">
                Insider
              </th>
              <th scope="col" className="text-left">
                Transaction
              </th>
              <th scope="col">Shares</th>
              <th scope="col" className="hidden @md:table-cell">
                Price
              </th>
              <th scope="col">Value</th>
              <th scope="col" className="hidden @2xl:table-cell">
                Held after
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((trade, i) => (
              <Row key={`${trade.url}-${i}`} trade={trade} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        Common stock only: options and other derivatives aren&apos;t shown, and neither are amended filings. Names are as
        filed, usually last name first. Value is shares × price, where the filing gives a price; grants and gifts are filed
        at $0.
        {aboutOthers > 0 &&
          ` ${aboutOthers} of the filings were about other companies' stock, which ${symbol} holds, and are left out.`}{" "}
        Dates link to the filing on sec.gov.
      </p>
    </>
  );
}

const TONE: Record<string, string> = { P: "text-up", S: "text-down" };

function Row({ trade }: { trade: InsiderTrade }) {
  const { date, insider, role, code, acquired, shares, price, sharesAfter, direct, url } = trade;
  const value = price ? shares * price : undefined;
  const link = (
    <a href={url} target="_blank" rel="noreferrer" aria-label={`${date}, filing on sec.gov`} className="text-link hover:underline">
      {date}
    </a>
  );
  return (
    <tr>
      <td className="hidden text-left @md:table-cell">{link}</td>
      {/* Takes the spare width, so a long name is what gives way. */}
      <td className="w-full max-w-0 text-left">
        <span className="block truncate" title={insider}>
          {insider}
        </span>
        <span className="block truncate text-xs text-muted" title={role}>
          {[role, direct ? undefined : "indirect"].filter(Boolean).join(" · ")}
        </span>
      </td>
      {/* In a narrow panel the name may wrap, and the date sits under it. */}
      <td className="text-left whitespace-normal @md:whitespace-nowrap">
        <span className={TONE[code]}>{codeName(code)}</span>
        <span className="block text-xs @md:hidden">{link}</span>
      </td>
      <td className={TONE[code]}>{`${acquired ? "+" : "-"}${formatInteger(shares)}`}</td>
      <td className="hidden @md:table-cell">{price === undefined ? "—" : formatPrice(price, 2)}</td>
      <td>{value === undefined ? "—" : `$${formatCompact(value)}`}</td>
      <td className="hidden text-muted @2xl:table-cell">{sharesAfter === undefined ? "—" : formatInteger(sharesAfter)}</td>
    </tr>
  );
}

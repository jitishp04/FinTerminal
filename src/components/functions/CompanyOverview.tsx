"use client";

import { useQuery } from "@tanstack/react-query";
import { Fragment } from "react";
import { fetchApi } from "@/lib/fetchApi";
import { formatInteger } from "@/lib/format";
import { keyStats, typeLabel } from "@/lib/keyStats";
import type { Profile } from "@/lib/types";
import { QuoteLine } from "./QuoteLine";

const REFRESH = 10 * 60_000;

/** DES: what the company or fund is, and its key stats. */
export function CompanyOverview({ symbol }: { symbol: string }) {
  const profile = useQuery({
    queryKey: ["profile", symbol],
    queryFn: () => fetchApi<Profile>(`/api/profile?symbol=${encodeURIComponent(symbol)}`),
    refetchInterval: REFRESH,
    // Fresh until the next poll, so switching windows doesn't refetch it.
    staleTime: REFRESH,
  });

  if (profile.isPending) return <p className="text-muted">Loading overview…</p>;
  if (profile.isError) return <p role="alert">{profile.error.message}</p>;

  const p = profile.data;
  const site = webLink(p.website);
  const facts = [
    p.type === "EQUITY" ? undefined : typeLabel(p.type),
    p.sector,
    p.industry,
    p.category,
    p.exchange,
    p.country,
    p.employees === undefined ? undefined : `${formatInteger(p.employees)} employees`,
  ].filter(Boolean);

  return (
    <div className="@container flex flex-col gap-2">
      <QuoteLine symbol={symbol} />
      <p className="text-muted">
        {facts.join(" · ")}
        {site && (
          <>
            {" · "}
            <a href={site.href} target="_blank" rel="noreferrer" className="text-link hover:underline">
              {site.label}
            </a>
          </>
        )}
      </p>
      <div className="grid gap-x-6 gap-y-3 @xl:grid-cols-[auto_minmax(0,1fr)]">
        <dl aria-label="Key stats" className="grid grid-cols-[auto_auto] gap-x-4 self-start">
          {keyStats(p).map(([label, value]) => (
            <Fragment key={label}>
              <dt className="text-muted">{label}</dt>
              <dd className="text-right whitespace-nowrap">{value ?? "—"}</dd>
            </Fragment>
          ))}
        </dl>
        {p.description ? (
          <p className="leading-relaxed">{p.description}</p>
        ) : (
          <p className="text-muted">Yahoo has no description for this {typeLabel(p.type).toLowerCase()}.</p>
        )}
      </div>
    </div>
  );
}

/** An http(s) website as a link and a short label (`microsoft.com`), or nothing if it isn't one. */
function webLink(website: string | undefined) {
  if (!website) return undefined;
  try {
    const url = new URL(website);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    return { href: url.href, label: url.hostname.replace(/^www\./, "") };
  } catch {
    return undefined;
  }
}

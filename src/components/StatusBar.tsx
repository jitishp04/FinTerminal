"use client";

import { useQuery } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { fetchApi } from "@/lib/fetchApi";
import { formatUpdated } from "@/lib/format";
import { movingNow } from "@/lib/live";
import { isUsMarketOpen } from "@/lib/market";
import type { SourceHealth } from "@/lib/sources";
import { useLiveSnapshot } from "./functions/useLive";

const HEALTH_REFRESH = 10_000;

const DOTS: Record<SourceHealth["state"], string> = {
  ok: "bg-up",
  down: "bg-down",
  idle: "bg-muted",
  off: "border border-muted",
};

// The current time in whole seconds; null while rendering on the server.
function subscribeClock(onTick: () => void) {
  const id = setInterval(onTick, 1000);
  return () => clearInterval(id);
}
const getSeconds = () => Math.floor(Date.now() / 1000);
const getServerSeconds = () => null;

const TIME = { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" } as const;
const LOCAL = new Intl.DateTimeFormat(undefined, TIME);
const NEW_YORK = new Intl.DateTimeFormat("en-US", { ...TIME, timeZone: "America/New_York" });

const HINTS = [
  ["Type", "search"],
  ["Tab", "next panel"],
  ["Esc", "clear"],
  ["Double-click title", "maximize"],
] as const;

/** A source's status in words: for a narrow bar's tooltip, and for screen readers. */
function describe({ name, state, lastOk }: SourceHealth, now: Date | null): string {
  const answered = lastOk && now ? `, last answered ${formatUpdated(lastOk / 1000, now)}` : "";
  if (state === "ok") return `${name}: working${answered}`;
  if (state === "down") return `${name}: not responding${answered}`;
  if (state === "off") return `${name}: needs a setting in .env.local`;
  return `${name}: not used yet`;
}

function Sources({ now }: { now: Date | null }) {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: async () => (await fetchApi<{ sources: SourceHealth[] }>("/api/health")).sources,
    refetchInterval: HEALTH_REFRESH,
  });

  if (health.isError) return <span className="text-down">SERVER UNREACHABLE</span>;
  return (
    <ul aria-label="Data sources" className="hidden items-center gap-3 md:flex">
      {health.data?.map((source) => (
        <li key={source.id} title={describe(source, now)} className="flex items-center gap-1.5">
          <span aria-hidden className={`size-2 rounded-full ${DOTS[source.state]}`} />
          <span aria-hidden>{source.id.toUpperCase()}</span>
          <span className="sr-only">{describe(source, now)}</span>
          <span aria-hidden className={`hidden xl:inline ${source.state === "down" ? "text-down" : "text-foreground"}`}>
            {source.state === "ok" && source.lastOk && now ? formatUpdated(source.lastOk / 1000, now) : ""}
            {source.state === "down" ? "DOWN" : ""}
            {source.state === "off" ? "NO KEY" : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** How many symbols move with each trade right now, while any do. */
function Live({ marketOpen }: { marketOpen: boolean }) {
  const size = movingNow(useLiveSnapshot().live, marketOpen);
  if (size === 0) return null;
  return (
    <span
      title={`${size} ${size === 1 ? "symbol streams" : "symbols stream"} live: US stocks from Finnhub in the regular session, crypto from Coinbase around the clock.`}
      className="hidden text-up sm:inline"
    >
      LIVE {size}
    </span>
  );
}

export function StatusBar() {
  const seconds = useSyncExternalStore(subscribeClock, getSeconds, getServerSeconds);
  const now = seconds === null ? null : new Date(seconds * 1000);
  const open = now !== null && isUsMarketOpen(now);

  return (
    <footer className="flex items-center gap-4 border-t border-border bg-panel px-3 py-0.5 whitespace-nowrap text-muted">
      <ul aria-label="Shortcuts" className="hidden items-center gap-3 2xl:flex">
        {HINTS.map(([key, action]) => (
          <li key={key}>
            <kbd className="rounded-sm border border-border px-1 font-mono text-foreground">{key}</kbd> {action}
          </li>
        ))}
      </ul>
      <Sources now={now} />
      <Live marketOpen={open} />
      <span title="Yahoo and Finnhub prices can lag the market, by 15 minutes or more on some exchanges." className="hidden lg:inline">
        PRICES MAY BE DELAYED
      </span>
      <span className="ml-auto hidden sm:inline">
        LOCAL <span className="text-foreground">{now ? LOCAL.format(now) : "--:--:--"}</span>
      </span>
      <span className="ml-auto sm:ml-0">
        NEW YORK <span className="text-foreground">{now ? NEW_YORK.format(now) : "--:--:--"}</span>
      </span>
      <span>
        US MARKET{" "}
        {now ? <span className={open ? "text-up" : "text-down"}>{open ? "OPEN" : "CLOSED"}</span> : "--"}
      </span>
    </footer>
  );
}

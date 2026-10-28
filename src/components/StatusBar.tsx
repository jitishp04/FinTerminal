"use client";

import { useSyncExternalStore } from "react";
import { isUsMarketOpen } from "@/lib/market";

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

export function StatusBar() {
  const seconds = useSyncExternalStore(subscribeClock, getSeconds, getServerSeconds);
  const now = seconds === null ? null : new Date(seconds * 1000);
  const open = now !== null && isUsMarketOpen(now);

  return (
    <footer className="flex items-center gap-4 border-t border-border bg-panel px-3 py-0.5 text-muted">
      <span>
        LOCAL <span className="text-foreground">{now ? LOCAL.format(now) : "--:--:--"}</span>
      </span>
      <span>
        NEW YORK <span className="text-foreground">{now ? NEW_YORK.format(now) : "--:--:--"}</span>
      </span>
      <span>
        US MARKET{" "}
        {now ? <span className={open ? "text-up" : "text-down"}>{open ? "OPEN" : "CLOSED"}</span> : "--"}
      </span>
    </footer>
  );
}

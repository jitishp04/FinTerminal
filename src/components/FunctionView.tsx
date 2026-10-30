"use client";

import dynamic from "next/dynamic";
import { commandTitle, type Command } from "@/lib/commands";
import { FUNCTION_BY_CODE } from "@/lib/functions";
import { WORLD_INDICES } from "@/lib/monitors";
import { Help } from "./functions/Help";

// Data panels fetch in the browser (and the chart draws on a canvas), so they never render on the server.
const PriceChart = dynamic(() => import("./functions/PriceChart").then((m) => m.PriceChart), {
  ssr: false,
  loading: () => <p className="text-muted">Loading chart…</p>,
});
const CompanyOverview = dynamic(() => import("./functions/CompanyOverview").then((m) => m.CompanyOverview), {
  ssr: false,
  loading: () => <p className="text-muted">Loading overview…</p>,
});
const Watchlist = dynamic(() => import("./functions/Watchlist").then((m) => m.Watchlist), {
  ssr: false,
  loading: () => <p className="text-muted">Loading watchlist…</p>,
});
const QuoteMonitor = dynamic(() => import("./functions/QuoteMonitor").then((m) => m.QuoteMonitor), {
  ssr: false,
  loading: () => <p className="text-muted">Loading prices…</p>,
});

export function FunctionView({ command, onOpen }: { command: Command; onOpen: (command: Command) => void }) {
  if (command.fn === "HELP") return <Help onOpen={onOpen} />;
  if (command.fn === "GP" && command.symbol) return <PriceChart symbol={command.symbol} />;
  if (command.fn === "DES" && command.symbol) return <CompanyOverview symbol={command.symbol} />;
  if (command.fn === "W") return <Watchlist onOpen={onOpen} />;
  if (command.fn === "WEI") return <QuoteMonitor groups={WORLD_INDICES} onOpen={onOpen} />;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
      <p className="font-semibold">{commandTitle(command)}</p>
      <p className="text-muted">{FUNCTION_BY_CODE.get(command.fn)?.description}</p>
      <p className="mt-3 text-xs text-muted">Coming soon: this panel fills in once its data source is connected.</p>
    </div>
  );
}

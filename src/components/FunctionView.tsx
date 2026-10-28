"use client";

import dynamic from "next/dynamic";
import { commandTitle, type Command } from "@/lib/commands";
import { FUNCTION_BY_CODE } from "@/lib/functions";
import { Help } from "./functions/Help";

// The chart draws on a canvas and fetches in the browser, so it never renders on the server.
const PriceChart = dynamic(() => import("./functions/PriceChart").then((m) => m.PriceChart), {
  ssr: false,
  loading: () => <p className="text-muted">Loading chart…</p>,
});

export function FunctionView({ command, onOpen }: { command: Command; onOpen: (command: Command) => void }) {
  if (command.fn === "HELP") return <Help onOpen={onOpen} />;
  if (command.fn === "GP" && command.symbol) return <PriceChart symbol={command.symbol} />;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
      <p className="font-semibold">{commandTitle(command)}</p>
      <p className="text-muted">{FUNCTION_BY_CODE.get(command.fn)?.description}</p>
      <p className="mt-3 text-xs text-muted">Coming soon: this panel fills in once its data source is connected.</p>
    </div>
  );
}

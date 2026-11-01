"use client";

import dynamic from "next/dynamic";
import type { Command } from "@/lib/commands";
import { FILING_FILTERS, INSIDER_FILTERS } from "@/lib/filings";
import { MONITORS } from "@/lib/monitors";
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
const FinancialStatements = dynamic(
  () => import("./functions/FinancialStatements").then((m) => m.FinancialStatements),
  { ssr: false, loading: () => <p className="text-muted">Loading statements…</p> },
);
const FilingsList = dynamic(() => import("./functions/FilingsList").then((m) => m.FilingsList), {
  ssr: false,
  loading: () => <p className="text-muted">Loading filings…</p>,
});
const DcaBacktest = dynamic(() => import("./functions/DcaBacktest").then((m) => m.DcaBacktest), {
  ssr: false,
  loading: () => <p className="text-muted">Loading price history…</p>,
});
const DcfValuation = dynamic(() => import("./functions/DcfValuation").then((m) => m.DcfValuation), {
  ssr: false,
  loading: () => <p className="text-muted">Loading filings and prices…</p>,
});
const MacroDashboard = dynamic(() => import("./functions/MacroDashboard").then((m) => m.MacroDashboard), {
  ssr: false,
  loading: () => <p className="text-muted">Loading indicators…</p>,
});
const MacroChart = dynamic(() => import("./functions/MacroChart").then((m) => m.MacroChart), {
  ssr: false,
  loading: () => <p className="text-muted">Loading chart…</p>,
});
const YieldCurve = dynamic(() => import("./functions/YieldCurve").then((m) => m.YieldCurve), {
  ssr: false,
  loading: () => <p className="text-muted">Loading yield curve…</p>,
});
const Watchlist =dynamic(() => import("./functions/Watchlist").then((m) => m.Watchlist), {
  ssr: false,
  loading: () => <p className="text-muted">Loading watchlist…</p>,
});
const QuoteMonitor = dynamic(() => import("./functions/QuoteMonitor").then((m) => m.QuoteMonitor), {
  ssr: false,
  loading: () => <p className="text-muted">Loading prices…</p>,
});
const SectorHeatmap = dynamic(() => import("./functions/SectorHeatmap").then((m) => m.SectorHeatmap), {
  ssr: false,
  loading: () => <p className="text-muted">Loading sectors…</p>,
});
const SectorRotation = dynamic(() => import("./functions/SectorRotation").then((m) => m.SectorRotation), {
  ssr: false,
  loading: () => <p className="text-muted">Loading sectors…</p>,
});
const TopMovers = dynamic(() => import("./functions/TopMovers").then((m) => m.TopMovers), {
  ssr: false,
  loading: () => <p className="text-muted">Loading movers…</p>,
});

export function FunctionView({ command, onOpen }: { command: Command; onOpen: (command: Command) => void }) {
  if (command.fn === "HELP") return <Help onOpen={onOpen} />;
  if (command.fn === "GP" && command.symbol) return <PriceChart symbol={command.symbol} />;
  if (command.fn === "DES" && command.symbol) return <CompanyOverview symbol={command.symbol} />;
  if (command.fn === "FA" && command.symbol) return <FinancialStatements symbol={command.symbol} />;
  // Keyed so that going from one to the other resets the chosen filter, which belongs to the first.
  if (command.fn === "CF" && command.symbol) return <FilingsList key="CF" symbol={command.symbol} filters={FILING_FILTERS} />;
  if (command.fn === "INS" && command.symbol) return <FilingsList key="INS" symbol={command.symbol} filters={INSIDER_FILTERS} />;
  if (command.fn === "DCA" && command.symbol) return <DcaBacktest symbol={command.symbol} />;
  if (command.fn === "DCF" && command.symbol) return <DcfValuation symbol={command.symbol} />;
  if (command.fn === "ECO") {
    return command.args[0] ? <MacroChart id={command.args[0]} /> : <MacroDashboard onOpen={onOpen} />;
  }
  if (command.fn === "CURV") return <YieldCurve />;
  if (command.fn === "W") return <Watchlist onOpen={onOpen} />;
  if (command.fn === "SECT") return <SectorHeatmap onOpen={onOpen} />;
  if (command.fn === "ROT") return <SectorRotation onOpen={onOpen} />;
  if (command.fn === "MOST") return <TopMovers onOpen={onOpen} />;
  const monitor = MONITORS[command.fn];
  return monitor ? <QuoteMonitor groups={monitor} onOpen={onOpen} /> : null;
}

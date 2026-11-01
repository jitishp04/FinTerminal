"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { OVERLAYS, type Overlay } from "@/lib/chartData";
import { fetchApi, pollEvery } from "@/lib/fetchApi";
import { CHART_RANGES, type Chart, type ChartRange } from "@/lib/types";
import { CandleChart, OVERLAY_COLORS, type ChartStyle } from "./CandleChart";
import { QuoteLine } from "./QuoteLine";
import { Toggle } from "./Toggle";

const MINUTE = 60_000;
const STYLES: ChartStyle[] = ["Candles", "Line"];

/** GP: the last price, then a chart with ranges, moving averages and volume. */
export function PriceChart({ symbol }: { symbol: string }) {
  const [range, setRange] = useState<ChartRange>("6M");
  const [style, setStyle] = useState<ChartStyle>("Candles");
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const query = encodeURIComponent(symbol);
  const chartRefresh = range === "1D" || range === "5D" ? MINUTE : 10 * MINUTE;

  const chart = useQuery({
    queryKey: ["chart", symbol, range],
    queryFn: () => fetchApi<Chart>(`/api/chart?symbol=${query}&range=${range}`),
    refetchInterval: pollEvery(chartRefresh),
    // Fresh until the next poll, so switching windows doesn't refetch it.
    staleTime: chartRefresh,
    // Keep the last chart on screen while the next symbol or range loads.
    placeholderData: keepPreviousData,
  });

  const toggle = (name: Overlay) =>
    setOverlays((on) => (on.includes(name) ? on.filter((o) => o !== name) : [...on, name]));

  return (
    <div className="flex h-full flex-col gap-1.5">
      <QuoteLine symbol={symbol} />
      <div role="toolbar" aria-label="Chart options" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <Group label="Range">
          {CHART_RANGES.map((r) => (
            <Toggle key={r} pressed={r === range} onClick={() => setRange(r)}>
              {r}
            </Toggle>
          ))}
        </Group>
        <Group label="Chart style">
          {STYLES.map((s) => (
            <Toggle key={s} pressed={s === style} onClick={() => setStyle(s)}>
              {s}
            </Toggle>
          ))}
        </Group>
        <Group label="Moving averages">
          {(Object.keys(OVERLAYS) as Overlay[]).map((name) => (
            <Toggle key={name} pressed={overlays.includes(name)} onClick={() => toggle(name)}>
              <span
                aria-hidden
                className="mr-1 inline-block size-2 rounded-full"
                style={{ backgroundColor: `var(${OVERLAY_COLORS[name]})` }}
              />
              {name}
            </Toggle>
          ))}
        </Group>
        <span role="status" className="text-muted">
          {chart.isPlaceholderData ? "Loading…" : chart.isError && chart.data ? "Couldn't refresh" : ""}
        </span>
      </div>
      <div className="relative min-h-0 flex-1">
        {chart.data && chart.data.bars.length > 0 && <CandleChart data={chart.data} style={style} overlays={overlays} />}
        {chart.isPending && <Centered>Loading chart…</Centered>}
        {chart.isError && !chart.data && <Centered alert>{chart.error.message}</Centered>}
        {chart.data?.bars.length === 0 && <Centered>No price history for this range.</Centered>}
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-0.5">
      {children}
    </div>
  );
}

function Centered({ alert, children }: { alert?: boolean; children: ReactNode }) {
  return (
    <p role={alert ? "alert" : "status"} className="absolute inset-0 flex items-center justify-center text-muted">
      {children}
    </p>
  );
}

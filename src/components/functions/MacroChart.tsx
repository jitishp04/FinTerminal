"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { Overlay } from "@/lib/chartData";
import { fetchApi } from "@/lib/fetchApi";
import { formatPrice } from "@/lib/format";
import { MACRO_REFRESH, periodLabel, toChart } from "@/lib/macro";
import { MACRO_RANGES, type MacroRange, type MacroSeries } from "@/lib/types";
import { CandleChart } from "./CandleChart";
import { MacroError } from "./MacroError";
import { Toggle } from "./Toggle";

const NO_OVERLAYS: Overlay[] = [];

/** ECO <FRED_ID>: any FRED series on GP's chart. */
export function MacroChart({ id }: { id: string }) {
  const [range, setRange] = useState<MacroRange>("5Y");
  // No placeholder data: another series must never show under this one's name.
  const series = useQuery({
    queryKey: ["macro", id],
    queryFn: () => fetchApi<MacroSeries>(`/api/macro?series=${encodeURIComponent(id)}`),
    refetchInterval: MACRO_REFRESH,
    // Fresh until the next poll, so switching windows doesn't refetch it.
    staleTime: MACRO_REFRESH,
  });
  const { data } = series;
  const chart = useMemo(() => (data?.observations.length ? toChart(data, range) : undefined), [data, range]);

  if (series.isPending) {
    return (
      <p role="status" className="text-muted">
        Loading {id}…
      </p>
    );
  }
  if (series.isLoadingError) return <MacroError error={series.error} />;

  const latest = series.data.observations.at(-1);
  if (!chart || !latest) {
    return (
      <p role="status" className="text-muted">
        {id} has no readings.
      </p>
    );
  }
  return (
    <div className="flex h-full flex-col gap-1.5">
      <p className="flex items-baseline gap-2 whitespace-nowrap">
        <span title={series.data.title} className="min-w-0 truncate text-muted">
          {series.data.title}
        </span>
        <span className="ml-auto text-base font-semibold">{formatPrice(latest.value, series.data.decimals)}</span>
        <span className="min-w-0 truncate text-xs text-muted">{series.data.units}</span>
        <span className="text-xs text-muted">{periodLabel(latest.date, series.data.frequencyShort)}</span>
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <div role="group" aria-label="Range" className="flex items-center gap-0.5">
          {MACRO_RANGES.map((r) => (
            <Toggle key={r} pressed={r === range} onClick={() => setRange(r)}>
              {r}
            </Toggle>
          ))}
        </div>
        <span className="text-muted">{series.data.frequency}</span>
        <span role="status" className="text-muted">
          {series.isError ? "Couldn't refresh" : ""}
        </span>
      </div>
      <div className="relative min-h-0 flex-1">
        <CandleChart data={chart} style="Line" overlays={NO_OVERLAYS} />
      </div>
    </div>
  );
}

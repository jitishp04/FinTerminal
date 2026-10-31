"use client";

import { createYieldCurveChart, LineSeries, LineStyle, type ISeriesApi } from "lightweight-charts";
import { useEffect, useRef } from "react";
import { TENORS } from "@/lib/curve";
import type { YieldCurve } from "@/lib/types";
import { chartLook, cssColor } from "./chartLook";

interface Handles {
  latest: ISeriesApi<"Line", number>;
  monthAgo: ISeriesApi<"Line", number>;
  yearAgo: ISeriesApi<"Line", number>;
  fit: () => void;
  inverted: string;
}

/** The three curves. Fills its parent. */
export function YieldCurveChart({ curve }: { curve: YieldCurve }) {
  const container = useRef<HTMLDivElement>(null);
  const handles = useRef<Handles | null>(null);

  useEffect(() => {
    const border = cssColor("--border");
    const chart = createYieldCurveChart(container.current!, {
      ...chartLook(),
      autoSize: true,
      handleScroll: false,
      handleScale: false,
      // Each tenor takes the next position rather than its months: to scale, 1M to 2Y would be a sliver at the left.
      yieldCurve: { minimumTimeRange: TENORS.length - 1 },
      localization: {
        timeFormatter: (position: number) => TENORS[position]?.label ?? "",
        priceFormatter: (value: number) => `${value.toFixed(2)}%`,
      },
      leftPriceScale: { visible: false },
      rightPriceScale: { visible: true, borderColor: border },
      // Labels are at most three narrow characters, so a panel with room can show every tenor's.
      timeScale: {
        borderColor: border,
        tickMarkMaxCharacterLength: 2,
        lockVisibleTimeRangeOnResize: true,
        allowBoldLabels: false,
      },
    });
    // Oldest first, so the latest draws on top.
    const yearAgo = chart.addSeries(LineSeries, {
      color: cssColor("--link"),
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
    });
    const monthAgo = chart.addSeries(LineSeries, {
      color: cssColor("--amber"),
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
    });
    const latest = chart.addSeries(LineSeries, { color: cssColor("--foreground"), lineWidth: 2 });
    handles.current = {
      latest,
      monthAgo,
      yearAgo,
      fit: () => chart.timeScale().fitContent(),
      inverted: cssColor("--down"),
    };

    return () => {
      chart.remove();
      handles.current = null;
    };
  }, []);

  useEffect(() => {
    const h = handles.current;
    if (!h) return;
    const { points } = curve;
    h.yearAgo.setData(points.map(({ yearAgo }, i) => ({ time: i, value: yearAgo })));
    h.monthAgo.setData(points.map(({ monthAgo }, i) => ({ time: i, value: monthAgo })));
    // A point's color is the color of the segment leaving it.
    h.latest.setData(
      points.map(({ latest }, i) => ({
        time: i,
        value: latest,
        ...(points[i + 1]?.inverted ? { color: h.inverted } : {}),
      })),
    );
    h.fit();
  }, [curve]);

  return <div ref={container} role="figure" aria-label="US Treasury yield curve" className="absolute inset-0" />;
}

"use client";

import {
  CandlestickSeries,
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef } from "react";
import { minBarSpacing } from "@/lib/chartData";
import { priceDecimals } from "@/lib/format";
import type { ThesisWeek } from "@/lib/thesis";
import { chartLook, cssColor as color } from "./chartLook";

const STRENGTH_PANE = 1;
const RSI_PANE = 2;
// The price pane's height, against 1 for each pane below it.
const PRICE_SHARE = 3;
/** Five years of weeks at first: the rest is a scroll or a zoom away. */
const FIRST_VIEW = 260;

interface Handles {
  chart: IChartApi;
  candles: ISeriesApi<"Candlestick">;
  trend: ISeriesApi<"Line">;
  upper: ISeriesApi<"Line">;
  lower: ISeriesApi<"Line">;
  strength: ISeriesApi<"Histogram">;
  rsi: ISeriesApi<"Line">;
  marks: ISeriesMarkersPluginApi<Time>;
  colors: { up: string; down: string; muted: string; link: string; yellow: string };
}

const at = (time: number) => time as UTCTimestamp;

/** One week's value as a line point, or nothing before the line begins. */
const points = (weeks: ThesisWeek[], value: (week: ThesisWeek) => number | undefined) =>
  weeks.flatMap((week) => {
    const reading = value(week);
    return reading === undefined ? [] : [{ time: at(week.bar.time), value: reading }];
  });

/** The weekly chart behind THS: price and bands, relative strength, then RSI. Fills its parent. */
export function ThesisChart({
  weeks,
  label,
  onHover,
}: {
  weeks: ThesisWeek[];
  label: string;
  /** Called with the week of the mark under the pointer, or undefined when it leaves. */
  onHover: (time: number | undefined) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const handles = useRef<Handles | null>(null);
  // Set the first view once, then let refreshes keep the user's zoom.
  const viewed = useRef(false);

  useEffect(() => {
    const [up, down, border, muted, link, violet, yellow] = ["--up", "--down", "--border", "--muted", "--link", "--violet", "--yellow"].map(color);
    const look = chartLook();

    const chart = createChart(container.current!, {
      ...look,
      layout: { ...look.layout, panes: { separatorColor: border } },
      autoSize: true,
      // Room for the labels, which would otherwise stretch the scale below zero.
      rightPriceScale: { borderColor: border, scaleMargins: { top: 0.12, bottom: 0.26 } },
      timeScale: { borderColor: border, lockVisibleTimeRangeOnResize: true },
    });
    const line = { lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false } as const;
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: up,
      downColor: down,
      wickUpColor: up,
      wickDownColor: down,
      borderVisible: false,
    });
    const strength = chart.addSeries(
      HistogramSeries,
      { priceFormat: { type: "price", precision: 1, minMove: 0.1 }, priceLineVisible: false, title: "Rel. strength" },
      STRENGTH_PANE,
    );
    const rsi = chart.addSeries(
      LineSeries,
      {
        color: yellow,
        lineWidth: 2,
        priceFormat: { type: "price", precision: 1, minMove: 0.1 },
        priceLineVisible: false,
        title: "RSI 14",
        autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
      },
      RSI_PANE,
    );
    strength.createPriceLine({ price: 0, color: muted, lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: false });
    for (const [price, lineStyle] of [
      [70, LineStyle.Dashed],
      [50, LineStyle.Dotted],
      [30, LineStyle.Dashed],
    ]) {
      rsi.createPriceLine({ price, color: muted, lineWidth: 1, lineStyle, axisLabelVisible: false });
    }
    const [pricePane] = chart.panes();
    pricePane.setStretchFactor(PRICE_SHARE);

    handles.current = {
      chart,
      candles,
      trend: chart.addSeries(LineSeries, { ...line, lineWidth: 2 }),
      upper: chart.addSeries(LineSeries, { ...line, color: `${violet}b3` }),
      lower: chart.addSeries(LineSeries, { ...line, color: `${violet}b3` }),
      strength,
      rsi,
      marks: createSeriesMarkers(candles, [], { autoScale: false }),
      colors: { up, down, muted, link, yellow },
    };
    // A mark's id is its week, and a bar is too thin to point at, so this goes by the mark under the pointer.
    chart.subscribeCrosshairMove(({ hoveredObjectId }) => onHover(typeof hoveredObjectId === "string" ? Number(hoveredObjectId) : undefined));

    return () => {
      chart.remove();
      handles.current = null;
      viewed.current = false;
    };
  }, [onHover]);

  useEffect(() => {
    const h = handles.current;
    if (!h) return;
    const { up, down, muted, link, yellow } = h.colors;
    const decimals = priceDecimals(weeks.at(-1)?.bar.close ?? 100);
    // The labels' room below the candles can reach under zero, where the axis has nothing to say.
    const formatter = (price: number) => (price < 0 ? "" : price.toFixed(decimals));
    const priceFormat = { type: "custom", minMove: 10 ** -decimals, formatter } as const;
    for (const series of [h.candles, h.trend, h.upper, h.lower]) series.applyOptions({ priceFormat });

    h.candles.setData(weeks.map(({ bar: { time, open, high, low, close } }) => ({ time: at(time), open, high, low, close })));
    // A point's color paints the stretch leaving it, and the indicator colors the stretch arriving at a week, so each point takes the next week's.
    h.trend.setData(
      weeks.flatMap((week, i) => {
        if (week.trend === undefined) return [];
        const { rising } = weeks[i + 1] ?? week;
        return [{ time: at(week.bar.time), value: week.trend, color: rising === undefined ? muted : rising ? up : down }];
      }),
    );
    h.upper.setData(points(weeks, (week) => week.upper));
    h.lower.setData(points(weeks, (week) => week.lower));
    h.strength.setData(
      points(weeks, (week) => week.strength).map((point) => ({ ...point, color: `${point.value >= 0 ? up : down}bf` })),
    );
    h.rsi.setData(points(weeks, (week) => week.rsi));

    const marks: SeriesMarker<Time>[] = weeks.flatMap(({ bar, label: signal, momentum }) => [
      ...(momentum
        ? [{ id: String(bar.time), time: at(bar.time), position: "aboveBar", shape: "circle", size: 0, text: "◆", color: yellow } as const]
        : []),
      ...(signal
        ? [
            {
              id: String(bar.time),
              time: at(bar.time),
              position: "belowBar",
              shape: "arrowUp",
              text: signal,
              color: signal === "VOL" ? link : up,
            } as const,
          ]
        : []),
    ]);
    h.marks.setMarkers(marks);

    h.chart.applyOptions({ timeScale: { minBarSpacing: minBarSpacing(weeks.length) } });
    if (!viewed.current) {
      h.chart.timeScale().setVisibleLogicalRange({ from: weeks.length - FIRST_VIEW, to: weeks.length + 3 });
      viewed.current = true;
    }
  }, [weeks]);

  return <div ref={container} role="figure" aria-label={label} className="absolute inset-0" />;
}

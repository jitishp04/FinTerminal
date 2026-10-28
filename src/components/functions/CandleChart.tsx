"use client";

import {
  CandlestickSeries,
  ColorType,
  createChart,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef } from "react";
import { OVERLAYS, toSeries, type Overlay } from "@/lib/chartData";
import { priceDecimals } from "@/lib/format";
import type { Chart } from "@/lib/types";

export type ChartStyle = "Candles" | "Line";

/** Each overlay's line color: a CSS variable from globals.css. */
export const OVERLAY_COLORS: Record<Overlay, string> = { "EMA 20": "--violet", "SMA 50": "--amber", "SMA 200": "--link" };

const OVERLAY_NAMES = Object.keys(OVERLAYS) as Overlay[];

interface Handles {
  chart: IChartApi;
  candles: ISeriesApi<"Candlestick">;
  line: ISeriesApi<"Line">;
  volume: ISeriesApi<"Histogram">;
  overlays: Record<Overlay, ISeriesApi<"Line">>;
  volumeUp: string;
  volumeDown: string;
}

const at = (time: number) => time as UTCTimestamp;

/** TradingView Lightweight Charts with volume and moving averages. Fills its parent. */
export function CandleChart({ data, style, overlays }: { data: Chart; style: ChartStyle; overlays: Overlay[] }) {
  const container = useRef<HTMLDivElement>(null);
  const handles = useRef<Handles | null>(null);
  // The symbol and range on screen: fit them once, then let refreshes keep the user's zoom.
  const fitted = useRef("");

  useEffect(() => {
    const css = getComputedStyle(document.documentElement);
    const color = (name: string) => css.getPropertyValue(name).trim();
    const [up, down, border] = [color("--up"), color("--down"), color("--border")];

    const chart = createChart(container.current!, {
      autoSize: true,
      // attributionLogo stays on (the default): the license asks for a link to TradingView.
      layout: {
        background: { type: ColorType.Solid, color: color("--background") },
        textColor: color("--muted"),
        fontFamily: getComputedStyle(document.body).fontFamily,
        fontSize: 11,
      },
      grid: { vertLines: { color: border }, horzLines: { color: border } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: border, scaleMargins: { top: 0.08, bottom: 0.25 } },
      timeScale: { borderColor: border, lockVisibleTimeRangeOnResize: true },
    });
    const line = { lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false } as const;
    handles.current = {
      chart,
      candles: chart.addSeries(CandlestickSeries, {
        upColor: up,
        downColor: down,
        wickUpColor: up,
        wickDownColor: down,
        borderVisible: false,
      }),
      line: chart.addSeries(LineSeries, { color: color("--foreground"), lineWidth: 2, visible: false }),
      volume: chart.addSeries(HistogramSeries, {
        priceScaleId: "volume",
        priceFormat: { type: "volume" },
        priceLineVisible: false,
        lastValueVisible: false,
      }),
      overlays: Object.fromEntries(
        OVERLAY_NAMES.map((name) => [
          name,
          chart.addSeries(LineSeries, { ...line, color: color(OVERLAY_COLORS[name]), visible: false }),
        ]),
      ) as Record<Overlay, ISeriesApi<"Line">>,
      volumeUp: `${up}55`,
      volumeDown: `${down}55`,
    };
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

    return () => {
      chart.remove();
      handles.current = null;
      fitted.current = "";
    };
  }, []);

  useEffect(() => {
    const h = handles.current;
    if (!h) return;
    const { bars, overlays: lines } = toSeries(data);
    const decimals = priceDecimals(bars.at(-1)?.close ?? 100);
    const priceFormat = { type: "price", precision: decimals, minMove: 10 ** -decimals } as const;

    h.candles.applyOptions({ priceFormat });
    h.candles.setData(bars.map(({ time, open, high, low, close }) => ({ time: at(time), open, high, low, close })));
    h.line.applyOptions({ priceFormat });
    h.line.setData(bars.map((b) => ({ time: at(b.time), value: b.close })));
    h.volume.setData(
      bars.map((b) => ({ time: at(b.time), value: b.volume, color: b.close >= b.open ? h.volumeUp : h.volumeDown })),
    );
    for (const name of OVERLAY_NAMES) {
      h.overlays[name].applyOptions({ priceFormat });
      h.overlays[name].setData(lines[name].map((p) => ({ time: at(p.time), value: p.value })));
    }
    h.chart.applyOptions({ timeScale: { timeVisible: data.interval.endsWith("m") } });

    const key = `${data.symbol} ${data.range}`;
    if (fitted.current !== key) {
      h.chart.timeScale().fitContent();
      fitted.current = key;
    }
  }, [data]);

  useEffect(() => {
    const h = handles.current;
    if (!h) return;
    h.candles.applyOptions({ visible: style === "Candles" });
    h.line.applyOptions({ visible: style === "Line" });
    for (const name of OVERLAY_NAMES) h.overlays[name].applyOptions({ visible: overlays.includes(name) });
  }, [style, overlays]);

  return <div ref={container} role="figure" aria-label={`${data.symbol} price chart, ${data.range}`} className="absolute inset-0" />;
}

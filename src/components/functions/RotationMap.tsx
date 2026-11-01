"use client";

import { useEffect, useRef, useState } from "react";
import { formatPrice } from "@/lib/format";
import { QUADRANTS, type Quadrant, type RotationPoint } from "@/lib/rotation";
import { type Box, placeLabels, reach, ticks } from "@/lib/rotationMap";

export const QUADRANT_COLORS: Record<Quadrant, string> = {
  Leading: "var(--up)",
  Weakening: "var(--amber)",
  Lagging: "var(--down)",
  Improving: "var(--link)",
};

export interface MapSector {
  symbol: string;
  name: string;
  quadrant: Quadrant;
  /** Its tail, oldest first. The last is where it is now. */
  points: RotationPoint[];
}

interface RotationMapProps {
  sectors: MapSector[];
  /** The sector being pointed at, here or in the table: its tail stands out. */
  active?: string;
  onActive: (symbol: string | undefined) => void;
  onOpen: (symbol: string) => void;
}

// JetBrains Mono is 0.6em wide a character, so text can be measured without the DOM.
const LABEL_FONT = 12;
const SMALL_FONT = 11;
const textWidth = (text: string, font: number) => text.length * font * 0.6;

const DOT = 4;
const RING = 2;
/** Bigger than the dot, so it's easy to point at. */
const HIT = 12;
const PAD = 4;

/** Where each quadrant's name goes: its corner of the map. */
const CORNERS: Record<Quadrant, { right: boolean; bottom: boolean }> = {
  Leading: { right: true, bottom: false },
  Weakening: { right: true, bottom: true },
  Lagging: { right: false, bottom: true },
  Improving: { right: false, bottom: false },
};

const formatTick = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));

/**
 * Trend across, momentum up, split into quadrants at 100. Each sector is a dot with its
 * ticker and a tail of earlier weeks. Drawn at the size of its box, so text stays its size.
 */
export function RotationMap({ sectors, active, onActive, onOpen }: RotationMapProps) {
  const [ref, size] = useSize();
  return (
    <div ref={ref} className="absolute inset-0">
      {size.width > 0 && size.height > 0 && (
        <Plot {...size} sectors={sectors} active={active} onActive={onActive} onOpen={onOpen} />
      )}
    </div>
  );
}

function Plot({ width: w, height: h, sectors, active, onActive, onOpen }: RotationMapProps & { width: number; height: number }) {
  const all = sectors.flatMap((s) => s.points);
  const across = reach(all.map((p) => p.trend));
  const up = reach(all.map((p) => p.momentum));
  const xTicks = ticks(across);
  const yTicks = ticks(up);

  // Room for the tick labels: beside the plot on the left, and for half of one past either end.
  const left = Math.max(...yTicks.map((t) => textWidth(formatTick(t), SMALL_FONT))) + 2 * PAD;
  const right = Math.max(...xTicks.map((t) => textWidth(formatTick(t), SMALL_FONT))) / 2 + PAD;
  const top = SMALL_FONT / 2 + PAD;
  const plot: Box = { x: left, y: top, width: w - left - right, height: h - top - 2 * SMALL_FONT };
  const x = (trend: number) => plot.x + ((trend - 100 + across) / (2 * across)) * plot.width;
  const y = (momentum: number) => plot.y + ((100 + up - momentum) / (2 * up)) * plot.height;
  const centre = { x: x(100), y: y(100) };

  // Quadrant names in the corners, with the axis names at the far ends of the 100 lines.
  const corners = QUADRANTS.map((name) => {
    const { right, bottom } = CORNERS[name];
    const boxWidth = textWidth(name, SMALL_FONT) + 2 * PAD + 2;
    const box = {
      x: right ? plot.x + plot.width - PAD - boxWidth : plot.x + PAD,
      y: bottom ? plot.y + plot.height - PAD - SMALL_FONT : plot.y + PAD,
      width: boxWidth,
      height: SMALL_FONT,
    };
    return { name, box };
  });
  const trendTitle = "Trend →";
  const momentumTitle = "Momentum ↑";
  const titles = [
    { text: trendTitle, box: { x: plot.x + plot.width - PAD - textWidth(trendTitle, SMALL_FONT), y: centre.y - PAD - SMALL_FONT, width: textWidth(trendTitle, SMALL_FONT), height: SMALL_FONT } },
    { text: momentumTitle, box: { x: centre.x + PAD, y: plot.y + PAD, width: textWidth(momentumTitle, SMALL_FONT), height: SMALL_FONT } },
  ];

  const heads = sectors.map((s) => {
    const head = s.points[s.points.length - 1];
    return { x: x(head.trend), y: y(head.momentum), width: textWidth(s.symbol, LABEL_FONT) + 2 };
  });
  const labels = placeLabels(heads, {
    height: LABEL_FONT + 1,
    radius: DOT + RING,
    bounds: plot,
    obstacles: [...corners.map((c) => c.box), ...titles.map((t) => t.box)],
  });

  const dim = (symbol: string) => active !== undefined && active !== symbol;
  // The pointed-at sector is drawn last, on top of the others.
  const order = sectors.map((_, i) => i).sort((a, b) => Number(sectors[a].symbol === active) - Number(sectors[b].symbol === active));

  return (
    <svg
      width={w}
      height={h}
      role="img"
      aria-label="Sector rotation map. The table lists the same values."
      className="block select-none"
    >
      {corners.map(({ name }) => {
        const { right, bottom } = CORNERS[name];
        return (
          <rect
            key={name}
            x={right ? centre.x : plot.x}
            y={bottom ? centre.y : plot.y}
            width={right ? plot.x + plot.width - centre.x : centre.x - plot.x}
            height={bottom ? plot.y + plot.height - centre.y : centre.y - plot.y}
            fill={QUADRANT_COLORS[name]}
            fillOpacity={0.06}
          />
        );
      })}
      <rect {...plot} fill="none" stroke="var(--border)" />

      {xTicks.map((t) => (
        <g key={`x${t}`}>
          {t !== 100 && <line x1={x(t)} x2={x(t)} y1={plot.y} y2={plot.y + plot.height} stroke="var(--border)" />}
          <text x={x(t)} y={plot.y + plot.height + SMALL_FONT + 2} textAnchor="middle" fontSize={SMALL_FONT} fill="var(--muted)">
            {formatTick(t)}
          </text>
        </g>
      ))}
      {yTicks.map((t) => (
        <g key={`y${t}`}>
          {t !== 100 && <line x1={plot.x} x2={plot.x + plot.width} y1={y(t)} y2={y(t)} stroke="var(--border)" />}
          <text x={plot.x - PAD} y={y(t)} textAnchor="end" dominantBaseline="central" fontSize={SMALL_FONT} fill="var(--muted)">
            {formatTick(t)}
          </text>
        </g>
      ))}
      <line x1={centre.x} x2={centre.x} y1={plot.y} y2={plot.y + plot.height} stroke="var(--muted)" strokeOpacity={0.6} />
      <line x1={plot.x} x2={plot.x + plot.width} y1={centre.y} y2={centre.y} stroke="var(--muted)" strokeOpacity={0.6} />

      {corners.map(({ name, box }) => (
        <g key={name} fontSize={SMALL_FONT} fill="var(--muted)">
          <circle cx={box.x + 3} cy={box.y + box.height / 2} r={3} fill={QUADRANT_COLORS[name]} />
          <text x={box.x + 2 * PAD + 2} y={box.y + box.height / 2} dominantBaseline="central">
            {name}
          </text>
        </g>
      ))}
      {titles.map(({ text, box }) => (
        <text key={text} x={box.x} y={box.y + box.height / 2} dominantBaseline="central" fontSize={SMALL_FONT} fill="var(--muted)">
          {text}
        </text>
      ))}

      {sectors.map(({ symbol, quadrant, points }) => (
        <g
          key={symbol}
          stroke={QUADRANT_COLORS[quadrant]}
          fill={QUADRANT_COLORS[quadrant]}
          opacity={dim(symbol) ? 0.15 : active === symbol ? 1 : 0.55}
        >
          <polyline
            points={points.map((p) => `${x(p.trend)},${y(p.momentum)}`).join(" ")}
            fill="none"
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {points.slice(0, -1).map((p) => (
            <circle key={p.week} cx={x(p.trend)} cy={y(p.momentum)} r={1.5} stroke="none" />
          ))}
        </g>
      ))}

      {order.map((i) => {
        const { symbol, name, quadrant, points } = sectors[i];
        const head = points[points.length - 1];
        const label = labels[i];
        const dot = heads[i];
        // A leader line runs from the dot to the nearest point of its label.
        const toX = Math.min(Math.max(dot.x, label.x), label.x + label.width);
        const toY = Math.min(Math.max(dot.y, label.y), label.y + label.height);
        return (
          <g
            key={symbol}
            opacity={dim(symbol) ? 0.35 : 1}
            className="cursor-pointer"
            onClick={() => onOpen(symbol)}
            onPointerEnter={() => onActive(symbol)}
            onPointerLeave={() => onActive(undefined)}
          >
            <title>{`${name} (${symbol}): ${quadrant}, trend ${formatPrice(head.trend, 2)}, momentum ${formatPrice(head.momentum, 2)}`}</title>
            {label.leader && <line x1={dot.x} y1={dot.y} x2={toX} y2={toY} stroke="var(--muted)" />}
            <circle cx={dot.x} cy={dot.y} r={DOT} fill={QUADRANT_COLORS[quadrant]} stroke="var(--background)" strokeWidth={RING} />
            <text
              x={label.x + 1}
              y={label.y + label.height / 2}
              dominantBaseline="central"
              fontSize={LABEL_FONT}
              fill="var(--foreground)"
              stroke="var(--background)"
              strokeWidth={3}
              strokeLinejoin="round"
              paintOrder="stroke"
            >
              {symbol}
            </text>
            <circle cx={dot.x} cy={dot.y} r={HIT} fill="transparent" />
          </g>
        );
      })}
    </svg>
  );
}

/** The element's size, kept up to date as its panel resizes. Zero while it's hidden. */
function useSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setSize({ width: Math.floor(entry.contentRect.width), height: Math.floor(entry.contentRect.height) }),
    );
    observer.observe(ref.current!);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}

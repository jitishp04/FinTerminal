import { describe, expect, it } from "vitest";
import { type Box, placeLabels, reach, ticks } from "./rotationMap";

describe("reach", () => {
  it("fits the value farthest from 100, with room to spare", () => {
    expect(reach([95, 103, 100])).toBeCloseTo(5 * 1.15, 9);
    expect(reach([108, 101])).toBeCloseTo(8 * 1.15, 9);
  });

  it("is at least 1 either side, so a quiet week isn't blown up to fill the map", () => {
    expect(reach([100.2, 99.9])).toBeCloseTo(1.15, 9);
    expect(reach([])).toBeCloseTo(1.15, 9);
  });
});

describe("ticks", () => {
  it("takes the smallest round step that leaves at most two ticks either side of 100", () => {
    expect(ticks(4.5)).toEqual([96, 98, 100, 102, 104]);
    expect(ticks(5.75)).toEqual([96, 98, 100, 102, 104]);
    expect(ticks(12.2)).toEqual([90, 95, 100, 105, 110]);
    expect(ticks(3)).toEqual([98, 100, 102]);
  });

  it("goes below 1 for a narrow axis", () => {
    expect(ticks(1.15)).toEqual([99, 99.5, 100, 100.5, 101]);
  });
});

const overlap = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const inside = (a: Box, bounds: Box) =>
  a.x >= bounds.x && a.y >= bounds.y && a.x + a.width <= bounds.x + bounds.width && a.y + a.height <= bounds.y + bounds.height;

const bounds = { x: 0, y: 0, width: 300, height: 200 };
const options = { height: 12, radius: 6, bounds };
/** A dot's own square, as the labels must leave it clear. */
const dotBox = ({ x, y }: { x: number; y: number }) => ({ x: x - 6, y: y - 6, width: 12, height: 12 });

describe("placeLabels", () => {
  it("puts a label just right of its dot when there's room, with no leader line", () => {
    const [label] = placeLabels([{ x: 100, y: 100, width: 30 }], options);
    expect(label).toEqual({ x: 108, y: 94, width: 30, height: 12, leader: false });
  });

  it("puts it on the left at the right edge, keeping it inside", () => {
    const [label] = placeLabels([{ x: 290, y: 100, width: 30 }], options);
    expect(label.x + label.width).toBeLessThanOrEqual(290);
    expect(inside(label, bounds)).toBe(true);
  });

  it("keeps clear of the boxes it's told to avoid", () => {
    const corner = { x: 100, y: 80, width: 60, height: 40 };
    const [label] = placeLabels([{ x: 100, y: 100, width: 30 }], { ...options, obstacles: [corner] });
    expect(overlap(label, corner)).toBe(false);
  });

  it("keeps 11 labels apart, off every dot and inside the map when the dots crowd the center", () => {
    // Every sector within a few pixels of the middle, as when nothing has moved much.
    const tickers = ["XLK", "XLF", "XLV", "XLY", "XLP", "XLE", "XLI", "XLB", "XLU", "XLRE", "XLC"];
    const dots = tickers.map((ticker, i) => ({
      x: 150 + 8 * Math.cos(i * 2.4),
      y: 100 + 8 * Math.sin(i * 2.4),
      width: ticker.length * 7.2,
    }));

    const labels = placeLabels(dots, options);

    labels.forEach((label, i) => {
      expect(inside(label, bounds)).toBe(true);
      for (const other of labels.slice(i + 1)) expect(overlap(label, other)).toBe(false);
      for (const dot of dots) expect(overlap(label, dotBox(dot))).toBe(false);
    });
    // The crowd pushes some labels out, and those get a line back to their dot.
    expect(labels.some((label) => label.leader)).toBe(true);
  });

  it("keeps a label inside a map too small to keep it clear of everything", () => {
    const tiny = { x: 0, y: 0, width: 60, height: 30 };
    const dots = [0, 1, 2, 3].map((i) => ({ x: 25 + i * 3, y: 15, width: 22 }));

    for (const label of placeLabels(dots, { ...options, bounds: tiny })) expect(inside(label, tiny)).toBe(true);
  });
});

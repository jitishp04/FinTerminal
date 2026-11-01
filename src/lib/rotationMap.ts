// Geometry for ROT's map: how far each axis runs, its ticks, and where the tickers go.

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Label extends Box {
  /** It sits away from its dot, so it needs a line back to it. */
  leader: boolean;
}

// A quiet week shouldn't be blown up to fill the map, and the farthest dot shouldn't touch its edge.
const MIN_REACH = 1;
const MARGIN = 1.15;

/** How far an axis runs either side of 100 to fit `values`. Centred on 100, so the quadrants are the same size. */
export function reach(values: number[]): number {
  return MARGIN * Math.max(MIN_REACH, ...values.map((value) => Math.abs(value - 100)));
}

/** 100 and round values either side of it: the smallest step of 1, 2 or 5 (×10ⁿ) that leaves at most two each side. */
export function ticks(reach: number): number[] {
  const base = 10 ** Math.floor(Math.log10(reach / 2));
  const step = [1, 2, 5, 10, 20, 50].map((m) => m * base).find((s) => Math.floor(reach / s) <= 2)!;
  const each = Math.floor(reach / step);
  return Array.from({ length: 2 * each + 1 }, (_, i) => 100 + (i - each) * step);
}

interface Dot {
  x: number;
  y: number;
  /** Its label's width. */
  width: number;
}

interface LabelOptions {
  /** Every label's height. */
  height: number;
  /** How far a dot's mark reaches from its centre. */
  radius: number;
  /** Labels stay inside this. */
  bounds: Box;
  /** Boxes labels keep clear of, such as the quadrant names. */
  obstacles?: Box[];
}

const GAP = 2;
const RINGS = 5;
// Right, left, the four corners, above, below: the order a label's spots are tried in.
const DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [1, -1],
  [1, 1],
  [-1, -1],
  [-1, 1],
  [0, -1],
  [0, 1],
] as const;

const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** A label `distance` from its dot in `direction`, moved inside `bounds`. */
function spot(dot: Dot, height: number, [dx, dy]: readonly [number, number], distance: number, bounds: Box): Box {
  // On a corner, the label's nearest corner is `distance` from the dot.
  const along = dx && dy ? distance * Math.SQRT1_2 : distance;
  const x = dx > 0 ? dot.x + along : dx < 0 ? dot.x - along - dot.width : dot.x - dot.width / 2;
  const y = dy > 0 ? dot.y + along : dy < 0 ? dot.y - along - height : dot.y - height / 2;
  return {
    x: clamp(x, bounds.x, bounds.x + bounds.width - dot.width),
    y: clamp(y, bounds.y, bounds.y + bounds.height - height),
    width: dot.width,
    height,
  };
}

/** How far a dot is from the nearest point of a box. */
const distance = (dot: Dot, box: Box) =>
  Math.hypot(dot.x - clamp(dot.x, box.x, box.x + box.width), dot.y - clamp(dot.y, box.y, box.y + box.height));

/**
 * Places each dot's label, in the same order: beside its dot where it covers no other
 * label, dot or obstacle, otherwise further out. One that can't be kept clear takes the
 * spot it overlaps least.
 */
export function placeLabels(dots: Dot[], { height, radius, bounds, obstacles = [] }: LabelOptions): Label[] {
  const marks = dots.map(({ x, y }) => ({ x: x - radius, y: y - radius, width: 2 * radius, height: 2 * radius }));
  const taken: Box[] = [...marks, ...obstacles];
  return dots.map((dot) => {
    let best: Box | undefined;
    let bestCost = Infinity;
    search: for (let ring = 0; ring < RINGS; ring++) {
      for (const direction of DIRECTIONS) {
        const box = spot(dot, height, direction, radius + GAP + ring * height, bounds);
        const cost = taken.reduce((sum, other) => sum + overlap(box, other), 0);
        if (cost < bestCost) [best, bestCost] = [box, cost];
        if (cost === 0) break search;
      }
    }
    taken.push(best!);
    return { ...best!, leader: distance(dot, best!) > radius + GAP + 1 };
  });
}

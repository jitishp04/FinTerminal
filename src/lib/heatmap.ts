/** A % move this big, either way, gets the full color. */
export const HEAT_CAP = 3;

/** How much color the biggest move mixes in. Any more and the tile's light text gets hard to read. */
const MAX_MIX = 50;

/** A tile's background for a % change: neutral at zero, then stronger green or red with the size of the move. */
export function heatColor(percent: number | undefined): string {
  if (!percent) return "var(--panel)";
  const mix = Math.round((Math.min(Math.abs(percent), HEAT_CAP) / HEAT_CAP) * MAX_MIX);
  return `color-mix(in srgb, var(${percent > 0 ? "--up" : "--down"}) ${mix}%, var(--panel))`;
}

import { describe, expect, it } from "vitest";
import { heatColor, HEAT_CAP } from "./heatmap";

const mix = (color: string) => Number(color.match(/(\d+)%/)?.[1]);

describe("heatColor", () => {
  it("is green up and red down", () => {
    expect(heatColor(1)).toContain("--up");
    expect(heatColor(-1)).toContain("--down");
  });

  it("is neutral with no change, or no data", () => {
    expect(heatColor(0)).toBe("var(--panel)");
    expect(heatColor(undefined)).toBe("var(--panel)");
  });

  it("gets stronger with the size of the move, the same either way", () => {
    expect(mix(heatColor(2))).toBeGreaterThan(mix(heatColor(1)));
    expect(mix(heatColor(-2))).toBe(mix(heatColor(2)));
  });

  it("stops at the cap, so bigger moves look the same", () => {
    expect(mix(heatColor(HEAT_CAP * 3))).toBe(mix(heatColor(HEAT_CAP)));
  });

  it("stays dark enough to read light text on", () => {
    expect(mix(heatColor(HEAT_CAP))).toBeLessThanOrEqual(50);
  });
});

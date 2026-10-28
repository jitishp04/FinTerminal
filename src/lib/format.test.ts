import { describe, expect, it } from "vitest";
import { formatChange, formatPercent, formatPrice } from "./format";

describe("formatPrice", () => {
  it("uses two decimals, four under 10", () => {
    expect(formatPrice(7736.4199)).toBe("7,736.42");
    expect(formatPrice(344.1)).toBe("344.10");
    expect(formatPrice(1.116196)).toBe("1.1162");
  });
});

describe("formatChange", () => {
  it("signs moves and matches the price's decimals", () => {
    expect(formatChange(2.95, 2)).toBe("+2.95");
    expect(formatChange(-2.9500122, 2)).toBe("-2.95");
    expect(formatChange(0.0036046, 4)).toBe("+0.0036");
    expect(formatChange(0, 2)).toBe("0.00");
  });
});

describe("formatPercent", () => {
  it("signs a percent number", () => {
    expect(formatPercent(-0.7605919)).toBe("-0.76%");
    expect(formatPercent(0.18840626)).toBe("+0.19%");
  });
});

import { describe, expect, it } from "vitest";
import { formatChange, formatCompact, formatFraction, formatInteger, formatPercent, formatPrice } from "./format";

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

describe("formatFraction", () => {
  it("shows a fraction as a percent", () => {
    expect(formatFraction(0.0071)).toBe("0.71%");
    expect(formatFraction(0.67944)).toBe("67.94%");
    expect(formatFraction(-0.052)).toBe("-5.20%");
    expect(formatFraction(0)).toBe("0.00%");
  });

  it("keeps two significant digits for tiny fractions like expense ratios", () => {
    expect(formatFraction(0.000945)).toBe("0.095%");
    expect(formatFraction(0.0003)).toBe("0.030%");
  });
});

describe("formatCompact", () => {
  it("keeps three significant digits with a suffix", () => {
    expect(formatCompact(1.23e12)).toBe("1.23T");
    expect(formatCompact(3_827_000_000_000)).toBe("3.83T");
    expect(formatCompact(45_612_000_000)).toBe("45.6B");
    expect(formatCompact(22_098_123)).toBe("22.1M");
    expect(formatCompact(950)).toBe("950");
    expect(formatCompact(-2_500_000)).toBe("-2.5M");
  });
});

describe("formatInteger", () => {
  it("groups thousands", () => {
    expect(formatInteger(228000)).toBe("228,000");
  });
});

import { describe, expect, it } from "vitest";
import { daysToExpiry, expiryLabel, inTheMoney, nearStrikes, priceIndex, putCallRatios, strikeRows } from "./options";
import type { OptionContract } from "./types";

const contract = (strike: number, extra: Partial<OptionContract> = {}): OptionContract => ({ contract: `X${strike}`, strike, ...extra });

describe("strikeRows", () => {
  it("lines calls and puts up by strike, lowest first, leaving a side empty where it has none", () => {
    const rows = strikeRows({ calls: [contract(100), contract(110), contract(120)], puts: [contract(90), contract(110)] });
    expect(rows.map(({ strike, call, put }) => [strike, call?.contract, put?.contract])).toEqual([
      [90, undefined, "X90"],
      [100, "X100", undefined],
      [110, "X110", "X110"],
      [120, "X120", undefined],
    ]);
  });
});

describe("nearStrikes", () => {
  const rows = strikeRows({ calls: Array.from({ length: 30 }, (_, i) => contract(100 + 5 * i)), puts: [] });

  it("takes as many strikes below the price as at or above it", () => {
    const near = nearStrikes(rows, 152.3, 3);
    expect(near.map(({ strike }) => strike)).toEqual([140, 145, 150, 155, 160, 165]);
  });

  it("counts a strike right at the price as above it", () => {
    expect(nearStrikes(rows, 150, 2).map(({ strike }) => strike)).toEqual([140, 145, 150, 155]);
    expect(priceIndex(rows, 150)).toBe(10);
  });

  it("takes fewer where the chain runs out", () => {
    expect(nearStrikes(rows, 101, 3).map(({ strike }) => strike)).toEqual([100, 105, 110, 115]);
    expect(nearStrikes(rows, 500, 2).map(({ strike }) => strike)).toEqual([240, 245]);
    expect(priceIndex(rows, 500)).toBe(30);
  });
});

describe("inTheMoney", () => {
  it("puts calls below the price and puts above it in the money, and neither right at it", () => {
    expect(inTheMoney("call", 95, 100)).toBe(true);
    expect(inTheMoney("call", 105, 100)).toBe(false);
    expect(inTheMoney("put", 105, 100)).toBe(true);
    expect(inTheMoney("put", 95, 100)).toBe(false);
    expect(inTheMoney("call", 100, 100)).toBe(false);
    expect(inTheMoney("put", 100, 100)).toBe(false);
  });
});

describe("daysToExpiry", () => {
  it("counts calendar days from today in New York", () => {
    expect(daysToExpiry("2026-11-20", new Date("2026-11-01T15:00:00Z"))).toBe(19);
    expect(daysToExpiry("2026-11-02", new Date("2026-11-02T20:59:00Z"))).toBe(0);
  });

  it("still counts from New York's day when it's already tomorrow in UTC, or in Asia", () => {
    // 23:30 on 1 November in New York.
    expect(daysToExpiry("2026-11-02", new Date("2026-11-02T04:30:00Z"))).toBe(1);
  });

  it("goes over a change of clocks and a year end", () => {
    expect(daysToExpiry("2026-11-09", new Date("2026-10-31T16:00:00Z"))).toBe(9);
    expect(daysToExpiry("2027-01-15", new Date("2026-12-31T17:00:00Z"))).toBe(15);
  });
});

describe("expiryLabel", () => {
  const now = new Date("2026-11-01T15:00:00Z");

  it("names the day and the days to it, with the year only when it isn't this one", () => {
    expect(expiryLabel("2026-11-20", now)).toBe("Nov 20 · 19d");
    expect(expiryLabel("2027-01-15", now)).toBe("Jan 15, 2027 · 75d");
  });
});

describe("putCallRatios", () => {
  it("divides the puts' volume and open interest by the calls'", () => {
    const calls = [contract(100, { volume: 300, openInterest: 1000 }), contract(110, { volume: 100 })];
    const puts = [contract(90, { volume: 200, openInterest: 500 }), contract(100, { openInterest: 250 })];
    expect(putCallRatios({ calls, puts })).toEqual({ volume: 0.5, openInterest: 0.75 });
  });

  it("has no ratio when the calls have none to divide by", () => {
    expect(putCallRatios({ calls: [contract(100)], puts: [contract(90, { volume: 5 })] })).toEqual({ volume: undefined, openInterest: undefined });
  });
});

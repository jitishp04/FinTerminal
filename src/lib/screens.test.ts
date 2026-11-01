import { describe, expect, it } from "vitest";
import { filterRows, isScreenId, nextSort, rangePosition, sortRows } from "./screens";
import type { ScreenRow } from "./types";

const row = (symbol: string, extra: Partial<ScreenRow> = {}): ScreenRow => ({ symbol, name: symbol, type: "EQUITY", price: 10, ...extra });
const symbols = (rows: ScreenRow[]) => rows.map(({ symbol }) => symbol);

describe("isScreenId", () => {
  it("takes the six equity screens and nothing else", () => {
    expect(isScreenId("undervalued_growth_stocks")).toBe(true);
    expect(isScreenId("most_shorted_stocks")).toBe(true);
    expect(isScreenId("day_gainers")).toBe(false);
    expect(isScreenId("top_mutual_funds")).toBe(false);
    expect(isScreenId("")).toBe(false);
  });
});

describe("rangePosition", () => {
  it("places the price between the 52-week low and high", () => {
    expect(rangePosition(row("A", { price: 15, week52Low: 10, week52High: 20 }))).toBe(0.5);
    expect(rangePosition(row("A", { price: 10, week52Low: 10, week52High: 20 }))).toBe(0);
  });

  it("keeps a price just outside the range, as after today's new high, at the end", () => {
    expect(rangePosition(row("A", { price: 21, week52Low: 10, week52High: 20 }))).toBe(1);
    expect(rangePosition(row("A", { price: 9, week52Low: 10, week52High: 20 }))).toBe(0);
  });

  it("has none without a range, or with an empty one", () => {
    expect(rangePosition(row("A", { week52High: 20 }))).toBeUndefined();
    expect(rangePosition(row("A", { week52Low: 10, week52High: 10 }))).toBeUndefined();
  });
});

describe("nextSort", () => {
  it("sorts numbers biggest first and symbols A to Z, then turns round on the same column", () => {
    expect(nextSort(null, "marketCap")).toEqual({ key: "marketCap", descending: true });
    expect(nextSort(null, "symbol")).toEqual({ key: "symbol", descending: false });
    expect(nextSort(null, "name")).toEqual({ key: "name", descending: false });
    expect(nextSort({ key: "marketCap", descending: true }, "marketCap")).toEqual({ key: "marketCap", descending: false });
    expect(nextSort({ key: "marketCap", descending: false }, "peRatio")).toEqual({ key: "peRatio", descending: true });
  });
});

describe("sortRows", () => {
  const rows = [row("B", { peRatio: 20 }), row("C"), row("A", { peRatio: 5 }), row("D", { peRatio: 20 }), row("E")];

  it("keeps Yahoo's order without a sort", () => {
    expect(sortRows(rows, null)).toBe(rows);
  });

  it("sorts either way, with rows missing the value last both times, and ties in Yahoo's order", () => {
    expect(symbols(sortRows(rows, { key: "peRatio", descending: true }))).toEqual(["B", "D", "A", "C", "E"]);
    expect(symbols(sortRows(rows, { key: "peRatio", descending: false }))).toEqual(["A", "B", "D", "C", "E"]);
  });

  it("sorts names alphabetically, ignoring case", () => {
    const named = [row("X", { name: "beta Corp" }), row("Y", { name: "Alpha Inc." }), row("Z", { name: "Gamma" })];
    expect(symbols(sortRows(named, { key: "name", descending: false }))).toEqual(["Y", "X", "Z"]);
  });

  it("sorts symbols alphabetically", () => {
    expect(symbols(sortRows(rows, { key: "symbol", descending: false }))).toEqual(["A", "B", "C", "D", "E"]);
    expect(symbols(sortRows(rows, { key: "symbol", descending: true }))).toEqual(["E", "D", "C", "B", "A"]);
  });

  it("sorts by where the price sits in its 52-week range", () => {
    const ranged = [row("LOW", { price: 11, week52Low: 10, week52High: 20 }), row("NONE"), row("HIGH", { price: 19, week52Low: 10, week52High: 20 })];
    expect(symbols(sortRows(ranged, { key: "range", descending: true }))).toEqual(["HIGH", "LOW", "NONE"]);
  });

  it("leaves the rows it was given alone", () => {
    sortRows(rows, { key: "symbol", descending: true });
    expect(symbols(rows)).toEqual(["B", "C", "A", "D", "E"]);
  });
});

describe("filterRows", () => {
  const rows = [
    row("MEGA", { marketCap: 3e12, peRatio: 35 }),
    row("MID", { marketCap: 5e9, peRatio: 12 }),
    row("SMALL", { marketCap: 1e9 }),
    row("NOCAP", { peRatio: 8 }),
  ];

  it("passes everything with no filter set", () => {
    expect(symbols(filterRows(rows, { minMarketCap: 0 }))).toEqual(["MEGA", "MID", "SMALL", "NOCAP"]);
  });

  it("keeps a market cap at or above the floor, and leaves out one that's missing", () => {
    expect(symbols(filterRows(rows, { minMarketCap: 5e9 }))).toEqual(["MEGA", "MID"]);
  });

  it("keeps a P/E within the range, ends included, and leaves out a missing one", () => {
    expect(symbols(filterRows(rows, { minMarketCap: 0, minPe: 8, maxPe: 12 }))).toEqual(["MID", "NOCAP"]);
    expect(symbols(filterRows(rows, { minMarketCap: 0, maxPe: 20 }))).toEqual(["MID", "NOCAP"]);
    expect(symbols(filterRows(rows, { minMarketCap: 0, minPe: 10 }))).toEqual(["MEGA", "MID"]);
  });

  it("applies the filters together", () => {
    expect(symbols(filterRows(rows, { minMarketCap: 2e9, maxPe: 20 }))).toEqual(["MID"]);
  });
});

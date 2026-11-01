import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { clearCache } from "../cache";
import type { Quote } from "../types";
import { resetHealth } from "./health";
import { quotes } from "./quotes";

const yahoo = vi.hoisted(() => ({ quote: vi.fn() }));
vi.mock("./yahoo", () => yahoo);

const YAHOO_DOWN = new ApiError(502, "Yahoo Finance isn't responding. Retrying…");
const FROM_YAHOO: Quote = { symbol: "AAPL", name: "Apple Inc.", type: "EQUITY", price: 344.63 };

const finnhubQuote = (price: number) => ({ c: price, d: 1, dp: 0.1, h: price, l: price, o: price, pc: price, t: 1793476800 });

/** Answers each symbol with `prices`, or with a 500 for one it doesn't list. */
function stubFinnhub(prices: Record<string, number>) {
  const fetchStub = vi.fn(async (url: string) => {
    const symbol = new URL(url).searchParams.get("symbol") ?? "";
    const price = prices[symbol];
    return price === undefined
      ? new Response("{}", { status: 500 })
      : new Response(JSON.stringify(finnhubQuote(price)), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchStub);
  return fetchStub;
}

beforeEach(() => {
  clearCache();
  resetHealth();
  yahoo.quote.mockReset();
  vi.stubEnv("FINNHUB_API_KEY", "key");
  vi.stubEnv("FAIL_SOURCES", "");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("quotes", () => {
  it("answers from Yahoo while Yahoo works, without touching Finnhub", async () => {
    yahoo.quote.mockResolvedValue([FROM_YAHOO]);
    const fetchStub = stubFinnhub({ AAPL: 1 });
    expect(await quotes(["AAPL"])).toEqual([FROM_YAHOO]);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("doesn't fall back for a symbol Yahoo simply doesn't have", async () => {
    yahoo.quote.mockResolvedValue([]);
    const fetchStub = stubFinnhub({ ZZZZ: 1 });
    expect(await quotes(["ZZZZ"])).toEqual([]);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("gets US stocks from Finnhub when Yahoo fails", async () => {
    yahoo.quote.mockRejectedValue(YAHOO_DOWN);
    stubFinnhub({ AAPL: 344.63, MSFT: 500 });
    const found = await quotes(["AAPL", "MSFT"]);
    expect(found.map(({ symbol, price }) => [symbol, price])).toEqual([
      ["AAPL", 344.63],
      ["MSFT", 500],
    ]);
  });

  it("asks Finnhub only for what it covers, leaving the rest out", async () => {
    yahoo.quote.mockRejectedValue(YAHOO_DOWN);
    const fetchStub = stubFinnhub({ AAPL: 344.63 });
    const found = await quotes(["AAPL", "^GSPC", "EURUSD=X", "GC=F"]);
    expect(found.map(({ symbol }) => symbol)).toEqual(["AAPL"]);
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it("keeps the quotes it got when one symbol fails, such as at the rate limit", async () => {
    yahoo.quote.mockRejectedValue(YAHOO_DOWN);
    stubFinnhub({ AAPL: 344.63 });
    expect((await quotes(["AAPL", "MSFT"])).map(({ symbol }) => symbol)).toEqual(["AAPL"]);
  });

  it("fails with Yahoo's error when there's nothing to fall back to", async () => {
    yahoo.quote.mockRejectedValue(YAHOO_DOWN);
    vi.stubGlobal("fetch", vi.fn());
    await expect(quotes(["^GSPC", "EURUSD=X"])).rejects.toBe(YAHOO_DOWN);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([[undefined], [""]])("doesn't try Finnhub when FINNHUB_API_KEY is %j", async (value) => {
    vi.stubEnv("FINNHUB_API_KEY", value as string);
    yahoo.quote.mockRejectedValue(YAHOO_DOWN);
    const fetchStub = stubFinnhub({ AAPL: 1 });
    await expect(quotes(["AAPL"])).rejects.toBe(YAHOO_DOWN);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("fails with Yahoo's error when Finnhub fails too", async () => {
    yahoo.quote.mockRejectedValue(YAHOO_DOWN);
    stubFinnhub({});
    await expect(quotes(["AAPL", "MSFT"])).rejects.toBe(YAHOO_DOWN);
  });

  it("gives an empty list when Finnhub answers but knows none of them", async () => {
    yahoo.quote.mockRejectedValue(YAHOO_DOWN);
    stubFinnhub({ ZZZZZ: 0 });
    expect(await quotes(["ZZZZZ"])).toEqual([]);
  });
});

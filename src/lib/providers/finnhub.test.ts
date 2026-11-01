import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { clearCache } from "../cache";
import { companyNews, covers, quote, topicNews } from "./finnhub";
import { resetHealth } from "./health";

const KEY = "d0123456789abcdef0123456789abcdefg";

const AAPL = { c: 344.63, d: -4.28, dp: -1.2267, h: 350.1, l: 343.2, o: 349, pc: 348.91, t: 1793476800 };
// What Finnhub answers for a symbol it doesn't know: a 200 full of zeros.
const UNKNOWN = { c: 0, d: null, dp: null, h: 0, l: 0, o: 0, pc: 0, t: 0 };

const respondWith = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function stubFinnhub(body: unknown = AAPL, status = 200) {
  const fetchStub = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => respondWith(body, status));
  vi.stubGlobal("fetch", fetchStub);
  return fetchStub;
}

const rejection = (promise: Promise<unknown>) =>
  promise.then(
    () => {
      throw new Error("expected a rejection");
    },
    (error: Error) => error,
  );

beforeEach(() => {
  clearCache();
  resetHealth();
  vi.stubEnv("FINNHUB_API_KEY", KEY);
  vi.stubEnv("FAIL_SOURCES", "");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("covers", () => {
  it.each(["AAPL", "W", "SPY", "BRK-B", "GOOGL"])("takes the US ticker %s", (symbol) => {
    expect(covers(symbol)).toBe(true);
  });

  it.each(["^GSPC", "EURUSD=X", "GC=F", "VOD.L", "000001.SS", "BTC-USD", "7203.T"])("leaves out %s", (symbol) => {
    expect(covers(symbol)).toBe(false);
  });
});

describe("quote", () => {
  it("sends the key in a header, keeping it out of the URL", async () => {
    const fetchStub = stubFinnhub();
    await quote("AAPL");
    const [url, init] = fetchStub.mock.calls[0];
    expect(url).toBe("https://finnhub.io/api/v1/quote?symbol=AAPL");
    expect(init?.headers).toEqual({ "X-Finnhub-Token": KEY });
  });

  it("asks for a class share by Finnhub's name for it", async () => {
    const fetchStub = stubFinnhub();
    expect((await quote("BRK-B"))?.symbol).toBe("BRK-B");
    expect(new URL(fetchStub.mock.calls[0][0]).searchParams.get("symbol")).toBe("BRK.B");
  });

  it("maps Finnhub's fields, with the symbol standing in for the name it doesn't give", async () => {
    stubFinnhub();
    expect(await quote("AAPL")).toEqual({
      symbol: "AAPL",
      name: "AAPL",
      type: "UNKNOWN",
      currency: "USD",
      price: 344.63,
      change: -4.28,
      changePercent: -1.2267,
      previousClose: 348.91,
      open: 349,
      dayHigh: 350.1,
      dayLow: 343.2,
      time: 1793476800,
    });
  });

  it("treats a quote of zero as an unknown symbol, not a price", async () => {
    stubFinnhub(UNKNOWN);
    expect(await quote("ZZZZZ")).toBeNull();
  });

  it("holds a quote for a minute, as the free plan allows 60 requests in one", async () => {
    const fetchStub = stubFinnhub();
    await quote("AAPL");
    await quote("AAPL");
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it("says when Finnhub refuses the key", async () => {
    stubFinnhub({ error: "Invalid API key." }, 401);
    const error = await rejection(quote("AAPL"));
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401 });
    expect(error.message).toMatch(/FINNHUB_API_KEY/);
  });

  it("reports hitting the rate limit as a source failure, and asks again next time", async () => {
    stubFinnhub({ error: "API limit reached." }, 429);
    expect(await rejection(quote("AAPL"))).toMatchObject({ status: 502 });
    stubFinnhub();
    expect((await quote("AAPL"))?.price).toBe(344.63);
  });
});

describe("news", () => {
  const story = { category: "company", datetime: 1793518367, headline: "Apple CEO says", id: 1, image: "", related: "AAPL", source: "Yahoo", summary: "", url: "https://finnhub.io/api/news?id=1" };

  it("asks for a company's last week of news, as Finnhub names the symbol", async () => {
    const fetchStub = stubFinnhub([story]);

    const items = await companyNews("BRK-B", new Date("2026-11-01T12:00:00Z"));

    expect(fetchStub.mock.calls[0][0]).toBe("https://finnhub.io/api/v1/company-news?symbol=BRK.B&from=2026-10-25&to=2026-11-01");
    expect(fetchStub.mock.calls[0][1]?.headers).toMatchObject({ "X-Finnhub-Token": KEY });
    expect(items).toEqual([{ title: "Apple CEO says", url: story.url, time: 1793518367, source: "Yahoo Finance" }]);
  });

  it("asks for a category's news", async () => {
    const fetchStub = stubFinnhub([story]);
    await topicNews("crypto");
    expect(fetchStub.mock.calls[0][0]).toBe("https://finnhub.io/api/v1/news?category=crypto");
  });

  it("explains a refused key", async () => {
    stubFinnhub({ error: "Invalid API key" }, 401);
    expect(await rejection(topicNews("merger"))).toMatchObject({ status: 401 });
  });
});

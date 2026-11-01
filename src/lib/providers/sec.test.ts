import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { clearCache } from "../cache";
import { filings, financials } from "./sec";

const TICKERS = {
  "0": { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." },
  "1": { cik_str: 884394, ticker: "SPY", title: "SPDR S&P 500 ETF TRUST" },
};

const FACTS = {
  entityName: "Apple Inc.",
  facts: {
    "us-gaap": {
      Revenues: {
        units: {
          USD: [{ start: "2024-10-01", end: "2025-09-27", val: 100, accn: "a", fy: 2025, fp: "FY", form: "10-K", filed: "2025-10-31" }],
        },
      },
    },
  },
};

const SUBMISSIONS = {
  name: "Apple Inc.",
  insiderTransactionForIssuerExists: 1,
  insiderTransactionForOwnerExists: 0,
  filings: {
    recent: {
      accessionNumber: ["0001-26-000001", "0000320193-25-000079", "0000320193-25-000050", "0001-25-000002"],
      filingDate: ["2026-10-29", "2025-10-31", "2025-08-01", "2025-07-01"],
      reportDate: ["2026-10-27", "2025-09-27", "", "2025-06-28"],
      form: ["4", "10-K", "10-K/A", "10-Q"],
      primaryDocument: ["xslF345X06/form4.xml", "aapl-20250927.htm", "amend.htm", "aapl-q3.htm"],
    },
  },
};

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

/** Answers by URL, 404 for anything else, and keeps the calls. */
function stubSec(routes: Record<string, unknown>) {
  const fetchStub = vi.fn(async (url: string) => {
    const match = Object.keys(routes).find((part) => url.includes(part));
    return match ? json(routes[match]) : new Response("", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchStub);
  return fetchStub;
}

const rejection = (promise: Promise<unknown>) =>
  promise.then(
    () => {
      throw new Error("expected a rejection");
    },
    (error: unknown) => error,
  );

beforeEach(() => {
  clearCache();
  vi.stubEnv("SEC_USER_AGENT", "FinTerminal test@example.com");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("SEC requests", () => {
  it("names us on every request, as the SEC requires", async () => {
    const fetchStub = stubSec({ company_tickers: TICKERS, "companyfacts/CIK": FACTS });

    await financials("AAPL", "annual");

    expect(fetchStub).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchStub.mock.calls as unknown as [string, RequestInit][]) {
      expect(init.headers).toMatchObject({ "User-Agent": "FinTerminal test@example.com" });
    }
  });

  it("explains a missing SEC_USER_AGENT, without calling the SEC", async () => {
    vi.stubEnv("SEC_USER_AGENT", "");
    const fetchStub = stubSec({});

    const error = await rejection(financials("AAPL", "annual"));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 500, message: expect.stringContaining("SEC_USER_AGENT") });
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("spaces requests out to stay under the SEC's 10 a second", async () => {
    vi.useFakeTimers();
    const started: number[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        started.push(Date.now());
        return json({ "0": TICKERS["0"] });
      }),
    );

    const all = Promise.all([filings("AAPL", []), financials("AAPL", "annual"), filings("SPY", [])]);
    all.catch(() => {});
    await vi.advanceTimersByTimeAsync(1000);
    vi.useRealTimers();

    expect(started.length).toBeGreaterThan(1);
    const gaps = started.slice(1).map((time, i) => time - started[i]);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(100);
  });

  it("loads the ticker list once", async () => {
    const fetchStub = stubSec({ company_tickers: TICKERS, "companyfacts/CIK": FACTS, "submissions/CIK": SUBMISSIONS });

    await financials("AAPL", "annual");
    await filings("AAPL", []);

    const tickerCalls = fetchStub.mock.calls.filter(([url]) => url.includes("company_tickers"));
    expect(tickerCalls).toHaveLength(1);
  });

  it("treats an SEC outage as a failure, not as missing data", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));

    const error = await rejection(financials("AAPL", "annual"));

    expect(error).toMatchObject({ status: 502, message: "SEC EDGAR isn't responding. Retrying…" });
  });
});

describe("financials", () => {
  it("returns statements under the symbol asked for", async () => {
    stubSec({ company_tickers: TICKERS, "companyfacts/CIK0000320193.json": FACTS });

    const result = await financials("AAPL", "annual");

    expect(result).toMatchObject({ symbol: "AAPL", name: "Apple Inc.", period: "annual" });
    expect(result.periods).toEqual([{ end: "2025-09-27", label: "FY2025" }]);
  });

  it("answers both periods from one download", async () => {
    const fetchStub = stubSec({ company_tickers: TICKERS, "companyfacts/CIK0000320193.json": FACTS });

    await financials("AAPL", "annual");
    await rejection(financials("AAPL", "quarterly"));

    expect(fetchStub.mock.calls.filter(([url]) => url.includes("companyfacts"))).toHaveLength(1);
  });

  it("says plainly when a ticker isn't known to the SEC", async () => {
    stubSec({ company_tickers: TICKERS });

    const error = await rejection(financials("QQQ", "annual"));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, message: expect.stringContaining("QQQ") });
  });

  it("says plainly when a fund has no statements", async () => {
    stubSec({ company_tickers: TICKERS });

    const error = await rejection(financials("SPY", "annual"));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, message: expect.stringContaining("SPY") });
  });
});

describe("filings", () => {
  beforeEach(() => {
    stubSec({ company_tickers: TICKERS, "submissions/CIK0000320193.json": SUBMISSIONS });
  });

  it("lists filings newest first, with a link to each document", async () => {
    const result = await filings("AAPL", []);

    expect(result).toMatchObject({ symbol: "AAPL", name: "Apple Inc." });
    expect(result.filings[1]).toEqual({
      form: "10-K",
      filed: "2025-10-31",
      reportDate: "2025-09-27",
      url: "https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/aapl-20250927.htm",
    });
  });

  it("filters by form and keeps amendments to those forms", async () => {
    const result = await filings("AAPL", ["10-K"]);

    expect(result.filings.map((filing) => filing.form)).toEqual(["10-K", "10-K/A"]);
  });

  it("leaves a date the SEC doesn't give empty", async () => {
    const amended = (await filings("AAPL", ["10-K"])).filings[1];

    expect(amended.reportDate).toBeNull();
  });

  it("leaves out a company's insider forms when it has no insiders of its own: they're about stock it holds elsewhere", async () => {
    stubSec({
      company_tickers: TICKERS,
      "submissions/CIK0000320193.json": { ...SUBMISSIONS, insiderTransactionForIssuerExists: 0, insiderTransactionForOwnerExists: 1 },
    });

    expect((await filings("AAPL", ["4"])).filings).toEqual([]);
    expect((await filings("AAPL", ["10-K"])).filings).toHaveLength(2);
  });

  it("says when a company's insider forms may be about stock it holds elsewhere", async () => {
    expect((await filings("AAPL", ["4"])).filesAsHolder).toBe(false);

    clearCache();
    stubSec({
      company_tickers: TICKERS,
      "submissions/CIK0000320193.json": { ...SUBMISSIONS, insiderTransactionForOwnerExists: 1 },
    });

    const mixed = await filings("AAPL", ["4"]);
    expect(mixed.filesAsHolder).toBe(true);
    expect(mixed.filings).toHaveLength(1);
  });

  it("caps a long list, so a heavy filer's thousands of notes can't flood a response", async () => {
    const count = 5000;
    const form = Array.from({ length: count }, () => "424B2");
    stubSec({
      company_tickers: TICKERS,
      "submissions/CIK0000320193.json": {
        name: "Bank",
        filings: {
          recent: {
            accessionNumber: form.map((_, i) => `0001-26-${i}`),
            filingDate: form.map(() => "2026-01-01"),
            reportDate: form.map(() => ""),
            form,
            primaryDocument: form.map(() => "note.htm"),
          },
        },
      },
    });

    expect((await filings("AAPL", [])).filings).toHaveLength(100);
  });

  it("says plainly when a ticker isn't known to the SEC", async () => {
    const error = await rejection(filings("QQQ", []));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, message: expect.stringContaining("QQQ") });
  });
});

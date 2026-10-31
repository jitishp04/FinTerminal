import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { clearCache } from "../cache";
import { TENORS } from "../curve";
import { INDICATORS } from "../macro";
import { curve, dashboard, series } from "./fred";

const KEY = "0123456789abcdef0123456789abcdef";

const INFO = {
  seriess: [
    {
      id: "UNRATE",
      title: "Unemployment Rate",
      units: "Percent",
      units_short: "%",
      frequency: "Monthly",
      frequency_short: "M",
    },
  ],
};

const OBSERVATIONS = {
  observations: [
    { date: "2025-09-01", value: "4.4" },
    { date: "2025-10-01", value: "." },
    { date: "2025-11-01", value: "4.5" },
  ],
};

const respondWith = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** Answers each kind of FRED request and keeps the calls. */
function stubFred(info: unknown = INFO, observations: unknown = OBSERVATIONS) {
  const fetchStub = vi.fn(async (url: string) => respondWith(url.includes("/series/observations") ? observations : info));
  vi.stubGlobal("fetch", fetchStub);
  return fetchStub;
}

function stubFailure(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => respondWith(body, status)),
  );
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
  vi.stubEnv("FRED_API_KEY", KEY);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("FRED requests", () => {
  it("asks for JSON for that series with the key", async () => {
    const fetchStub = stubFred();
    await series("UNRATE");
    const url = new URL(fetchStub.mock.calls[0][0]);
    expect(url.host).toBe("api.stlouisfed.org");
    expect(url.searchParams.get("series_id")).toBe("UNRATE");
    expect(url.searchParams.get("api_key")).toBe(KEY);
    expect(url.searchParams.get("file_type")).toBe("json");
  });

  it.each([[undefined], [""]])("asks for a key when FRED_API_KEY is %j, and doesn't call FRED", async (value) => {
    vi.stubEnv("FRED_API_KEY", value as string);
    const fetchStub = stubFred();
    const error = await rejection(series("UNRATE"));
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401 });
    expect(error.message).toMatch(/Add FRED_API_KEY to \.env\.local/);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it.each([
    "Bad Request.  The value for variable api_key is not registered.  Read https://fred.stlouisfed.org/docs/api/api_key.html for more information.",
    "Bad Request.  The value for variable api_key is not a 32 character alpha-numeric lower-case string.  Read https://fred.stlouisfed.org/docs/api/api_key.html for more information.",
  ])("says when FRED refuses the key: %s", async (message) => {
    stubFailure(400, { error_code: 400, error_message: message });
    const error = await rejection(series("UNRATE"));
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401 });
    expect(error.message).toMatch(/FRED_API_KEY/);
  });

  it("answers 404 for a series FRED doesn't have", async () => {
    stubFailure(400, { error_code: 400, error_message: "Bad Request.  The series does not exist." });
    const error = await rejection(series("NOSUCHSERIES"));
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, message: "FRED has no series NOSUCHSERIES." });
  });

  it.each([
    [500, { error_code: 500, error_message: "Internal Server Error" }],
    [429, { error_code: 429, error_message: "Too Many Requests.  Exceeded Rate Limit" }],
  ])("treats a %i as a source failure, with the key nowhere in the error", async (status, body) => {
    stubFailure(status, body);
    const error = await rejection(series("UNRATE"));
    expect(error).not.toBeInstanceOf(ApiError);
    expect(`${error.message} ${error.stack}`).not.toContain(KEY);
  });

  it("copes with a failure that isn't JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>Bad Gateway</html>", { status: 502 })),
    );
    const error = await rejection(series("UNRATE"));
    expect(error).not.toBeInstanceOf(ApiError);
    expect(error.message).toMatch(/502/);
  });
});

describe("series", () => {
  it("names the series and gives its units and frequency", async () => {
    stubFred();
    expect(await series("UNRATE")).toMatchObject({
      id: "UNRATE",
      title: "Unemployment Rate",
      units: "%",
      frequency: "Monthly",
      frequencyShort: "M",
    });
  });

  it("drops periods with no reading rather than reading them as zero", async () => {
    stubFred(INFO, {
      observations: [
        { date: "2026-10-09", value: "4.10" },
        { date: "2026-10-12", value: "." },
        { date: "2026-10-13", value: "" },
        { date: "2026-10-14", value: "0.00" },
      ],
    });
    expect((await series("UNRATE")).observations).toEqual([
      { date: "2026-10-09", value: 4.1 },
      { date: "2026-10-14", value: 0 },
    ]);
  });

  it("takes the precision from how FRED writes the values", async () => {
    const decimals = async (...values: string[]) => {
      clearCache();
      stubFred(INFO, { observations: values.map((value, i) => ({ date: `2026-01-0${i + 1}`, value })) });
      return (await series("UNRATE")).decimals;
    };
    expect(await decimals("4.2", "4.3")).toBe(1);
    expect(await decimals("4.98", ".", "5.00")).toBe(2);
    expect(await decimals("159015", "159044")).toBe(0);
    expect(await decimals("1", "1.25")).toBe(2);
  });

  it("keeps a series for later requests", async () => {
    const fetchStub = stubFred();
    await series("UNRATE");
    await series("UNRATE");
    expect(fetchStub).toHaveBeenCalledTimes(2);
  });

  it("doesn't keep a refusal, so adding the key works straight away", async () => {
    vi.stubEnv("FRED_API_KEY", "");
    await rejection(series("UNRATE"));
    vi.stubEnv("FRED_API_KEY", KEY);
    stubFred();
    expect((await series("UNRATE")).id).toBe("UNRATE");
  });
});

describe("dashboard", () => {
  const monthly = {
    observations: Array.from({ length: 30 }, (_, i) => ({
      date: new Date(Date.UTC(2024, i, 1)).toISOString().slice(0, 10),
      value: String(100 + i),
    })),
  };

  it("gives every indicator in order, from one request each", async () => {
    const fetchStub = stubFred(INFO, monthly);
    const rows = await dashboard();
    expect(rows.map(({ id }) => id)).toEqual(INDICATORS.map(({ id }) => id));
    expect(fetchStub).toHaveBeenCalledTimes(INDICATORS.length);
    expect(fetchStub.mock.calls.every(([url]) => url.includes("/series/observations"))).toBe(true);
  });

  it("shares a series' observations with its chart", async () => {
    const fetchStub = stubFred(INFO, monthly);
    await dashboard();
    await series("UNRATE");
    expect(fetchStub).toHaveBeenCalledTimes(INDICATORS.length + 1);
  });

  it("asks for a key rather than failing a row at a time", async () => {
    vi.stubEnv("FRED_API_KEY", "");
    expect(await rejection(dashboard())).toMatchObject({ status: 401 });
  });
});

describe("curve", () => {
  const history = {
    observations: [
      { date: "2025-10-29", value: "3.50" },
      { date: "2026-09-29", value: "4.00" },
      { date: "2026-10-12", value: "." },
      { date: "2026-10-29", value: "4.50" },
    ],
  };

  it("gives every tenor, from one request each", async () => {
    const fetchStub = stubFred(INFO, history);
    const { dates, points } = await curve();
    expect(dates.latest).toBe("2026-10-29");
    expect(points.map(({ tenor }) => tenor)).toEqual(TENORS.map(({ label }) => label));
    expect(points[0]).toMatchObject({ latest: 4.5, monthAgo: 4, yearAgo: 3.5 });
    expect(fetchStub).toHaveBeenCalledTimes(TENORS.length);
    expect(fetchStub.mock.calls.map(([url]) => new URL(url).searchParams.get("series_id"))).toEqual(
      TENORS.map(({ id }) => id),
    );
  });

  it("shares a tenor's observations with its chart", async () => {
    const fetchStub = stubFred(INFO, history);
    await curve();
    await series("DGS10");
    expect(fetchStub).toHaveBeenCalledTimes(TENORS.length + 1);
  });

  it("asks for a key", async () => {
    vi.stubEnv("FRED_API_KEY", "");
    expect(await rejection(curve())).toMatchObject({ status: 401 });
  });
});

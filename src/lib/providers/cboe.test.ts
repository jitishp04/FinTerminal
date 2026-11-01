import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCache } from "../cache";
import { totalPutCall } from "./cboe";
import { health, resetHealth } from "./health";

// Monday 2 November 2026, so the days before it run Friday, Thursday and so on.
const NOW = new Date(Date.UTC(2026, 10, 2, 15));

// Trimmed from a live response on 2 Nov 2026.
const file = (total: string) => ({
  ratios: [
    { name: "TOTAL PUT/CALL RATIO", value: total },
    { name: "EQUITY PUT/CALL RATIO", value: "0.66" },
  ],
});
const answer = (status: number, body?: unknown) => ({ ok: status === 200, status, json: async () => body });
const dateIn = (url: string) => url.match(/(\d{4}-\d{2}-\d{2})_daily_options/)?.[1];

let fetched: ReturnType<typeof vi.fn>;
const days = (byDate: Record<string, string>) =>
  fetched.mockImplementation(async (url: string) => {
    const total = byDate[dateIn(url)!];
    return total ? answer(200, file(total)) : answer(403);
  });

beforeEach(() => {
  clearCache();
  resetHealth();
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  fetched = vi.fn();
  vi.stubGlobal("fetch", fetched);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("FAIL_SOURCES", "");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("totalPutCall", () => {
  it("reads the total ratio from each day's file, oldest first", async () => {
    days({ "2026-10-29": "0.85", "2026-10-30": "0.90" });

    expect(await totalPutCall()).toEqual([0.85, 0.9]);
  });

  it("asks for weekdays only, up to today", async () => {
    days({ "2026-10-30": "0.90" });

    await totalPutCall();

    const asked = fetched.mock.calls.map(([url]) => dateIn(url as string)!);
    expect(asked).toContain("2026-11-02");
    expect(asked).toContain("2026-10-30");
    expect(asked).not.toContain("2026-11-01");
    expect(asked).not.toContain("2026-10-31");
    expect(asked).not.toContain("2026-11-03");
  });

  it("asks for over a year of days, enough for 255 of trading", async () => {
    days({ "2026-10-30": "0.90" });

    await totalPutCall();

    expect(fetched.mock.calls.length).toBeGreaterThanOrEqual(265);
  });

  it("skips a day with no file, as a holiday has none", async () => {
    days({ "2026-10-28": "0.90", "2026-10-30": "0.85" });

    expect(await totalPutCall()).toEqual([0.9, 0.85]);
  });

  it("notes that Cboe answered", async () => {
    days({ "2026-10-30": "0.90" });

    await totalPutCall();

    expect(health().find(({ id }) => id === "cboe")?.state).toBe("ok");
  });

  it("counts no files at all as a failure", async () => {
    days({});

    await expect(totalPutCall()).rejects.toMatchObject({ status: 502, message: "Cboe isn't responding. Retrying…" });
    expect(health().find(({ id }) => id === "cboe")?.state).toBe("down");
  });

  it("counts a server error as a failure, not as a day with no file", async () => {
    fetched.mockImplementation(async () => answer(500));

    await expect(totalPutCall()).rejects.toMatchObject({ status: 502 });
  });

  it("doesn't ask again for a day it has", async () => {
    days({ "2026-10-30": "0.90" });
    await totalPutCall();
    fetched.mockClear();
    clearCacheOfTheList();

    expect(await totalPutCall()).toEqual([0.9]);
    expect(fetched.mock.calls.map(([url]) => dateIn(url as string))).not.toContain("2026-10-30");
  });
});

/** A later refresh of the list: its cached days stay, as they do when the list's own time runs out. */
function clearCacheOfTheList() {
  vi.setSystemTime(new Date(NOW.getTime() + 5 * 60 * 60 * 1000));
}

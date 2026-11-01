import { describe, expect, it } from "vitest";
import { FetchError, pollEvery } from "./fetchApi";

const after = (error: Error | null) => ({ state: { error } });

describe("pollEvery", () => {
  it("keeps the panel's own pace while all is well", () => {
    expect(pollEvery(60 * 60_000)(after(null))).toBe(60 * 60_000);
    expect(pollEvery(false)(after(null))).toBe(false);
  });

  it.each([
    ["a source that isn't responding", new FetchError(502, "Yahoo Finance isn't responding. Retrying…")],
    ["an unreachable server", new FetchError(0, "Can't reach the FinTerminal server.")],
  ])("comes back sooner after %s, even for a panel that never polls", (_, error) => {
    expect(pollEvery(60 * 60_000)(after(error))).toBe(10_000);
    expect(pollEvery(false)(after(error))).toBe(10_000);
  });

  it.each([
    ["an unknown symbol", new FetchError(404, "No data for ZZZZ")],
    ["a missing key", new FetchError(401, "Add FRED_API_KEY to .env.local, then reload this page.")],
  ])("doesn't hurry after %s, which asking again won't change", (_, error) => {
    expect(pollEvery(false)(after(error))).toBe(false);
    expect(pollEvery(600_000)(after(error))).toBe(600_000);
  });
});

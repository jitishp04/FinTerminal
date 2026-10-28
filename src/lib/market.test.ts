import { describe, expect, it } from "vitest";
import { isUsMarketOpen } from "./market";

const at = (iso: string) => isUsMarketOpen(new Date(iso));

describe("isUsMarketOpen", () => {
  // Mon 26 Oct 2026, New York on daylight time (UTC-4)
  it("is open 9:30–16:00 New York time on weekdays", () => {
    expect(at("2026-10-26T13:29:00Z")).toBe(false); // 09:29
    expect(at("2026-10-26T13:30:00Z")).toBe(true); // 09:30
    expect(at("2026-10-26T19:59:00Z")).toBe(true); // 15:59
    expect(at("2026-10-26T20:00:00Z")).toBe(false); // 16:00
  });

  it("is closed on weekends", () => {
    expect(at("2026-10-24T15:00:00Z")).toBe(false); // Sat 11:00
    expect(at("2026-10-25T15:00:00Z")).toBe(false); // Sun 11:00
  });

  // Mon 2 Nov 2026, after daylight time ends: New York is UTC-5
  it("follows New York's daylight-saving change", () => {
    expect(at("2026-11-02T14:00:00Z")).toBe(false); // 09:00
    expect(at("2026-11-02T14:30:00Z")).toBe(true); // 09:30
  });
});

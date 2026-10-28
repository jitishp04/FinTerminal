import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT, parseLayout, serializeLayout } from "./layout";

describe("parseLayout", () => {
  it("falls back to the default layout when nothing is stored", () => {
    expect(parseLayout(null)).toEqual(DEFAULT_LAYOUT);
  });

  it("falls back to the default layout on malformed data", () => {
    expect(parseLayout("not json")).toEqual(DEFAULT_LAYOUT);
    expect(parseLayout("{}")).toEqual(DEFAULT_LAYOUT);
    expect(parseLayout(JSON.stringify({ panels: ["HELP"], focused: 0 }))).toEqual(DEFAULT_LAYOUT);
  });

  it("round-trips a saved layout", () => {
    const layout = {
      panels: [
        { fn: "GP", symbol: "^GSPC", args: [] },
        { fn: "ECO", args: ["UNRATE"] },
        { fn: "GP", symbol: "W", args: [] },
        { fn: "FX", args: [] },
      ],
      focused: 2,
    };
    expect(parseLayout(serializeLayout(layout))).toEqual(layout);
  });

  it("replaces only the panels whose stored command no longer parses", () => {
    const raw = JSON.stringify({ panels: ["MSFT DES", "BOGUS", "WEI", 42], focused: 1 });
    const layout = parseLayout(raw);
    expect(layout.panels[0]).toEqual({ fn: "DES", symbol: "MSFT", args: [] });
    expect(layout.panels[1]).toEqual(DEFAULT_LAYOUT.panels[1]);
    expect(layout.panels[2]).toEqual({ fn: "WEI", args: [] });
    expect(layout.panels[3]).toEqual(DEFAULT_LAYOUT.panels[3]);
    expect(layout.focused).toBe(1);
  });

  it("resets an out-of-range focus to the first panel", () => {
    const panels = ["HELP", "WEI", "W", "FX"];
    expect(parseLayout(JSON.stringify({ panels, focused: 7 })).focused).toBe(0);
    expect(parseLayout(JSON.stringify({ panels, focused: "1" })).focused).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT, goBack, HISTORY_LIMIT, type Layout, openIn, parseLayout, serializeLayout } from "./layout";

describe("parseLayout", () => {
  it("falls back to the default layout when nothing is stored", () => {
    expect(parseLayout(null)).toEqual(DEFAULT_LAYOUT);
  });

  it("falls back to the default layout on malformed data", () => {
    expect(parseLayout("not json")).toEqual(DEFAULT_LAYOUT);
    expect(parseLayout("{}")).toEqual(DEFAULT_LAYOUT);
    expect(parseLayout(JSON.stringify({ panels: ["HELP"], focused: 0 }))).toEqual(DEFAULT_LAYOUT);
  });

  it("round-trips a saved layout, history and all", () => {
    const layout: Layout = {
      panels: [
        { fn: "GP", symbol: "^GSPC", args: [] },
        { fn: "ECO", args: ["UNRATE"] },
        { fn: "GP", symbol: "W", args: [] },
        { fn: "FX", args: [] },
      ],
      focused: 2,
      history: [[], [{ fn: "ECO", args: [] }], [{ fn: "W", args: [] }, { fn: "THS", symbol: "AAPL", args: [] }], []],
    };
    expect(parseLayout(serializeLayout(layout))).toEqual(layout);
  });

  it("starts each panel's history afresh for a layout saved before there was one, or a damaged one", () => {
    const panels = ["HELP", "WEI", "W", "FX"];
    const empty = [[], [], [], []];
    expect(parseLayout(JSON.stringify({ panels, focused: 0 })).history).toEqual(empty);
    expect(parseLayout(JSON.stringify({ panels, focused: 0, history: "W" })).history).toEqual(empty);
    expect(parseLayout(JSON.stringify({ panels, focused: 0, history: [["W"]] })).history).toEqual(empty);
  });

  it("drops history entries that no longer parse, and keeps the rest of the panel's", () => {
    const raw = JSON.stringify({ panels: ["HELP", "WEI", "W", "FX"], focused: 0, history: [["W", "BOGUS", 7, "AAPL THS"], null, [], ["MOST"]] });
    expect(parseLayout(raw).history).toEqual([
      [{ fn: "W", args: [] }, { fn: "THS", symbol: "AAPL", args: [] }],
      [],
      [],
      [{ fn: "MOST", args: [] }],
    ]);
  });

  it(`keeps no more than the last ${HISTORY_LIMIT} steps of a stored history`, () => {
    const long = Array.from({ length: HISTORY_LIMIT + 5 }, (_, i) => `S${i} GP`);
    const [first] = parseLayout(JSON.stringify({ panels: ["HELP", "WEI", "W", "FX"], focused: 0, history: [long, [], [], []] })).history;
    expect(first).toHaveLength(HISTORY_LIMIT);
    expect(first[0]).toEqual({ fn: "GP", symbol: "S5", args: [] });
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

describe("openIn and goBack", () => {
  const W = { fn: "W", args: [] };
  const AAPL = { fn: "THS", symbol: "AAPL", args: [] };
  const NVDA = { fn: "THS", symbol: "NVDA", args: [] };
  const start: Layout = { ...DEFAULT_LAYOUT, panels: [W, W, W, W], focused: 0 };

  it("shows the command in the panel, focuses it, and remembers what was there", () => {
    const next = openIn(start, 2, AAPL);
    expect(next.panels).toEqual([W, W, AAPL, W]);
    expect(next.focused).toBe(2);
    expect(next.history).toEqual([[], [], [W], []]);
  });

  it("goes back a step at a time, focusing the panel, until there's nothing left", () => {
    const opened = openIn(openIn(start, 1, AAPL), 1, NVDA);
    const once = goBack({ ...opened, focused: 3 }, 1);
    expect(once.panels[1]).toEqual(AAPL);
    expect(once.focused).toBe(1);
    expect(once.history[1]).toEqual([W]);
    const twice = goBack(once, 1);
    expect(twice.panels[1]).toEqual(W);
    expect(twice.history[1]).toEqual([]);
    expect(goBack(twice, 1)).toBe(twice);
  });

  it("adds no step for showing what the panel already shows, but still focuses it", () => {
    const next = openIn({ ...start, focused: 0 }, 2, W);
    expect(next.history).toEqual(start.history);
    expect(next.focused).toBe(2);
  });

  it("keeps each panel's history to itself", () => {
    const next = goBack(openIn(openIn(start, 0, AAPL), 3, NVDA), 0);
    expect(next.panels).toEqual([W, W, W, NVDA]);
    expect(next.history).toEqual([[], [], [], [W]]);
  });

  it(`remembers the last ${HISTORY_LIMIT} steps`, () => {
    let layout = start;
    for (let i = 0; i < HISTORY_LIMIT + 3; i++) layout = openIn(layout, 0, { fn: "GP", symbol: `S${i}`, args: [] });
    expect(layout.history[0]).toHaveLength(HISTORY_LIMIT);
    expect(layout.history[0][0]).toEqual({ fn: "GP", symbol: "S2", args: [] });
  });
});

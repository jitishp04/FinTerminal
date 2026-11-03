import { formatCommand, parseCommand, type Command } from "./commands";

export interface Layout {
  panels: Command[];
  focused: number;
  /** What each panel showed before, oldest first, for Back. */
  history: Command[][];
}

export const PANEL_COUNT = 4;
/** How many steps back each panel remembers. */
export const HISTORY_LIMIT = 20;

const DEFAULT_COMMANDS = ["HELP", "AAPL GP", "WEI", "W"];

const parseOrThrow = (input: string): Command => {
  const result = parseCommand(input);
  if (!result.ok) throw new Error(`Bad default command: ${input}`);
  return result.command;
};

export const DEFAULT_LAYOUT: Layout = {
  panels: DEFAULT_COMMANDS.map(parseOrThrow),
  focused: 0,
  history: DEFAULT_COMMANDS.map(() => []),
};

const same = (a: Command, b: Command) => formatCommand(a) === formatCommand(b);
const replaceAt = <T>(items: T[], index: number, item: T) => items.map((each, i) => (i === index ? item : each));

/** Shows `command` in panel `index` and focuses it, remembering what the panel showed for Back. Showing the same thing again adds no step. */
export function openIn(layout: Layout, index: number, command: Command): Layout {
  const current = layout.panels[index];
  if (same(current, command)) return { ...layout, focused: index };
  return {
    panels: replaceAt(layout.panels, index, command),
    focused: index,
    history: replaceAt(layout.history, index, [...layout.history[index], current].slice(-HISTORY_LIMIT)),
  };
}

/** Panel `index` back to what it showed before, and focused. Unchanged with nothing to go back to. */
export function goBack(layout: Layout, index: number): Layout {
  const past = layout.history[index];
  if (past.length === 0) return layout;
  return {
    panels: replaceAt(layout.panels, index, past[past.length - 1]),
    focused: index,
    history: replaceAt(layout.history, index, past.slice(0, -1)),
  };
}

/** Stored as command strings so loading re-validates them with the parser. */
export function serializeLayout(layout: Layout): string {
  return JSON.stringify({
    panels: layout.panels.map(formatCommand),
    focused: layout.focused,
    history: layout.history.map((past) => past.map(formatCommand)),
  });
}

/** Parses a stored layout. Anything malformed falls back to the default, slot by slot, and a history entry that doesn't parse is dropped. */
export function parseLayout(raw: string | null): Layout {
  let data: unknown;
  try {
    data = raw === null ? null : JSON.parse(raw);
  } catch {
    return DEFAULT_LAYOUT;
  }
  if (!isRecord(data) || !Array.isArray(data.panels) || data.panels.length !== PANEL_COUNT) return DEFAULT_LAYOUT;

  const panels = data.panels.map((stored, i) => {
    const result = typeof stored === "string" ? parseCommand(stored) : null;
    return result?.ok ? result.command : DEFAULT_LAYOUT.panels[i];
  });
  const f = data.focused;
  const focused = typeof f === "number" && Number.isInteger(f) && f >= 0 && f < PANEL_COUNT ? f : 0;
  // Saved before panels had a history, or damaged: start each panel's afresh.
  const stored = Array.isArray(data.history) && data.history.length === PANEL_COUNT ? data.history : [];
  const history = panels.map((_, i) => {
    const past: unknown = stored[i];
    if (!Array.isArray(past)) return [];
    return past
      .flatMap((entry) => {
        const result = typeof entry === "string" ? parseCommand(entry) : null;
        return result?.ok ? [result.command] : [];
      })
      .slice(-HISTORY_LIMIT);
  });
  return { panels, focused, history };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

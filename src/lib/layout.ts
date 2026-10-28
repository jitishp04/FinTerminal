import { formatCommand, parseCommand, type Command } from "./commands";

export interface Layout {
  panels: Command[];
  focused: number;
}

export const PANEL_COUNT = 4;

const DEFAULT_COMMANDS = ["HELP", "AAPL GP", "WEI", "W"];

const parseOrThrow = (input: string): Command => {
  const result = parseCommand(input);
  if (!result.ok) throw new Error(`Bad default command: ${input}`);
  return result.command;
};

export const DEFAULT_LAYOUT: Layout = { panels: DEFAULT_COMMANDS.map(parseOrThrow), focused: 0 };

/** Stored as command strings so loading re-validates them with the parser. */
export function serializeLayout(layout: Layout): string {
  return JSON.stringify({ panels: layout.panels.map(formatCommand), focused: layout.focused });
}

/** Parses a stored layout. Anything malformed falls back to the default, slot by slot. */
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
  return { panels, focused };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

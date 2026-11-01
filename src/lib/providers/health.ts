import { ApiError } from "../api";
import { SOURCES, type SourceHealth, type SourceId } from "../sources";

interface Outcome {
  ok: boolean;
  lastOk?: number;
}

/** The setting each source can't work without. */
const NEEDS: Partial<Record<SourceId, string>> = {
  sec: "SEC_USER_AGENT",
  fred: "FRED_API_KEY",
  finnhub: "FINNHUB_API_KEY",
};

const outcomes = new Map<SourceId, Outcome>();

function record(source: SourceId, ok: boolean) {
  outcomes.set(source, { ok, lastOk: ok ? Date.now() : outcomes.get(source)?.lastOk });
}

/** FAIL_SOURCES in .env.local, e.g. `yahoo,sec`, makes those sources fail, to try out what the panels do. */
const forcedToFail = (source: SourceId) =>
  (process.env.FAIL_SOURCES ?? "")
    .split(",")
    .map((name) => name.trim())
    .includes(source);

/**
 * Runs one call to a source and notes how it went for the status bar. A failure
 * comes out as a message that names the source: the panels show it as it is.
 */
export async function tracked<T>(source: SourceId, load: () => Promise<T>): Promise<T> {
  try {
    if (forcedToFail(source)) throw new Error(`FAIL_SOURCES includes ${source}`);
    const value = await load();
    record(source, true);
    return value;
  } catch (error) {
    // A 404 is an answer: the source works and has no such record.
    record(source, error instanceof ApiError && error.status === 404);
    if (error instanceof ApiError) throw error;
    console.error(error);
    throw new ApiError(502, `${SOURCES[source]} isn't responding. Retrying…`);
  }
}

export function health(): SourceHealth[] {
  return (Object.keys(SOURCES) as SourceId[]).map((id) => {
    const need = NEEDS[id];
    const outcome = outcomes.get(id);
    const state = need && !process.env[need] ? "off" : !outcome ? "idle" : outcome.ok ? "ok" : "down";
    return { id, name: SOURCES[id], state, ...(outcome?.lastOk && { lastOk: outcome.lastOk }) };
  });
}

/** Forgets every outcome. For tests. */
export function resetHealth() {
  outcomes.clear();
}

import { ApiError } from "../api";
import { cached } from "../cache";
import { TENORS, toCurve } from "../curve";
import { INDICATORS, toIndicator } from "../macro";
import type { MacroIndicator, MacroSeries, Observation, YieldCurve } from "../types";

const BASE = "https://api.stlouisfed.org/fred";

// Under the panels' hourly refresh. Equal to it, every other refresh would get the last one's data.
const SERIES_TTL = 50 * 60 * 1000;

const NO_MATCH = /does not exist/i;

interface FredInfo {
  seriess: { title: string; units_short: string; frequency: string; frequency_short: string }[];
}

interface FredObservations {
  /** Oldest first. `value` is text, and "." for a period with no reading, such as a holiday. */
  observations: { date: string; value: string }[];
}

/** One FRED request. The key is in the URL, so the URL stays out of the errors, which reach the server's log. */
async function request<T>(path: string, id: string): Promise<T> {
  const key = process.env.FRED_API_KEY;
  if (!key) throw new ApiError(401, "Add FRED_API_KEY to .env.local, then reload this page.");

  const response = await fetch(`${BASE}/${path}?series_id=${id}&api_key=${key}&file_type=json`);
  if (response.ok) return response.json() as Promise<T>;

  const body: { error_message?: string } = await response.json().catch(() => ({}));
  const message = body.error_message ?? "";
  if (message.includes("api_key")) {
    throw new ApiError(401, "FRED refused FRED_API_KEY. Check it in .env.local, then reload this page.");
  }
  if (NO_MATCH.test(message)) throw new ApiError(404, `FRED has no series ${id}.`);
  throw new Error(`FRED answered ${response.status} for ${id}`);
}

const decimalsOf = (value: string) => value.split(".")[1]?.length ?? 0;

/** Every reading of a series, and the decimals FRED writes them to. */
function readings(id: string): Promise<{ observations: Observation[]; decimals: number }> {
  return cached(`fred:observations:${id}`, SERIES_TTL, async () => {
    const { observations } = await request<FredObservations>("series/observations", id);
    const real = observations.filter(({ value }) => !Number.isNaN(Number.parseFloat(value)));
    return {
      observations: real.map(({ date, value }) => ({ date, value: Number.parseFloat(value) })),
      decimals: real.reduce((most, { value }) => Math.max(most, decimalsOf(value)), 0),
    };
  });
}

function info(id: string) {
  return cached(`fred:info:${id}`, SERIES_TTL, async () => (await request<FredInfo>("series", id)).seriess[0]);
}

/** A series with its whole history. A 404 if FRED has no such series. */
export async function series(id: string): Promise<MacroSeries> {
  const [about, { observations, decimals }] = await Promise.all([info(id), readings(id)]);
  return {
    id,
    title: about.title,
    units: about.units_short,
    frequency: about.frequency,
    frequencyShort: about.frequency_short,
    decimals,
    observations,
  };
}

/** The ECO dashboard's rows. */
export function dashboard(): Promise<MacroIndicator[]> {
  return Promise.all(INDICATORS.map(async (def) => toIndicator(def, (await readings(def.id)).observations)));
}

/** The Treasury curve now, a month ago and a year ago. */
export async function curve(): Promise<YieldCurve> {
  return toCurve(await Promise.all(TENORS.map(async ({ id }) => (await readings(id)).observations)));
}

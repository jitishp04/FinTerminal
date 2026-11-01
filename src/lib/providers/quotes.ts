import type { Quote } from "../types";
import * as finnhub from "./finnhub";
import * as yahoo from "./yahoo";

/** Quotes from Yahoo. If it fails, the US stocks among them come from Finnhub, when there's a key for it. */
export async function quotes(symbols: string[]): Promise<Quote[]> {
  try {
    return await yahoo.quote(symbols);
  } catch (error) {
    const stocks = process.env.FINNHUB_API_KEY ? symbols.filter(finnhub.covers) : [];
    const results = await Promise.allSettled(stocks.map(finnhub.quote));
    // Yahoo's is the failure to report: a panel can't know Finnhub was tried.
    if (results.every(({ status }) => status === "rejected")) throw error;
    return results.flatMap((result) => (result.status === "fulfilled" && result.value ? [result.value] : []));
  }
}

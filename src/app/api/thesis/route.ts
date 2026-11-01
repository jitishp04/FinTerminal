import type { NextRequest } from "next/server";
import { readSymbol, respond } from "@/lib/api";
import * as yahoo from "@/lib/providers/yahoo";
import { benchmarkFor } from "@/lib/thesis";
import type { Thesis } from "@/lib/types";

/** GET /api/thesis?symbol=AAPL → Thesis: the symbol's weeks, its market's over the same years, and its report dates. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  return respond(async (): Promise<Thesis> => {
    const symbol = readSymbol(params, "symbol");
    const stock = await yahoo.weekly(symbol);
    const benchmark = benchmarkFor(stock.currency);
    // The chart stands without the dates: their row in the table just says n/a.
    const [market, earnings] = await Promise.all([yahoo.weekly(benchmark.symbol), yahoo.earningsDates(symbol).catch(() => [])]);
    // The market's last close before the stock begins is kept, for a first week the market didn't trade.
    const first = market.weeks.findLastIndex(({ time }) => time <= stock.weeks[0]?.time);
    const weeks = market.weeks.slice(Math.max(first, 0)).map(({ time, close }) => ({ time, close }));
    return { ...stock, benchmark: { ...benchmark, weeks }, earnings };
  });
}

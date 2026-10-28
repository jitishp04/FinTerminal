import type { NextRequest } from "next/server";
import { ApiError, readSymbol, respond } from "@/lib/api";
import * as yahoo from "@/lib/providers/yahoo";
import { CHART_RANGES, type ChartRange } from "@/lib/types";

/** GET /api/chart?symbol=AAPL&range=1Y → Chart. `range` is one of CHART_RANGES, default 1Y. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  return respond(async () => {
    const symbol = readSymbol(params, "symbol");
    const range = (params.get("range")?.toUpperCase() ?? "1Y") as ChartRange;
    if (!CHART_RANGES.includes(range)) throw new ApiError(400, `range must be one of ${CHART_RANGES.join(", ")}`);
    return yahoo.chart(symbol, range);
  });
}

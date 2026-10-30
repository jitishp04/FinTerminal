import type { NextRequest } from "next/server";
import { ApiError, readSymbol, respond } from "@/lib/api";
import * as sec from "@/lib/providers/sec";
import { FINANCIAL_PERIODS, type FinancialPeriod } from "@/lib/types";

/** GET /api/financials?symbol=AAPL&period=annual → Financials. `period` is one of FINANCIAL_PERIODS, default annual. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  return respond(async () => {
    const symbol = readSymbol(params, "symbol");
    const period = (params.get("period")?.toLowerCase() ?? "annual") as FinancialPeriod;
    if (!FINANCIAL_PERIODS.includes(period)) {
      throw new ApiError(400, `period must be one of ${FINANCIAL_PERIODS.join(", ")}`);
    }
    return sec.financials(symbol, period);
  });
}

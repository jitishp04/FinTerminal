import type { NextRequest } from "next/server";
import { ApiError, readSymbol, respond } from "@/lib/api";
import { toDcfInputs, unfitReason } from "@/lib/dcfInputs";
import * as fred from "@/lib/providers/fred";
import { quotes } from "@/lib/providers/quotes";
import * as sec from "@/lib/providers/sec";
import * as yahoo from "@/lib/providers/yahoo";

/** GET /api/dcf?symbol=MSFT → DcfInputs, or DcfUnfit with the reason a DCF doesn't fit. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  return respond(async () => {
    const symbol = readSymbol(params, "symbol");
    const profile = await yahoo.profile(symbol);
    const reason = unfitReason(profile);
    if (reason) return { symbol, reason };

    let annual, quarterly;
    try {
      [annual, quarterly] = await Promise.all([sec.financials(symbol, "annual"), sec.financials(symbol, "quarterly")]);
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) throw error;
      return { symbol, reason: `The SEC has no statements for ${symbol}, so there's no free cash flow to start from.` };
    }
    const [[quote], riskFree] = await Promise.all([quotes([symbol]), fred.latest("DGS10")]);
    if (!quote) throw new ApiError(404, `No price for ${symbol}`);
    return toDcfInputs({ profile, price: quote.price, annual, quarterly, riskFree });
  });
}

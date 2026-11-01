import type { NextRequest } from "next/server";
import { readSymbol, respond } from "@/lib/api";
import * as sec from "@/lib/providers/sec";

/** GET /api/insider-trades?symbol=AAPL → InsiderTrades: common-stock transactions from the latest Form 4s, newest first. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  return respond(async () => sec.insiderTrades(readSymbol(params, "symbol")));
}

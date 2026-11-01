import type { NextRequest } from "next/server";
import { readSymbol, respond } from "@/lib/api";
import * as yahoo from "@/lib/providers/yahoo";

/** GET /api/history?symbol=SPY → History: every daily close to the last full day, with dividends. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  return respond(async () => yahoo.history(readSymbol(params, "symbol")));
}

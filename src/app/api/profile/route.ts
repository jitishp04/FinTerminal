import type { NextRequest } from "next/server";
import { readSymbol, respond } from "@/lib/api";
import * as yahoo from "@/lib/providers/yahoo";

/** GET /api/profile?symbol=AAPL → Profile. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  return respond(async () => yahoo.profile(readSymbol(params, "symbol")));
}

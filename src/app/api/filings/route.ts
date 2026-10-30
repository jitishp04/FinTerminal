import type { NextRequest } from "next/server";
import { readSymbol, respond } from "@/lib/api";
import * as sec from "@/lib/providers/sec";

/** GET /api/filings?symbol=AAPL&forms=10-K,10-Q → Filings, newest first. Without `forms`, every kind of filing. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  return respond(async () => {
    const symbol = readSymbol(params, "symbol");
    const forms = (params.get("forms") ?? "")
      .split(",")
      .map((form) => form.trim().toUpperCase())
      .filter(Boolean);
    return sec.filings(symbol, forms);
  });
}

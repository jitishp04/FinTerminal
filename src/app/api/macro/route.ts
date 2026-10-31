import type { NextRequest } from "next/server";
import { ApiError, respond } from "@/lib/api";
import { isArg } from "@/lib/commands";
import * as fred from "@/lib/providers/fred";

/** GET /api/macro?series=UNRATE → MacroSeries. Without `series`, the ECO dashboard: { indicators }. */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("series")?.trim().toUpperCase();
  return respond(async () => {
    if (!id) return { indicators: await fred.dashboard() };
    if (!isArg(id)) throw new ApiError(400, `Invalid series: ${id}`);
    return fred.series(id);
  });
}

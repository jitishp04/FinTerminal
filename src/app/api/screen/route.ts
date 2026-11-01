import type { NextRequest } from "next/server";
import { ApiError, respond } from "@/lib/api";
import { screen } from "@/lib/providers/yahoo";
import { isScreenId, SCREENS } from "@/lib/screens";

/** GET /api/screen?id=undervalued_growth_stocks → Screen: the first 250 stocks it finds. `id` is one of SCREENS. */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") ?? "";
  return respond(async () => {
    if (!isScreenId(id)) throw new ApiError(400, `id must be one of ${SCREENS.map((s) => s.id).join(", ")}`);
    return screen(id);
  });
}

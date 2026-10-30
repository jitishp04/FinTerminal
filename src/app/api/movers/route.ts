import type { NextRequest } from "next/server";
import { ApiError, respond } from "@/lib/api";
import * as yahoo from "@/lib/providers/yahoo";
import { MOVER_TYPES, type MoverType } from "@/lib/types";

/** GET /api/movers?type=gainers → { quotes: Quote[] }, best ranked first. `type` is one of MOVER_TYPES. */
export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get("type") as MoverType;
  return respond(async () => {
    if (!MOVER_TYPES.includes(type)) throw new ApiError(400, `type must be one of ${MOVER_TYPES.join(", ")}`);
    return { quotes: await yahoo.movers(type) };
  });
}

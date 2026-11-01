import { connection } from "next/server";
import { respond } from "@/lib/api";
import * as yahoo from "@/lib/providers/yahoo";
import { loadRotation } from "@/lib/rotation";

/** GET /api/rotation → Rotation: weekly closes for SPY and the 11 sector ETFs, from the cached 5Y chart. */
export async function GET() {
  // It reads nothing from the request, so without this the build would freeze the answer.
  await connection();
  return respond(() => loadRotation((symbol) => yahoo.chart(symbol, "5Y")));
}

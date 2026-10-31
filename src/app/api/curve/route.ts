import { connection } from "next/server";
import { respond } from "@/lib/api";
import * as fred from "@/lib/providers/fred";

/** GET /api/curve → YieldCurve. */
export async function GET() {
  // It reads nothing from the request, so without this the build would freeze the answer.
  await connection();
  return respond(() => fred.curve());
}

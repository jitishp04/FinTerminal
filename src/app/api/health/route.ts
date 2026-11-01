import { connection } from "next/server";
import { respond } from "@/lib/api";
import { health } from "@/lib/providers/health";

/** GET /api/health → { sources: SourceHealth[] }. */
export async function GET() {
  // It reads nothing from the request, so without this the build would freeze the answer.
  await connection();
  return respond(async () => ({ sources: health() }));
}

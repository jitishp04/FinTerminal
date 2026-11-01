import { connection } from "next/server";
import { respond } from "@/lib/api";
import { readMood } from "@/lib/mood";
import * as cboe from "@/lib/providers/cboe";
import * as fred from "@/lib/providers/fred";
import * as yahoo from "@/lib/providers/yahoo";

const closes = (symbol: string) => yahoo.history(symbol).then(({ days }) => days);
/** Without a source, the mood leaves its inputs out and says how many it used. */
const orMissing = <T,>(load: Promise<T>) => load.catch(() => undefined);

/** GET /api/mood → Mood: the market's score, the same for every symbol. */
export async function GET() {
  // It reads nothing from the request, so without this the build would freeze the answer.
  await connection();
  return respond(async () => {
    const [sp500, vix, bonds, highYield, investmentGrade, putCall] = await Promise.all([
      orMissing(closes("^GSPC")),
      orMissing(closes("^VIX")),
      orMissing(closes("TLT")),
      orMissing(fred.observations("BAMLH0A0HYM2")),
      orMissing(fred.observations("BAMLC0A0CM")),
      orMissing(cboe.totalPutCall()),
    ]);
    return readMood({ sp500, vix, bonds, highYield, investmentGrade, putCall });
  });
}

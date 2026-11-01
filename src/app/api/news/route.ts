import type { NextRequest } from "next/server";
import { ApiError, readSymbol, respond } from "@/lib/api";
import { gather, sourcesFor, TOPICS, type Topic } from "@/lib/news";
import * as finnhub from "@/lib/providers/finnhub";
import * as yahoo from "@/lib/providers/yahoo";

/**
 * GET /api/news?symbol=AAPL → News about a symbol.
 * GET /api/news?topic=markets → News on a topic: one of TOPICS, default markets.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  return respond(async () => {
    const feeds = {
      yahoo: yahoo.news,
      covers: finnhub.covers,
      finnhub: process.env.FINNHUB_API_KEY ? { company: finnhub.companyNews, topic: finnhub.topicNews } : undefined,
    };
    if (params.has("symbol")) {
      const { sources, off } = sourcesFor({ symbol: readSymbol(params, "symbol") }, feeds);
      return gather(sources, off);
    }
    const topic = (params.get("topic") ?? "markets") as Topic;
    if (!TOPICS.some((t) => t.key === topic)) throw new ApiError(400, `topic must be one of ${TOPICS.map((t) => t.key).join(", ")}`);
    const { sources, off } = sourcesFor({ topic }, feeds);
    return gather(sources, off);
  });
}

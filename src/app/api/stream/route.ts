import type { NextRequest } from "next/server";
import { ApiError, readSymbols, respond } from "@/lib/api";
import { hub } from "@/lib/providers/finnhubStream";

/** A comment this often keeps the connection from looking idle. */
const KEEP_ALIVE = 20_000;

/**
 * GET /api/stream?symbols=AAPL,MSFT → Server-Sent Events, for as long as the browser listens:
 * `live` lists the symbols streaming right now, and `trades` carries their latest trades, at most once a second.
 * Symbols Finnhub doesn't have never stream. Without a Finnhub key it answers 503, and the browser goes on polling.
 */
export async function GET(request: NextRequest) {
  let symbols: string[];
  try {
    symbols = readSymbols(request.nextUrl.searchParams, "symbols");
    if (!process.env.FINNHUB_API_KEY) throw new ApiError(503, "Live prices need FINNHUB_API_KEY in .env.local.");
  } catch (error) {
    // The answer has to be an error before the stream starts: an EventSource doesn't retry one.
    return respond(async () => {
      throw error;
    });
  }

  const encoder = new TextEncoder();
  let stop = () => {};
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          // The browser went before the abort said so.
          stop();
        }
      };
      const send = (event: string, data: unknown) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      const unwatch = hub.watch(symbols, {
        onLive: (live) => send("live", live),
        onTrades: (trades) => send("trades", trades),
      });
      const keepAlive = setInterval(() => write(": keep-alive\n\n"), KEEP_ALIVE);
      stop = () => {
        clearInterval(keepAlive);
        unwatch();
      };
      request.signal.addEventListener("abort", () => stop());
    },
    cancel() {
      stop();
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // no-transform keeps compression from holding events back to fill a block.
      "Cache-Control": "no-cache, no-transform",
    },
  });
}

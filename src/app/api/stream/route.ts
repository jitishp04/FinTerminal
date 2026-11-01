import type { NextRequest } from "next/server";
import { readSymbols, respond } from "@/lib/api";
import { hub as coinbase } from "@/lib/providers/coinbaseStream";
import { hub as finnhub } from "@/lib/providers/finnhubStream";
import type { Hub } from "@/lib/providers/stream";

/** A comment this often keeps the connection from looking idle. */
const KEEP_ALIVE = 20_000;

/**
 * GET /api/stream?symbols=AAPL,MSFT → Server-Sent Events, for as long as the browser listens:
 * `live` lists the symbols streaming right now, and `trades` carries their latest trades, at most once a second.
 * US stocks and funds stream from Finnhub when there's a key, and CRYPTO's coins from Coinbase. When none of the
 * symbols can stream it answers 204, which tells an EventSource not to reconnect, and the browser goes on polling.
 */
export async function GET(request: NextRequest) {
  // Read outside the try: reading the query is how the build learns the route is dynamic, and the catch would hide that.
  const params = request.nextUrl.searchParams;
  let symbols: string[];
  try {
    symbols = readSymbols(params, "symbols");
  } catch (error) {
    return respond(async () => {
      throw error;
    });
  }
  // Coinbase needs no key. Without Finnhub's, US stocks just don't stream: a setup without it is a fine one.
  const hubs: Hub[] = process.env.FINNHUB_API_KEY ? [finnhub, coinbase] : [coinbase];
  if (!symbols.some((symbol) => hubs.some((hub) => hub.covers(symbol)))) return new Response(null, { status: 204 });

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
      // Each hub says which of its own symbols stream; the browser hears them all together.
      const live = new Map<Hub, string[]>();
      const unwatch = hubs.map((hub) =>
        hub.watch(symbols, {
          onLive: (streaming) => {
            live.set(hub, streaming);
            send("live", [...live.values()].flat());
          },
          onTrades: (trades) => send("trades", trades),
        }),
      );
      const keepAlive = setInterval(() => write(": keep-alive\n\n"), KEEP_ALIVE);
      stop = () => {
        clearInterval(keepAlive);
        for (const each of unwatch) each();
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

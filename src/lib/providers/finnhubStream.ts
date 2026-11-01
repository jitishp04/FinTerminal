// Finnhub's trades for US stocks and funds, as a feed for the stream hub.
import { covers } from "../live";
import type { Feed, Socket } from "./stream";
import { sharedHub } from "./stream";

interface FinnhubMessage {
  type: string;
  data?: { s: string; p: number; t: number }[];
  msg?: string;
}

// Yahoo's BRK-B is Finnhub's BRK.B.
const toFinnhub = (symbol: string) => symbol.replace("-", ".");
const fromFinnhub = (symbol: string) => symbol.replace(".", "-");

export const finnhubFeed: Feed = {
  source: "finnhub",
  // The free plan streams up to 50 symbols at once.
  max: 50,
  covers,
  // Finnhub takes the key only in the URL.
  connect: (): Socket => new WebSocket(`wss://ws.finnhub.io?token=${encodeURIComponent(process.env.FINNHUB_API_KEY ?? "")}`),
  subscribe: (symbol) => JSON.stringify({ type: "subscribe", symbol: toFinnhub(symbol) }),
  unsubscribe: (symbol) => JSON.stringify({ type: "unsubscribe", symbol: toFinnhub(symbol) }),
  read(data) {
    const message = JSON.parse(data) as FinnhubMessage;
    if (message.type === "error") return { error: message.msg ?? "an unnamed error" };
    if (message.type === "ping") return { alive: true };
    if (message.type !== "trade") return {};
    return {
      alive: true,
      trades: (message.data ?? []).map(({ s, p, t }) => ({ symbol: fromFinnhub(s), price: p, time: t / 1000 })),
    };
  },
};

export const hub = sharedHub(finnhubFeed);

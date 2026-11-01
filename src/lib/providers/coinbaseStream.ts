// Coinbase Exchange's public trades for the coins CRYPTO shows, as a feed for the stream hub. No key.
import { isCoin } from "../live";
import type { Feed, Socket } from "./stream";
import { sharedHub } from "./stream";

interface CoinbaseMessage {
  type: string;
  product_id?: string;
  /** Decimal strings, e.g. "77750.61". */
  price?: string;
  /** ISO 8601 to the microsecond, e.g. "2026-11-01T12:48:02.061769Z". */
  time?: string;
  message?: string;
  reason?: string;
}

// One channel: a ticker message for each match, which Coinbase batches when matches cascade.
const message = (type: "subscribe" | "unsubscribe", symbol: string) => JSON.stringify({ type, product_ids: [symbol], channels: ["ticker"] });

export const coinbaseFeed: Feed = {
  source: "coinbase",
  // No cap of its own: it streams only CRYPTO's coins.
  max: Infinity,
  // Coinbase names its products as Yahoo names the coins: BTC-USD.
  covers: isCoin,
  // Coinbase closes a socket that hasn't subscribed within 5 seconds; the hub subscribes as soon as it opens.
  connect: (): Socket => new WebSocket("wss://ws-feed.exchange.coinbase.com"),
  subscribe: (symbol) => message("subscribe", symbol),
  unsubscribe: (symbol) => message("unsubscribe", symbol),
  read(data) {
    const { type, product_id, price, time, message: text, reason } = JSON.parse(data) as CoinbaseMessage;
    if (type === "error") return { error: [text, reason].filter(Boolean).join(": ") || "an unnamed error" };
    if (type === "subscriptions" || type === "heartbeat") return { alive: true };
    if (type !== "ticker") return {};
    const value = Number(price);
    const seconds = Date.parse(time ?? "") / 1000;
    if (!product_id || !Number.isFinite(value) || Number.isNaN(seconds)) return { alive: true };
    return { alive: true, trades: [{ symbol: product_id, price: value, time: seconds }] };
  },
};

export const hub = sharedHub(coinbaseFeed);

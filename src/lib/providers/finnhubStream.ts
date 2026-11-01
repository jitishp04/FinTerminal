// Live trades for US stocks and funds over one Finnhub websocket, shared by every browser tab.
import { covers } from "../live";
import type { Trade } from "../types";
import { tracked } from "./health";

/** The free plan streams up to 50 symbols at once. */
export const MAX_STREAMED = 50;
/** Trades come many a second; watchers get each symbol's latest this often. */
export const FLUSH_EVERY = 1000;
/** A panel moving to another symbol lets go of one and takes the next, so a symbol stays this long, in case it's wanted back. */
export const LINGER = 5000;
/** With nothing left to stream, the socket closes after this. */
export const IDLE = 60_000;
const RETRY_FIRST = 1000;
const RETRY_MAX = 60_000;

/** The parts of a WebSocket the hub uses. */
export type Socket = Pick<WebSocket, "send" | "close" | "onopen" | "onmessage" | "onclose" | "onerror">;

export interface Watcher {
  /** The latest trade of each of its symbols that traded since the last flush. */
  onTrades: (trades: Trade[]) => void;
  /** Which of its symbols are streaming. Called when that changes. */
  onLive: (symbols: string[]) => void;
}

interface FinnhubMessage {
  type: string;
  data?: { s: string; p: number; t: number }[];
  msg?: string;
}

// Yahoo's BRK-B is Finnhub's BRK.B.
const toFinnhub = (symbol: string) => symbol.replace("-", ".");
const fromFinnhub = (symbol: string) => symbol.replace(".", "-");

/** A hub that opens its socket with `connect`, and only while some watcher has a symbol it streams. */
export function createHub(connect: () => Socket) {
  /** Each watched symbol and how many watchers have it, in the order first asked for. */
  const wanted = new Map<string, number>();
  /** Each watcher's symbols, and the streaming ones it was last told of: null before it's told. */
  const watchers = new Map<Watcher, { symbols: string[]; live: string | null }>();
  /** What the hub streams, or will once the socket opens: the first `MAX_STREAMED` symbols wanted. */
  const streamed = new Set<string>();
  /** Each symbol's latest trade since the last flush. */
  const pending = new Map<string, Trade>();
  let socket: Socket | null = null;
  let open = false;
  let retry = RETRY_FIRST;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let lingerTimer: ReturnType<typeof setTimeout> | undefined;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let flushTimer: ReturnType<typeof setInterval> | undefined;

  const send = (type: "subscribe" | "unsubscribe", symbol: string) => {
    if (open) socket!.send(JSON.stringify({ type, symbol: toFinnhub(symbol) }));
  };

  /** Tells each watcher which of its symbols stream, if that changed. */
  function announce() {
    for (const [watcher, state] of watchers) {
      const live = open ? state.symbols.filter((symbol) => streamed.has(symbol)) : [];
      const key = live.join(",");
      if (key === state.live) continue;
      state.live = key;
      watcher.onLive(live);
    }
  }

  function flush() {
    if (pending.size === 0) return;
    for (const [watcher, { symbols }] of watchers) {
      const trades = symbols.flatMap((symbol) => pending.get(symbol) ?? []);
      if (trades.length > 0) watcher.onTrades(trades);
    }
    pending.clear();
  }

  function receive(data: unknown) {
    let message: FinnhubMessage;
    try {
      message = JSON.parse(String(data)) as FinnhubMessage;
    } catch {
      console.error("Finnhub's stream sent something that isn't JSON");
      return;
    }
    if (message.type === "error") {
      console.error(`Finnhub's stream: ${message.msg}`);
      return;
    }
    // A trade or ping means the socket works, so a later drop starts its retries afresh.
    retry = RETRY_FIRST;
    if (message.type !== "trade") return;
    for (const { s, p, t } of message.data ?? []) {
      const symbol = fromFinnhub(s);
      const time = t / 1000;
      const last = pending.get(symbol);
      if (streamed.has(symbol) && (!last || time >= last.time)) pending.set(symbol, { symbol, price: p, time });
    }
  }

  /** Opens the socket. Resolves once it's open, or rejects if it fails first. */
  function start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const current = connect();
      socket = current;
      current.onmessage = ({ data }) => receive(data);
      current.onopen = () => {
        open = true;
        for (const symbol of streamed) send("subscribe", symbol);
        flushTimer = setInterval(flush, FLUSH_EVERY);
        announce();
        resolve();
      };
      // The token is in the socket's URL, so a failure names only how it ended.
      const fail = (how: string) => {
        const wasOpen = open;
        stop();
        current.close();
        retryLater();
        if (!wasOpen) reject(new Error(`Finnhub's stream ${how} before it opened`));
      };
      current.onclose = ({ code }) => fail(`closed (code ${code})`);
      // Node's WebSocket reports a failed handshake with an error and no close, so either ends it, whichever comes first.
      current.onerror = () => fail("failed");
    });
  }

  function reconnect() {
    retryTimer = undefined;
    if (streamed.size === 0 || socket) return;
    // A source forced to fail never opens a socket, so its retry starts here. A socket that closed has one already.
    tracked("finnhub", start).catch(retryLater);
  }

  /** Tries again after a wait that doubles with each failure, while there's still something to stream. */
  function retryLater() {
    if (socket || retryTimer || streamed.size === 0) return;
    retryTimer = setTimeout(reconnect, retry);
    retry = Math.min(retry * 2, RETRY_MAX);
  }

  /** Forgets the socket, its handlers and what it was sending, and tells the watchers nothing streams. */
  function stop() {
    if (socket) {
      socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
    }
    socket = null;
    open = false;
    clearInterval(flushTimer);
    pending.clear();
    announce();
  }

  /** Streams what's wanted, up to the cap. `drop` also lets go of symbols no longer wanted. */
  function sync(drop: boolean) {
    if (drop) {
      for (const symbol of streamed) {
        if (wanted.has(symbol)) continue;
        streamed.delete(symbol);
        send("unsubscribe", symbol);
      }
    }
    for (const symbol of wanted.keys()) {
      if (streamed.size >= MAX_STREAMED) break;
      if (streamed.has(symbol)) continue;
      streamed.add(symbol);
      send("subscribe", symbol);
    }
    clearTimeout(idleTimer);
    if (streamed.size === 0) {
      clearTimeout(retryTimer);
      retryTimer = undefined;
      if (socket) {
        idleTimer = setTimeout(() => {
          const idle = socket;
          stop();
          idle?.close();
        }, IDLE);
      }
    } else if (!socket && !retryTimer) {
      reconnect();
    }
    announce();
  }

  return {
    /** Streams `symbols` to `watcher`: the ones Finnhub has, as many as fit. Returns a function that stops it. */
    watch(symbols: string[], watcher: Watcher): () => void {
      const own = [...new Set(symbols)].filter(covers);
      watchers.set(watcher, { symbols: own, live: null });
      for (const symbol of own) wanted.set(symbol, (wanted.get(symbol) ?? 0) + 1);
      sync(false);
      return () => {
        if (!watchers.delete(watcher)) return;
        for (const symbol of own) {
          const count = wanted.get(symbol)! - 1;
          if (count > 0) wanted.set(symbol, count);
          else wanted.delete(symbol);
        }
        clearTimeout(lingerTimer);
        lingerTimer = setTimeout(() => sync(true), LINGER);
      };
    },
  };
}

export type Hub = ReturnType<typeof createHub>;

const connect = (): Socket => new WebSocket(`wss://ws.finnhub.io?token=${encodeURIComponent(process.env.FINNHUB_API_KEY ?? "")}`);

// Next's dev server reloads a module when it changes. One hub for the process keeps that to one socket,
// so a change to this file needs a restart of the dev server.
const shared = globalThis as typeof globalThis & { finnhubHub?: Hub };
export const hub = (shared.finnhubHub ??= createHub(connect));

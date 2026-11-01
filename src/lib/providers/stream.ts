// Live trades over one websocket per source, each shared by every browser tab. A Feed says how a source talks.
import { SOURCES, type SourceId } from "../sources";
import type { Trade } from "../types";
import { tracked } from "./health";

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

/** What one message from a feed says. */
export interface Reading {
  trades?: Trade[];
  /** It shows the socket works, as a trade, a ping or a confirmation does. */
  alive?: boolean;
  /** An error the source reported, to log. */
  error?: string;
}

/** How one source streams: where to connect, which symbols it has, and its messages. */
export interface Feed {
  /** For the status bar's health, and FAIL_SOURCES. */
  source: SourceId;
  /** How many symbols one socket may stream. */
  max: number;
  covers: (symbol: string) => boolean;
  connect: () => Socket;
  /** The messages that start and stop a symbol's stream. */
  subscribe: (symbol: string) => string;
  unsubscribe: (symbol: string) => string;
  /** Reads a message. Throws on one it can't. */
  read: (data: string) => Reading;
}

export interface Watcher {
  /** The latest trade of each of its symbols that traded since the last flush. */
  onTrades: (trades: Trade[]) => void;
  /** Which of its symbols are streaming. Called when that changes. */
  onLive: (symbols: string[]) => void;
}

/** A hub for one feed. Its socket is open only while some watcher has a symbol the feed streams. */
export function createHub(feed: Feed) {
  const name = SOURCES[feed.source];
  /** Each watched symbol and how many watchers have it, in the order first asked for. */
  const wanted = new Map<string, number>();
  /** Each watcher's symbols, and the streaming ones it was last told of: null before it's told. */
  const watchers = new Map<Watcher, { symbols: string[]; live: string | null }>();
  /** What the hub streams, or will once the socket opens: the first `feed.max` symbols wanted. */
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
    if (open) socket!.send(feed[type](symbol));
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
    let reading: Reading;
    try {
      reading = feed.read(String(data));
    } catch {
      console.error(`${name}'s stream sent something it couldn't read`);
      return;
    }
    if (reading.error) {
      console.error(`${name}'s stream: ${reading.error}`);
      return;
    }
    // The socket works, so a later drop starts its retries afresh.
    if (reading.alive) retry = RETRY_FIRST;
    for (const trade of reading.trades ?? []) {
      const last = pending.get(trade.symbol);
      if (streamed.has(trade.symbol) && (!last || trade.time >= last.time)) pending.set(trade.symbol, trade);
    }
  }

  /** Opens the socket. Resolves once it's open, or rejects if it fails first. */
  function start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const current = feed.connect();
      socket = current;
      current.onmessage = ({ data }) => receive(data);
      current.onopen = () => {
        open = true;
        for (const symbol of streamed) send("subscribe", symbol);
        flushTimer = setInterval(flush, FLUSH_EVERY);
        announce();
        resolve();
      };
      // A key can be in the socket's URL, so a failure names only how it ended.
      const fail = (how: string) => {
        const wasOpen = open;
        stop();
        current.close();
        retryLater();
        if (!wasOpen) reject(new Error(`${name}'s stream ${how} before it opened`));
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
    tracked(feed.source, start).catch(retryLater);
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
      if (streamed.size >= feed.max) break;
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
    covers: feed.covers,
    /** Streams `symbols` to `watcher`: the ones the feed has, as many as fit. Returns a function that stops it. */
    watch(symbols: string[], watcher: Watcher): () => void {
      const own = [...new Set(symbols)].filter(feed.covers);
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

/**
 * The process's one hub for a feed. Next's dev server reloads a module when it changes, and keeping the hub
 * on globalThis keeps that to one socket, so a change to the hub or a feed needs a restart of the dev server.
 */
export function sharedHub(feed: Feed): Hub {
  const shared = globalThis as typeof globalThis & { liveHubs?: Partial<Record<SourceId, Hub>> };
  shared.liveHubs ??= {};
  return (shared.liveHubs[feed.source] ??= createHub(feed));
}

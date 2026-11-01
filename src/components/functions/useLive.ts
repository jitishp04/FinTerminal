import { useEffect, useSyncExternalStore } from "react";
import { createLiveStream, type LiveSnapshot, type LiveStream } from "@/lib/live";

/** While a symbol streams, its poll has only the volume and the market's state to bring. */
export const LIVE_REFRESH = 60_000;

// One for the page, made on first use in the browser.
let stream: LiveStream | undefined;
const liveStream = () => (stream ??= createLiveStream((url) => new EventSource(url)));

const NOTHING: LiveSnapshot = { trades: new Map(), live: new Set() };
const subscribe = (listener: () => void) => liveStream().subscribe(listener);
const getSnapshot = () => liveStream().getSnapshot();
const getServerSnapshot = () => NOTHING;

/** Which symbols stream right now, and each one's latest trade. */
export function useLiveSnapshot(): LiveSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Streams the US stocks and funds among `symbols` while the component is on screen. */
export function useLive(symbols: string[]): LiveSnapshot {
  // Symbols have no commas, and a key keeps a new array of the same symbols from reopening the stream.
  const key = symbols.join(",");
  useEffect(() => liveStream().watch(key ? key.split(",") : []), [key]);
  return useLiveSnapshot();
}

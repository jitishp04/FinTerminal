// N: headlines from Yahoo Finance's RSS feeds and Finnhub's news, merged newest first.
import type { News, NewsItem } from "./types";

/** `N`'s topics: a Yahoo feed by symbol, and Finnhub's category where it has one. */
export const TOPICS = [
  { key: "markets", label: "Markets", yahoo: "^GSPC" },
  { key: "forex", label: "Forex", yahoo: "EURUSD=X", finnhub: "forex" },
  { key: "crypto", label: "Crypto", yahoo: "BTC-USD", finnhub: "crypto" },
  { key: "mergers", label: "Mergers", finnhub: "merger" },
] as const satisfies readonly { key: string; label: string; yahoo?: string; finnhub?: string }[];
export type Topic = (typeof TOPICS)[number]["key"];

/** More than a panel shows without scrolling, few enough to read. */
const LIMIT = 60;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (text: string) =>
  text
    .replace(/&#(x?)([0-9a-f]+);/gi, (_, hex: string, code: string) => String.fromCodePoint(parseInt(code, hex ? 16 : 10)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, name: string) => ENTITIES[name])
    .trim();

const tag = (xml: string, name: string) => {
  const match = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml);
  return match ? decode(match[1]) || undefined : undefined;
};

/** Yahoo for its own articles, otherwise the site: "fool.com". */
function sourceOf(url: string): string {
  const host = new URL(url).hostname.replace(/^www\./, "");
  return host.endsWith("yahoo.com") ? "Yahoo Finance" : host;
}

/** The items in an RSS feed. Throws if it isn't one. */
export function parseRss(xml: string): NewsItem[] {
  if (!/<rss[\s>]/.test(xml)) throw new Error("Not an RSS feed");
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].flatMap(([, item]) => {
    const title = tag(item, "title");
    const url = tag(item, "link");
    const time = Date.parse(tag(item, "pubDate") ?? "") / 1000;
    if (!title || !url || Number.isNaN(time)) return [];
    const summary = tag(item, "description");
    return [{ title, url, time, source: sourceOf(url), ...(summary && { summary }) }];
  });
}

export interface FinnhubNews {
  /** Epoch seconds. */
  datetime: number;
  headline: string;
  source: string;
  summary: string;
  url: string;
}

// A run of characters that are really UTF-8 bytes: a lead byte, then continuation bytes.
const LATIN1_UTF8 = /[\xC2-\xF4][\x80-\xBF]+/g;
const utf8 = new TextDecoder("utf-8", { fatal: true });

/**
 * Text whose UTF-8 was read as Latin-1, as in a few of Seeking Alpha's items, put right:
 * "Street\u00E2\u0080\u0099s" back to "Street's". A run that isn't valid UTF-8 is a real accent, and stays.
 */
function repair(text: string): string {
  return text.replace(LATIN1_UTF8, (run) => {
    try {
      return utf8.decode(Uint8Array.from(run, (c) => c.charCodeAt(0)));
    } catch {
      return run;
    }
  });
}

/** Finnhub's news items, which link through its own redirect. */
export function fromFinnhub(items: FinnhubNews[]): NewsItem[] {
  return items.map(({ datetime, headline, source, summary, url }) => ({
    title: repair(headline),
    url,
    time: datetime,
    // The name Yahoo's own feed goes by, so one source has one name.
    source: source === "Yahoo" ? "Yahoo Finance" : source,
    ...(summary && { summary: repair(summary) }),
  }));
}

// Two sources can carry one story under different links, so a story is its headline, give or take punctuation.
const story = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Every list together, newest first. A story in more than one keeps the earliest list's copy. */
export function merge(lists: NewsItem[][], limit = LIMIT): NewsItem[] {
  const seen = new Set<string>();
  const items = lists.flat().filter(({ title }) => {
    const key = story(title);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return items.sort((a, b) => b.time - a.time).slice(0, limit);
}

export interface NewsSource {
  name: string;
  load: () => Promise<NewsItem[]>;
}

/**
 * Headlines from every source, merged. One that fails is named in the notes while the rest
 * still show; if they all fail, so does this, with the first one's error. `off` notes sources
 * that weren't asked, such as Finnhub without a key.
 */
export async function gather(sources: NewsSource[], off: string[] = []): Promise<News> {
  const results = await Promise.allSettled(sources.map((source) => source.load()));
  const failed = results.flatMap((result, i) => (result.status === "rejected" ? [{ name: sources[i].name, error: result.reason }] : []));
  if (sources.length > 0 && failed.length === sources.length) throw failed[0].error;
  return {
    items: merge(results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []))),
    notes: [...off, ...failed.map(({ name, error }) => `No headlines from ${name}: ${(error as Error).message}`)],
  };
}

export interface Feeds {
  /** Yahoo's RSS for a symbol. */
  yahoo: (symbol: string) => Promise<NewsItem[]>;
  /** Whether Finnhub has news for a symbol: its free plan covers US stocks and funds. */
  covers: (symbol: string) => boolean;
  /** Present when there's a Finnhub key. */
  finnhub?: {
    company: (symbol: string) => Promise<NewsItem[]>;
    topic: (category: string) => Promise<NewsItem[]>;
  };
}

/** Which sources a symbol's or topic's headlines come from, and notes on any that are off. */
export function sourcesFor(request: { symbol: string } | { topic: Topic }, { yahoo, covers, finnhub }: Feeds): { sources: NewsSource[]; off: string[] } {
  const sources: NewsSource[] = [];
  const off: string[] = [];
  if ("symbol" in request) {
    const { symbol } = request;
    sources.push({ name: "Yahoo Finance", load: () => yahoo(symbol) });
    if (covers(symbol) && finnhub) sources.push({ name: "Finnhub", load: () => finnhub.company(symbol) });
    else if (covers(symbol)) off.push("Finnhub's company news is off: add FINNHUB_API_KEY to .env.local for more headlines.");
    return { sources, off };
  }
  const topic: { label: string; yahoo?: string; finnhub?: string } = TOPICS.find((t) => t.key === request.topic)!;
  if (topic.yahoo) sources.push({ name: "Yahoo Finance", load: () => yahoo(topic.yahoo!) });
  if (topic.finnhub && finnhub) sources.push({ name: "Finnhub", load: () => finnhub.topic(topic.finnhub!) });
  else if (topic.finnhub) {
    off.push(
      topic.yahoo
        ? `Add FINNHUB_API_KEY to .env.local for Finnhub's ${topic.label.toLowerCase()} news too.`
        : `${topic.label} come from Finnhub: add FINNHUB_API_KEY to .env.local.`,
    );
  }
  return { sources, off };
}

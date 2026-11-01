import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fromFinnhub, gather, merge, parseRss, sourcesFor } from "./news";

// Real feeds, fetched on 1 November 2026: Yahoo's RSS for AAPL and ^GSPC, and Finnhub's AAPL company news,
// trimmed to 6 items, 2 of them stories Yahoo's feed carries too.
const fixture = (name: string) => readFileSync(new URL(`./fixtures/news/${name}`, import.meta.url), "utf8");
const at = (iso: string) => Date.parse(iso) / 1000;

describe("parseRss", () => {
  it("reads each item's headline, link, time and summary, naming Yahoo as the source of its own articles", () => {
    const items = parseRss(fixture("aapl-yahoo.xml"));
    expect(items).toHaveLength(16);
    expect(items[0]).toEqual({
      title: "A big sell-off collides with more Big Tech earnings and a midterm election: What to watch this week",
      url: "https://finance.yahoo.com/markets/article/a-big-sell-off-collides-with-more-big-tech-earnings-and-a-midterm-election-what-to-watch-this-week-110000657.html?.tsrc=rss",
      time: at("2026-11-01T11:00:00Z"),
      source: "Yahoo Finance",
      summary: "Coming into this week, all eyes will be on potential sparks to re-light the fire under the tech sector. Fire, to be clear, in a bad way.",
    });
  });

  it("decodes entities, and names another site by its domain", () => {
    const [first] = parseRss(fixture("gspc-yahoo.xml")).filter((item) => item.title.includes("Quadruple"));
    expect(first).toMatchObject({
      title: "This Dividend Stock Yielding Quadruple the S&P 500 Looks Like a Buy Right Now",
      source: "fool.com",
      time: at("2026-11-01T11:03:00Z"),
    });
  });

  it("leaves the summary out when an item has none", () => {
    const xml = fixture("aapl-yahoo.xml").replace(/(<item>\s*)<description>[^<]*<\/description>/, "$1");
    expect(parseRss(xml)[0]).not.toHaveProperty("summary");
  });

  it("fails on anything that isn't an RSS feed", () => {
    expect(() => parseRss("<html>Will be right back</html>")).toThrow(/RSS/);
  });
});

describe("fromFinnhub", () => {
  it("reads Finnhub's news items", () => {
    const [first] = fromFinnhub(JSON.parse(fixture("aapl-finnhub.json")));
    expect(first).toMatchObject({ title: "Wall Street Week Ahead", source: "SeekingAlpha", time: at("2026-11-01T06:04:46Z") });
    expect(first.url).toMatch(/^https:\/\/finnhub\.io\/api\/news\?id=/);
  });

  it("calls Yahoo by the name its own feed goes by", () => {
    const [item] = fromFinnhub([{ datetime: 1, headline: "A", source: "Yahoo", summary: "", url: "https://example.com" }]);
    expect(item.source).toBe("Yahoo Finance");
  });

  it("leaves out an empty summary", () => {
    const [item] = fromFinnhub([{ datetime: 1, headline: "A", source: "B", summary: "", url: "https://example.com" }]);
    expect(item).not.toHaveProperty("summary");
  });
});

describe("merge", () => {
  const yahoo = parseRss(fixture("aapl-yahoo.xml"));
  const finnhub = fromFinnhub(JSON.parse(fixture("aapl-finnhub.json")));

  it("puts both lists together newest first, with a story both carry only once", () => {
    const merged = merge([yahoo, finnhub]);
    // 16 + 6, less the 2 stories in both.
    expect(merged).toHaveLength(20);
    for (let i = 1; i < merged.length; i++) expect(merged[i].time).toBeLessThanOrEqual(merged[i - 1].time);
    const ternus = merged.filter((item) => item.title.includes("John Ternus"));
    expect(ternus).toHaveLength(1);
  });

  it("keeps the first list's copy of a shared story: Yahoo's link goes to the article, Finnhub's to a redirect", () => {
    const [ternus] = merge([yahoo, finnhub]).filter((item) => item.title.includes("John Ternus"));
    expect(ternus.url).toBe("https://finance.yahoo.com/technology/ai/articles/apple-ceo-john-ternus-says-073247018.html?.tsrc=rss");
  });

  it("matches headlines that differ only in case and punctuation", () => {
    const a = { title: "Apple's AI push — what's next?", url: "a", time: 2, source: "A" };
    const b = { title: "APPLE’S AI PUSH: WHAT’S NEXT", url: "b", time: 1, source: "B" };
    expect(merge([[a], [b]])).toEqual([a]);
  });

  it("stops at the limit", () => {
    expect(merge([yahoo, finnhub], 5)).toHaveLength(5);
  });
});

describe("gather", () => {
  const item = (title: string, time: number) => ({ title, url: title, time, source: "Test" });

  it("merges what every source gives", async () => {
    const news = await gather([
      { name: "Yahoo Finance", load: async () => [item("b", 2)] },
      { name: "Finnhub", load: async () => [item("a", 3)] },
    ]);
    expect(news).toEqual({ items: [item("a", 3), item("b", 2)], notes: [] });
  });

  it("keeps one source's headlines when another fails, and says which failed", async () => {
    const news = await gather([
      { name: "Yahoo Finance", load: async () => [item("b", 2)] },
      { name: "Finnhub", load: () => Promise.reject(new Error("Finnhub isn't responding. Retrying…")) },
    ]);
    expect(news).toEqual({ items: [item("b", 2)], notes: ["No headlines from Finnhub: Finnhub isn't responding. Retrying…"] });
  });

  it("fails with the first error when every source fails, so the panel retries", async () => {
    const failure = new Error("Yahoo Finance isn't responding. Retrying…");
    await expect(gather([{ name: "Yahoo Finance", load: () => Promise.reject(failure) }])).rejects.toBe(failure);
  });

  it("passes on notes about sources that are off", async () => {
    const news = await gather([], ["Mergers come from Finnhub: add FINNHUB_API_KEY to .env.local."]);
    expect(news).toEqual({ items: [], notes: ["Mergers come from Finnhub: add FINNHUB_API_KEY to .env.local."] });
  });
});

describe("sourcesFor", () => {
  const none = async () => [];
  const covers = (symbol: string) => /^[A-Z]{1,5}$/.test(symbol);
  const finnhub = { company: none, topic: none };
  const names = (plan: ReturnType<typeof sourcesFor>) => plan.sources.map((s) => s.name);

  it("takes a US stock's news from Yahoo and Finnhub", () => {
    expect(names(sourcesFor({ symbol: "AAPL" }, { yahoo: none, covers, finnhub }))).toEqual(["Yahoo Finance", "Finnhub"]);
  });

  it("says Finnhub's company news is off without a key, and keeps Yahoo's", () => {
    const plan = sourcesFor({ symbol: "AAPL" }, { yahoo: none, covers });
    expect(names(plan)).toEqual(["Yahoo Finance"]);
    expect(plan.off).toEqual(["Finnhub's company news is off: add FINNHUB_API_KEY to .env.local for more headlines."]);
  });

  it("asks only Yahoo for what Finnhub doesn't cover, and says nothing about it", () => {
    expect(sourcesFor({ symbol: "^GSPC" }, { yahoo: none, covers, finnhub })).toMatchObject({ off: [] });
    expect(sourcesFor({ symbol: "^GSPC" }, { yahoo: none, covers })).toMatchObject({ off: [] });
    expect(names(sourcesFor({ symbol: "^GSPC" }, { yahoo: none, covers, finnhub }))).toEqual(["Yahoo Finance"]);
  });

  it("takes a topic from Yahoo's feed and Finnhub's category", () => {
    expect(names(sourcesFor({ topic: "crypto" }, { yahoo: none, covers, finnhub }))).toEqual(["Yahoo Finance", "Finnhub"]);
    expect(names(sourcesFor({ topic: "markets" }, { yahoo: none, covers, finnhub }))).toEqual(["Yahoo Finance"]);
  });

  it("explains that mergers need the key, and that a key adds to the other topics", () => {
    expect(sourcesFor({ topic: "mergers" }, { yahoo: none, covers })).toEqual({
      sources: [],
      off: ["Mergers come from Finnhub: add FINNHUB_API_KEY to .env.local."],
    });
    expect(sourcesFor({ topic: "forex" }, { yahoo: none, covers }).off).toEqual(["Add FINNHUB_API_KEY to .env.local for Finnhub's forex news too."]);
  });
});

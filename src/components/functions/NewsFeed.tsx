"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { fetchApi, pollEvery } from "@/lib/fetchApi";
import { formatUpdated } from "@/lib/format";
import { TOPICS, type Topic } from "@/lib/news";
import type { News } from "@/lib/types";
import { QuoteLine } from "./QuoteLine";
import { SourceError } from "./SourceError";
import { Toggle } from "./Toggle";

// The server holds each feed for 4 minutes.
const REFRESH = 5 * 60_000;

/** N: headlines on a topic, or about one symbol, newest first. Each opens its article in a new tab. */
export function NewsFeed({ symbol }: { symbol?: string }) {
  const [topic, setTopic] = useState<Topic>("markets");
  const news = useQuery({
    queryKey: ["news", symbol ?? topic],
    queryFn: () =>
      fetchApi<News>(symbol ? `/api/news?symbol=${encodeURIComponent(symbol)}` : `/api/news?topic=${topic}`),
    refetchInterval: pollEvery(REFRESH),
    // Fresh until the next poll, so switching windows doesn't refetch it.
    staleTime: REFRESH,
  });

  return (
    <div className="flex h-full flex-col gap-1.5">
      {symbol ? (
        <QuoteLine symbol={symbol} />
      ) : (
        <div role="group" aria-label="Topic" className="flex items-center gap-0.5 text-xs">
          {TOPICS.map(({ key, label }) => (
            <Toggle key={key} pressed={key === topic} onClick={() => setTopic(key)}>
              {label}
            </Toggle>
          ))}
        </div>
      )}
      {news.isPending && (
        <p role="status" className="text-muted">
          Loading headlines…
        </p>
      )}
      {news.isError && <SourceError error={news.error} />}
      {news.data && <Headlines news={news.data} empty={symbol ? `No headlines for ${symbol} right now.` : "No headlines on this topic right now."} />}
    </div>
  );
}

function Headlines({ news: { items, notes }, empty }: { news: News; empty: string }) {
  const now = new Date();
  return (
    <>
      {notes.map((note) => (
        <p key={note} role="status" className="text-xs text-muted">
          {note}
        </p>
      ))}
      {items.length === 0 ? (
        notes.length === 0 && (
          <p role="status" className="text-muted">
            {empty}
          </p>
        )
      ) : (
        // Keeps a usable height in a short panel, which then scrolls to it.
        <ul className="min-h-40 flex-1 overflow-auto">
          {items.map(({ title, url, time, source, summary }) => (
            <li key={url} className="border-b border-border py-1 last:border-b-0">
              <a href={url} target="_blank" rel="noreferrer" className="block hover:underline">
                {title}
              </a>
              <p className="flex gap-2 text-xs text-muted">
                <span className="shrink-0">
                  {source} · {formatUpdated(time, now)}
                </span>
                {summary && <span className="min-w-0 truncate">{summary}</span>}
              </p>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">
        From Yahoo Finance&apos;s RSS feeds and Finnhub, newest first, a story once. Times are local, and links open the
        article in a new tab.
      </p>
    </>
  );
}

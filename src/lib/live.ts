// Live prices: which symbols Finnhub streams, and what a trade does to a quote.

// Indices, FX, futures, crypto and foreign tickers all carry a mark of some kind: ^GSPC, EURUSD=X, GC=F, BTC-USD, VOD.L.
const US_TICKER = /^[A-Z]{1,5}(-[A-Z])?$/;

/** Whether Finnhub has this symbol: its free plan has US stocks and funds only. */
export const covers = (symbol: string) => US_TICKER.test(symbol);

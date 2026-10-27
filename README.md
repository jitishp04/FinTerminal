# FinTerminal

A Bloomberg-style market terminal that runs on your own PC, built only on free data sources.

**Covers:** US stocks and ETFs, world indices, FX, commodities, SEC fundamentals and filings, and US macro and rates.

## Setup
1. Install Node.js 22+.
2. `npm install`
3. Copy `.env.example` to `.env.local` and fill in the free keys (the file has signup links).
4. `npm run dev`, then open http://localhost:3000.

## Using it
Type a command and press Enter, for example `AAPL GP` (chart), `MSFT FA` (financials), `WEI` (world indices) or `CURV` (yield curve). `HELP` lists every function.

## Project tracking
The roadmap lives in GitHub issues and milestones. Each issue gets its own branch and PR.

## Data sources
Yahoo Finance (unofficial, via `yahoo-finance2`; personal use only), SEC EDGAR, FRED and Finnhub. Prices may be delayed.

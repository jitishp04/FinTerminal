# FinTerminal

A Bloomberg-style market terminal that runs on your own PC, built only on free data sources.

**Covers:** US stocks and ETFs, world indices, FX, commodities, SEC fundamentals and filings, and US macro and rates.

It's for personal use on your own machine. Don't host it publicly: Yahoo Finance's data is unofficial and limited to personal use.

## Setup

You need [Node.js](https://nodejs.org) 22 or later.

```bash
git clone https://github.com/jitishp04/FinTerminal.git
cd FinTerminal
npm ci
cp .env.example .env.local
```

In PowerShell, the last line is `Copy-Item .env.example .env.local`.

Fill in `.env.local` as described below, then start it:

```bash
npm run dev
```

Open http://localhost:3000.

### Free keys

Everything is free and none of it needs a credit card. Quotes and charts work with nothing filled in, so you can add these as you go. Keys stay in `.env.local`, which git ignores.

| Setting | Unlocks | How to get it |
|---|---|---|
| `SEC_USER_AGENT` | `FA`, `CF`, `INS`, `DCF` | No signup. The SEC asks automated users to identify themselves, so enter your name and email, for example `FinTerminal Jane Doe jane@example.com`. |
| `FRED_API_KEY` | `ECO`, `CURV`, `DCF` | Create a free account at [fredaccount.stlouisfed.org](https://fredaccount.stlouisfed.org/apikeys), then request a key. |
| `FINNHUB_API_KEY` | Live prices for US stocks and funds, a backup for their quotes when Yahoo fails, and more headlines in `N` | Register at [finnhub.io](https://finnhub.io/register) and copy the key from your dashboard. Optional. |

The running server picks up a new key by itself. Reload the page afterwards.

## Using it

Type anywhere to search, then press Enter to open the result in the focused panel. You can type a command such as `AAPL GP`, or plain words such as `aapl chart` or `yield curve`.

| Command | What it shows |
|---|---|
| `<SYM> GP` | Price chart with moving averages and volume |
| `<SYM> DES` | Company overview and key stats |
| `<SYM> FA` | Income statement, balance sheet and cash flow |
| `<SYM> CF` | SEC filings |
| `<SYM> INS` | Insider trades from Form 4s, and the Forms 3, 4 and 5 filed |
| `<SYM> DCA` | Dollar-cost averaging backtest: every schedule against a lump sum |
| `<SYM> DCF` | DCF valuation: a range of values per share, with every assumption shown |
| `<SYM> OMON` | Options chain: calls and puts by strike for one expiration, around the price |
| `W` | Your watchlist |
| `WEI` | World indices |
| `SECT` | Sector heatmap |
| `ROT` | Sector rotation: trend and momentum against SPY |
| `MOST` | Top movers |
| `EQS` | Stock screener: Yahoo's screens, sortable, with market-cap and P/E filters |
| `N` | News by topic: markets, forex, crypto, mergers |
| `<SYM> N` | News about one symbol |
| `FX` | Currencies |
| `CMDTY` | Commodities |
| `ECO` | US economic indicators |
| `ECO <FRED_ID>` | Any FRED series, for example `ECO UNRATE` |
| `CURV` | Treasury yield curve |
| `HELP` | Everything, with examples |

| Key | Action |
|---|---|
| Tab | Next panel |
| Esc | Clear the search, or restore a maximized panel |
| Double-click a panel's title | Maximize it |

Your layout and watchlist are saved in the browser.

### The status bar

On a wide enough window, each source has a dot and the time it last answered.

| Dot | Meaning |
|---|---|
| Green | Working |
| Red, `DOWN` | Its last request failed. Panels using it say so and keep retrying. |
| Grey | Nothing has asked it yet since the server started. |
| Hollow, `NO KEY` | It needs a setting in `.env.local` |

`LIVE 4` means four US stocks and funds on screen stream from Finnhub. During the regular session, 09:30 to 16:00 New York time, their prices move with each trade, at most once a second. Other quotes refresh every 10 to 15 seconds.

## Troubleshooting

Panels show the message in the first column. Fuller errors appear in the terminal running `npm run dev`.

| Message | What to do |
|---|---|
| `Add FRED_API_KEY to .env.local, then reload this page.` | Add the key, as above. |
| `FRED refused FRED_API_KEY.` | The key is mistyped. Copy it again from your FRED account. |
| `SEC_USER_AGENT isn't set.` | Add your name and email, as above. |
| `SEC EDGAR isn't responding`, and the terminal says `The SEC answered 403` | The SEC refused the request. Check that `SEC_USER_AGENT` isn't blank. The other cause is too many requests, and the SEC's page for that is titled "Request Rate Threshold Exceeded": wait a few minutes before trying again. |
| `Yahoo Finance isn't responding`, and the terminal mentions a crumb, such as `Failed to get crumb` | The session the app keeps with Yahoo failed. Restart `npm run dev`. If the status in the message is 429, Yahoo is limiting your connection, so wait a while first. If `Could not find crumb` persists, Yahoo may have changed something: run `npm install yahoo-finance2@latest`. With a Finnhub key, US stock quotes keep working in the meantime. |
| Finnhub shows `DOWN`, there's no `LIVE` in the status bar, and the terminal says `Finnhub's stream failed before it opened` | The live stream can't reach Finnhub. It retries by itself, waiting longer each time, up to a minute, and meanwhile prices refresh every 10 seconds. Check `FINNHUB_API_KEY`, and that your network lets through `ws.finnhub.io`. |
| `Can't reach the FinTerminal server.` | `npm run dev` has stopped. Start it again. |
| Something is failing that shouldn't be | Check whether `FAIL_SOURCES` is set in `.env.local`. See below. |
| `is not a function` in the terminal, or old behavior after switching git branches | The dev server is holding old code. Restart `npm run dev`. |
| Port 3000 is in use | `npm run dev -- -p 3001` |
| `npm ci` reports moderate vulnerabilities | They're in development tools, not the running app: `npm audit --omit=dev` finds none. Don't run `npm audit fix --force`, which makes breaking changes. |

### Trying out a failure

To see what the panels do when a source fails, add this to `.env.local`, using any of `yahoo`, `sec`, `fred` and `finnhub`:

```
FAIL_SOURCES=yahoo
```

Set it back to empty to turn it off, because deleting the line can leave the old value in place until you restart the server.

## Development

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run check:keys
```

`check:keys` runs after a build. It fails if a value from `.env.local` reached the files sent to the browser.

The roadmap lives in GitHub issues and milestones. Each issue gets its own branch and PR.

## Data sources

Yahoo Finance (unofficial, via `yahoo-finance2`; personal use only), SEC EDGAR, FRED and Finnhub. Prices may be delayed. Nothing here is investment advice.

# FinTerminal

A Bloomberg-style market terminal that runs locally on one PC. Every data source must be free: the only paid tool is the Claude subscription.

## Hard rules
- **Free data only.** Never add a paid API, a paid tier, or a source that needs a credit card. Free-key tiers (FRED, Finnhub) are fine.
- **Never deployed.** The app runs at localhost for personal use, on the user's PC or inside a cloud session's VM. It is never hosted publicly. (Yahoo Finance is unofficial and limited to personal use.)
- **Secrets stay in `.env.local`** (gitignored). Read keys only in server code (`src/app/api/**`, `src/lib/providers/**`). Never expose them to the client bundle, and never commit them.
- **No in-app LLM calls.** The Claude subscription does not cover API usage.

## How we work
- Follow the `karpathy-guidelines` skill on every code change: think before coding, keep it simple, make surgical changes, define verifiable goals.
- Use the agent-skills workflow: `/agent-skills:plan` → `/agent-skills:build` → `/agent-skills:test` → `/agent-skills:review`. Build in thin vertical slices: each slice is tested, checked in the browser, and committed.
- Work is tracked as GitHub issues (private repo `jitishp04/FinTerminal`). One branch and one PR per issue (`feat/<issue#>-short-name`), and the PR body says `Closes #<n>`. Merge a PR only when the user says so (squash, delete the branch).
- Skills, agents and commands are vendored into `.claude/`, not installed as plugins, so local and cloud sessions load the same ones. See `.claude/VENDORED.md` for sources and how to update them.

## Local and cloud sessions
Work moves between the user's Windows PC and cloud sessions (claude.ai/code, the Claude phone app). GitHub is the hand-off point.
- **Before switching**, commit and push the branch. A cloud session clones from GitHub; uncommitted or unpushed local work isn't there.
- **Picking up cloud work locally**: `git fetch` and check out the branch the cloud session pushed (`claude --teleport` also brings the conversation).
- **Dependencies**: a SessionStart hook (`.claude/hooks/install-deps.mjs`) runs `npm ci` whenever `package.json` or `package-lock.json` changed since the last install, in both places. Keep the lockfile in sync: change dependencies only with `npm install`, and commit `package-lock.json` alongside `package.json`.
- **Detecting the cloud**: `CLAUDE_CODE_REMOTE=true`. There, no one can open the browser preview, so verify with `npm test`, `npm run typecheck`, `npm run build`, and `curl` against `npm run dev`, and say in the PR that the browser check is still to do.
- **Cloud environment** (the user sets it once at claude.ai/code): network access **Custom** with the default list plus `*.yahoo.com`, `*.sec.gov`, `api.stlouisfed.org`, `finnhub.io`. Keys go in as environment variables with the same names as `.env.local`, which Next.js reads either way.

## Stack
Next.js 16 (App Router, `cacheComponents` on) + TypeScript + Tailwind v4 · TanStack Query · TradingView `lightweight-charts` · Vitest.

@AGENTS.md

```
src/app/page.tsx                 terminal shell: command bar, 4-panel grid, status bar
src/app/api/*/route.ts           server routes; the only place that calls data providers
src/lib/providers/*.ts           one adapter per source → normalized types in src/lib/types.ts
src/lib/cache.ts                 in-memory TTL cache + in-flight dedupe
src/lib/commands.ts              parses "AAPL GP" → { symbol, fn, args }
src/components/functions/*.tsx   one component per function code
```

## Data sources
| Data | Source | Key |
|---|---|---|
| Quotes, charts, profile, movers (stocks, ETFs, indices, FX, futures) | `yahoo-finance2` | none |
| Quote fallback (US stocks) | Finnhub | `FINNHUB_API_KEY` |
| Financial statements, filings, insider Form 4s | SEC EDGAR (≤10 req/s) | `SEC_USER_AGENT` (required contact header) |
| Macro series, Treasury yield curve | FRED | `FRED_API_KEY` |

## Function codes
`<SYM> GP` chart · `<SYM> DES` description · `<SYM> FA` financials · `<SYM> CF` filings · `<SYM> INS` insiders · `W` watchlist · `WEI` world indices · `SECT` sectors · `MOST` movers · `FX` currencies · `CMDTY` commodities · `ECO [FRED_ID]` macro · `CURV` yield curve · `HELP`

## Commands
- `npm run dev`: start at http://localhost:3000
- `npm test`: Vitest
- `npm run build` / `npm run lint` / `npm run typecheck` (runs `next typegen` first: route types like `LayoutProps` are generated)

"use client";

import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useMemo, useState } from "react";
import {
  FREQUENCIES,
  type Frequency,
  lookback,
  luckCheck,
  ordinal,
  type Outcome,
  type Plan,
  rank,
  type Schedule,
  scheduleLabel,
  simulate,
} from "@/lib/dca";
import { fetchApi, pollEvery } from "@/lib/fetchApi";
import { formatChange, formatPercent, formatPrice } from "@/lib/format";
import { typeLabel } from "@/lib/keyStats";
import type { History } from "@/lib/types";
import { QUOTE_TABLE } from "./quotes";
import { SourceError } from "./SourceError";
import { Toggle } from "./Toggle";

// The server holds a history for 4 hours; it changes once a day.
const FRESH = 4 * 60 * 60_000;
const SUPPORTED = new Set(["EQUITY", "ETF", "MUTUALFUND", "INDEX"]);
const LOOKBACKS: { label: string; years: number | undefined }[] = [
  { label: "1Y", years: 1 },
  { label: "3Y", years: 3 },
  { label: "5Y", years: 5 },
  { label: "10Y", years: 10 },
  { label: "Max", years: undefined },
];
const EVERY: Record<Frequency, string> = { weekly: "Week", biweekly: "2 weeks", monthly: "Month" };
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
/** Best and worst schedules closer than this, in points a year, made little difference. */
const SMALL_GAP = 0.5;

const FIELD = "rounded-sm border border-border bg-panel px-1.5 py-0.5 focus:border-amber focus:outline-none";
const money = (value: number) => formatPrice(value, 2);
const yearly = (outcome: Outcome) => (outcome.xirr === undefined ? "—" : formatPercent(outcome.xirr));

/** DCA: how buying a fixed amount on a schedule would have done, against a lump sum and every other schedule. */
export function DcaBacktest({ symbol }: { symbol: string }) {
  const history = useQuery({
    queryKey: ["history", symbol],
    queryFn: () => fetchApi<History>(`/api/history?symbol=${encodeURIComponent(symbol)}`),
    // Asked again only after a failure.
    refetchInterval: pollEvery(false),
    staleTime: FRESH,
  });

  if (history.isPending) {
    return (
      <p role="status" className="text-muted">
        Loading price history…
      </p>
    );
  }
  if (history.isError) return <SourceError error={history.error} />;
  const { type, days } = history.data;
  if (!SUPPORTED.has(type)) {
    return (
      <p role="status" className="text-muted">
        DCA works on stocks, ETFs, mutual funds and indices. {symbol} is a {typeLabel(type).toLowerCase()}.
      </p>
    );
  }
  if (days.length === 0) {
    return (
      <p role="status" className="text-muted">
        Yahoo has no daily closes for {symbol}.
      </p>
    );
  }
  return <Backtest history={history.data} />;
}

function Backtest({ history }: { history: History }) {
  const [amountText, setAmountText] = useState("100");
  const [feeText, setFeeText] = useState("0");
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [weekday, setWeekday] = useState(1);
  const [monthDay, setMonthDay] = useState(1);
  const [years, setYears] = useState<number | undefined>(5);
  const [reinvest, setReinvest] = useState(true);

  const isIndex = history.type === "INDEX";
  const amount = Number(amountText);
  const fee = Number(feeText);
  const problem =
    !(amount > 0) ? "Enter an amount above 0." : !(fee >= 0) || fee >= amount ? "The fee has to be at least 0 and less than the amount." : undefined;
  const schedule: Schedule = { frequency, day: frequency === "monthly" ? monthDay : weekday };

  // Every schedule is run here, so choosing another only looks it up.
  const results = useMemo(() => {
    if (problem) return undefined;
    const plan: Plan = { amount, fee, reinvest };
    const range = lookback(history.days, years);
    return {
      range,
      plan,
      ranked: rank(range.days, history.dividends, plan, range.from),
      luck: luckCheck(range.days, history.dividends, plan, range.from),
    };
  }, [history, years, amount, fee, reinvest, problem]);

  const chosen = results?.ranked.find((r) => r.schedule.frequency === schedule.frequency && r.schedule.day === schedule.day);
  const lump =
    results && chosen
      ? simulate(results.range.days, history.dividends, { ...results.plan, amount: chosen.outcome.invested }, [results.range.from])
      : undefined;

  // Capped in width, so a maximized panel keeps each row readable across.
  return (
    <div className="@container flex max-w-3xl flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <label className="flex items-center gap-1.5">
          <span className="text-muted">Buy</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            aria-invalid={!(amount > 0)}
            className={`w-20 ${FIELD}`}
          />
          <span className="text-muted">{history.currency}</span>
        </label>
        <div role="group" aria-label="Every" className="flex items-center gap-0.5 text-xs">
          <span aria-hidden className="mr-1 text-muted">
            every
          </span>
          {FREQUENCIES.map((f) => (
            <Toggle key={f} pressed={f === frequency} onClick={() => setFrequency(f)}>
              {EVERY[f]}
            </Toggle>
          ))}
        </div>
        <label className="flex items-center gap-1.5">
          <span className="text-muted">on</span>
          {frequency === "monthly" ? (
            <select value={monthDay} onChange={(e) => setMonthDay(Number(e.target.value))} aria-label="Day of the month" className={FIELD}>
              {Array.from({ length: 28 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  day {i + 1}
                </option>
              ))}
            </select>
          ) : (
            <select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))} aria-label="Weekday" className={FIELD}>
              {WEEKDAYS.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
          )}
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-muted">fee</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={feeText}
            onChange={(e) => setFeeText(e.target.value)}
            aria-invalid={!(fee >= 0) || fee >= amount}
            className={`w-16 ${FIELD}`}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <div role="group" aria-label="Lookback" className="flex items-center gap-0.5">
          {LOOKBACKS.map(({ label, years: y }) => (
            <Toggle key={label} pressed={y === years} onClick={() => setYears(y)}>
              {label}
            </Toggle>
          ))}
        </div>
        {isIndex ? (
          <span className="text-muted">Indices pay no dividends, so this is price only.</span>
        ) : (
          <Toggle pressed={reinvest} onClick={() => setReinvest(!reinvest)}>
            Reinvest dividends
          </Toggle>
        )}
      </div>

      {problem && (
        <p role="alert" className="text-down">
          {problem}
        </p>
      )}
      {results && chosen && lump && (
        <>
          <p className="text-muted">
            {results.range.short &&
              `Yahoo's history for ${history.symbol} starts on ${history.days[0].date}, so this covers ${yearsBetween(results.range.from, chosen.outcome.end)} years. `}
            Past results from {chosen.outcome.firstBuy} to {chosen.outcome.end}
            {reinvest && !isIndex ? ", dividends reinvested." : isIndex ? "." : ", dividends kept as cash."}
          </p>
          <Comparison plan={chosen.outcome} planLabel={scheduleLabel(schedule)} lump={lump} />
          <Schedules results={results} chosen={schedule} />
        </>
      )}
      <p className="text-xs text-muted">
        Past performance on Yahoo&apos;s prices, not a recommendation or a forecast. Each buy is at the close of the first trading
        day on or after its date. Average cost is money put in per share owned. Amounts in {history.currency}.
      </p>
    </div>
  );
}

function Comparison({ plan, planLabel, lump }: { plan: Outcome; planLabel: string; lump: Outcome }) {
  const rows: [string, (o: Outcome) => ReactNode][] = [
    ["Buys", (o) => o.buys],
    ["Money in", (o) => money(o.invested)],
    ["Value", (o) => money(o.value)],
    [
      "Gain",
      (o) => (
        <Signed value={o.value - o.invested}>
          {formatChange(o.value - o.invested, 2)}
          {/* On its own line in a narrow panel, so both columns fit. */}
          <span className="block @md:inline"> ({formatPercent(100 * (o.value / o.invested - 1))})</span>
        </Signed>
      ),
    ],
    ["Return a year", (o) => <Signed value={o.xirr ?? 0}>{yearly(o)}</Signed>],
    ["Largest drop", (o) => formatPercent(-o.largestDrop)],
    ["Average cost", (o) => formatPrice(o.averageCost)],
  ];
  return (
    <table className={QUOTE_TABLE}>
      <thead className="text-xs text-muted">
        <tr className="border-b border-border">
          <th scope="col" />
          <th scope="col" className="whitespace-normal">
            {planLabel}
          </th>
          <th scope="col" className="whitespace-normal">
            Lump sum on {lump.firstBuy}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, cell]) => (
          <tr key={label}>
            <th scope="row" className="text-left text-muted">
              {label}
            </th>
            <td>{cell(plan)}</td>
            <td>{cell(lump)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Signed({ value, children }: { value: number; children: ReactNode }) {
  return <span className={value > 0 ? "text-up" : value < 0 ? "text-down" : undefined}>{children}</span>;
}

interface Results {
  range: { from: string };
  ranked: ReturnType<typeof rank>;
  luck: ReturnType<typeof luckCheck>;
}

/** Every schedule's result, how far apart the best and worst were, and whether the first half's best held up. */
function Schedules({ results, chosen }: { results: Results; chosen: Schedule }) {
  const { ranked, luck } = results;
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  const gap = (best.outcome.xirr ?? 0) - (worst.outcome.xirr ?? 0);
  const label = (s: Schedule) => scheduleLabel(s).replace(/^Every/, "every");

  return (
    <section aria-label="Every schedule" className="flex flex-col gap-1">
      <h3 className="text-xs tracking-wider text-muted uppercase">All {ranked.length} schedules</h3>
      <p>
        Best was {label(best.schedule)} at {yearly(best.outcome)} a year, and worst {label(worst.schedule)} at{" "}
        {yearly(worst.outcome)}: {formatPrice(gap, 2)} points apart.{" "}
        {gap < SMALL_GAP
          ? "That's a small gap: when you bought made little difference."
          : "Check the luck test below before reading anything into it."}
      </p>
      {luck && (
        <p>
          Luck test: on the first half, before {luck.middle}, the best was {label(luck.firstBest)}. On the second half it ranked{" "}
          {ordinal(luck.laterRank)} of {luck.count}.{" "}
          {luck.laterRank <= luck.count / 4
            ? "It held up this time, but one test can't tell an edge from luck."
            : "A real edge would have stayed near the top, so its lead looks like luck."}
        </p>
      )}
      <details>
        <summary className="cursor-pointer text-xs text-muted hover:text-foreground">Every schedule, ranked</summary>
        <table className={QUOTE_TABLE}>
          <thead className="text-xs text-muted">
            <tr className="border-b border-border">
              <th scope="col">#</th>
              <th scope="col" className="text-left">
                Schedule
              </th>
              <th scope="col">Return a year</th>
              {/* Value means little without money in, and both need a wider panel. */}
              <th scope="col" className="hidden @md:table-cell">
                Value
              </th>
              <th scope="col" className="hidden @md:table-cell">
                Money in
              </th>
            </tr>
          </thead>
          <tbody>
            {ranked.map(({ schedule, outcome }, i) => {
              const isChosen = schedule.frequency === chosen.frequency && schedule.day === chosen.day;
              return (
                <tr key={`${schedule.frequency}${schedule.day}`} className={isChosen ? "bg-border" : undefined}>
                  <td className="text-muted">{i + 1}</td>
                  <td className="text-left">{scheduleLabel(schedule)}</td>
                  <td>{yearly(outcome)}</td>
                  <td className="hidden @md:table-cell">{money(outcome.value)}</td>
                  <td className="hidden text-muted @md:table-cell">{money(outcome.invested)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </details>
    </section>
  );
}

const yearsBetween = (from: string, to: string) => ((Date.parse(to) - Date.parse(from)) / 864e5 / 365.25).toFixed(1);

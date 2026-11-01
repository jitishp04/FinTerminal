"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  histogram,
  netDebt,
  percentile,
  prefill,
  type Range,
  type Ranges,
  type Rates,
  RISK_PREMIUM,
  RUNS,
  SEED,
  simulate,
  valuePerShare,
  YEARS,
} from "@/lib/dcf";
import { fetchApi, pollEvery } from "@/lib/fetchApi";
import { formatInteger, formatPercent, formatPrice } from "@/lib/format";
import type { DcfInputs, DcfUnfit } from "@/lib/types";
import { MacroError } from "./MacroError";

// The price moves; the filings and the Treasury yield barely do.
const REFRESH = 10 * 60_000;
const BINS = 40;
const FIELD = "w-16 rounded-sm border border-border bg-panel px-1 py-0.5 text-right focus:border-amber focus:outline-none";

const dollars = (value: number) => `${value < 0 ? "-" : ""}$${formatPrice(Math.abs(value), 2)}`;
const millions = (value: number) => `${value < 0 ? "-" : ""}$${formatInteger(Math.abs(value) / 1e6)}M`;

/** DCF: a range of values per share from discounted free cash flow, against the price. */
export function DcfValuation({ symbol }: { symbol: string }) {
  const dcf = useQuery({
    queryKey: ["dcf", symbol],
    queryFn: () => fetchApi<DcfInputs | DcfUnfit>(`/api/dcf?symbol=${encodeURIComponent(symbol)}`),
    refetchInterval: pollEvery(REFRESH),
    staleTime: REFRESH,
  });

  if (dcf.isPending) {
    return (
      <p role="status" className="text-muted">
        Loading filings and prices…
      </p>
    );
  }
  if (dcf.isLoadingError) return <MacroError error={dcf.error} />;
  if ("reason" in dcf.data) {
    return (
      <p role="status" className="text-muted">
        {dcf.data.reason}
      </p>
    );
  }
  // Keyed, so another company starts from its own ranges.
  return <Valuation key={symbol} inputs={dcf.data} />;
}

const RATES: { key: keyof Rates; label: string }[] = [
  { key: "growth", label: "Growth, year 1" },
  { key: "terminal", label: "Terminal growth" },
  { key: "discount", label: "Discount rate" },
];

type RangeText = Record<keyof Rates, Record<keyof Range, string>>;

const toText = (ranges: Ranges) =>
  Object.fromEntries(
    Object.entries(ranges).map(([key, range]) => [key, { low: String(range.low), likely: String(range.likely), high: String(range.high) }]),
  ) as RangeText;

/** The ranges as numbers, or what's wrong with them. */
function parse(text: RangeText): { ranges: Ranges } | { problem: string } {
  const ranges = {} as Ranges;
  for (const { key, label } of RATES) {
    const range = { low: Number(text[key].low), likely: Number(text[key].likely), high: Number(text[key].high) };
    if (![range.low, range.likely, range.high].every((v) => text[key].low !== "" && Number.isFinite(v))) {
      return { problem: `${label} needs a number in each box.` };
    }
    if (!(range.low <= range.likely && range.likely <= range.high)) return { problem: `${label} needs low ≤ likely ≤ high.` };
    ranges[key] = range;
  }
  if (ranges.terminal.likely >= ranges.discount.likely) {
    return { problem: "Likely terminal growth has to be below the likely discount rate." };
  }
  return { ranges };
}

type Outcome = { problem: string } | { base: number; values: number[] };

function Valuation({ inputs }: { inputs: DcfInputs }) {
  const prefilled = useMemo(() => prefill(inputs), [inputs]);
  const [text, setText] = useState(() => toText(prefilled));

  const result = useMemo((): Outcome => {
    const parsed = parse(text);
    if ("problem" in parsed) return parsed;
    const start = { freeCashFlow: inputs.freeCashFlow.value, netDebt: netDebt(inputs.balance), shares: inputs.shares.value };
    try {
      return { base: valuePerShare(start, likely(parsed.ranges)), values: simulate(start, parsed.ranges) };
    } catch (error) {
      return { problem: (error as Error).message };
    }
  }, [text, inputs]);

  const edit = (key: keyof Rates, end: keyof Range, value: string) => setText({ ...text, [key]: { ...text[key], [end]: value } });

  return (
    <div className="@container flex max-w-3xl flex-col gap-2">
      {"values" in result ? (
        <Results inputs={inputs} base={result.base} values={result.values} />
      ) : (
        <p role="alert" className="text-down">
          {result.problem}
        </p>
      )}

      <section aria-label="Assumptions" className="flex flex-col gap-1.5">
        <h3 className="flex items-baseline gap-3 text-xs tracking-wider text-muted uppercase">
          Assumptions, in % a year
          <button type="button" onClick={() => setText(toText(prefilled))} className="normal-case tracking-normal text-link hover:underline">
            Reset
          </button>
        </h3>
        {RATES.map(({ key, label }) => (
          <div key={key} className="flex flex-col gap-0.5">
            <div role="group" aria-label={label} className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="w-full shrink-0 @md:w-32">{label}</span>
              {(["low", "likely", "high"] as const).map((end) => (
                <label key={end} className="flex items-center gap-1">
                  <span className="text-xs text-muted">{end}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step={0.1}
                    value={text[key][end]}
                    onChange={(e) => edit(key, end, e.target.value)}
                    className={FIELD}
                  />
                </label>
              ))}
            </div>
            <p className="text-xs text-muted">{rateSource(key, inputs)}</p>
          </div>
        ))}
      </section>

      <section aria-label="Starting point" className="flex flex-col gap-1">
        <h3 className="text-xs tracking-wider text-muted uppercase">Starting point, from filings and prices</h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5">
          {startingPoint(inputs).map(([label, value, source]) => (
            <div key={label} className="contents">
              <dt className="text-muted">{label}</dt>
              <dd className="text-right @md:text-left">
                {value} <span className="block text-xs text-muted @md:inline">{source}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="text-xs text-muted">
        Estimates from the assumptions above, not a recommendation or a forecast. {formatInteger(RUNS)} runs, seed {SEED}, each
        drawing the three rates from triangular distributions on their ranges; a draw with terminal growth at or above the
        discount rate is drawn again. Growth fades in a straight line to terminal growth by year {YEARS}, and cash flows are
        discounted at each year&apos;s end.
      </p>
    </div>
  );
}

const likely = (ranges: Ranges): Rates => ({
  growth: ranges.growth.likely,
  terminal: ranges.terminal.likely,
  discount: ranges.discount.likely,
});

function rateSource(key: keyof Rates, { revenue, riskFree, beta }: DcfInputs): string {
  if (key === "growth") {
    return revenue.length > 1
      ? `From revenue, ${revenue[0].period}–${revenue[revenue.length - 1].period} (SEC): its slowest year, compound rate and fastest year.`
      : "Not enough revenue history to go on: a placeholder.";
  }
  if (key === "terminal") return "A long-run rate, about inflation: no company outgrows the economy for ever.";
  const betaText = beta === undefined ? "a beta of 1, as Yahoo has none" : `beta ${formatPrice(beta, 2)} (Yahoo)`;
  return `10-year Treasury ${formatPrice(riskFree.value, 2)}% (FRED DGS10, ${riskFree.date}) + ${betaText} × an equity risk premium of ${RISK_PREMIUM.low}, ${RISK_PREMIUM.likely} or ${RISK_PREMIUM.high}%.`;
}

function startingPoint({ freeCashFlow, balance, shares, price, currency }: DcfInputs): [string, string, string][] {
  const debt = balance.currentDebt + balance.longTermDebt;
  return [
    [
      "Free cash flow",
      millions(freeCashFlow.value),
      `Operating cash flow ${millions(freeCashFlow.operatingCashFlow)} less capital expenditures ${millions(freeCashFlow.capitalExpenditures)}, ${freeCashFlow.period} (SEC).`,
    ],
    [
      "Net debt",
      millions(netDebt(balance)),
      `Debt ${millions(debt)} (current ${millions(balance.currentDebt)}, long-term ${millions(balance.longTermDebt)}) less cash ${millions(balance.cash)} and short-term investments ${millions(balance.shortTermInvestments)}, ${balance.date} (SEC). Leases and commercial paper aren't counted.`,
    ],
    ["Diluted shares", `${formatInteger(shares.value / 1e6)}M`, `${shares.period} (SEC).`],
    ["Price", dollars(price), `Yahoo${currency && currency !== "USD" ? `, in ${currency}: the filings are in USD` : ""}.`],
  ];
}

function Results({ inputs, base, values }: { inputs: DcfInputs; base: number; values: number[] }) {
  const { price } = inputs;
  const above = values.filter((v) => v > price).length / values.length;
  const [p10, p50, p90] = [10, 50, 90].map((p) => percentile(values, p));
  return (
    <section aria-label="Estimated value" className="flex flex-col gap-1.5">
      <h3 className="text-xs tracking-wider text-muted uppercase">Estimated value per share, from the assumptions below</h3>
      <p>
        Base case <span className="font-semibold">{dollars(base)}</span>, against a price of {dollars(price)} (
        {formatPercent(100 * (base / price - 1))}).
      </p>
      <p>
        10th, 50th and 90th percentiles: {dollars(p10)}, {dollars(p50)} and {dollars(p90)}.
      </p>
      <p className="font-semibold">{formatPrice(100 * above, 0)}% of simulated values are above the price, given these ranges.</p>
      <Histogram values={values} price={price} base={base} />
    </section>
  );
}

/** The middle 98% of runs, with the price and base case marked. */
function Histogram({ values, price, base }: { values: number[]; price: number; base: number }) {
  const from = percentile(values, 1);
  const to = percentile(values, 99);
  if (to <= from) {
    return <p className="text-xs text-muted">Every run gives {dollars(from)}: the ranges have no spread.</p>;
  }
  const counts = histogram(values, from, to, BINS);
  const tallest = Math.max(...counts, 1);
  const at = (value: number) => (100 * (value - from)) / (to - from);
  const priceAt = at(price);
  return (
    <figure className="flex flex-col gap-0.5">
      <div className="relative h-28">
        <svg
          viewBox={`0 0 ${BINS} 100`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Histogram of ${formatInteger(values.length)} simulated values per share, from ${dollars(from)} to ${dollars(to)}.`}
          className="h-full w-full"
        >
          {counts.map((count, i) => (
            <rect key={i} x={i + 0.08} width={0.84} y={100 - (100 * count) / tallest} height={(100 * count) / tallest} fill="var(--link)" fillOpacity={0.7} />
          ))}
          <Marker at={(at(base) * BINS) / 100} color="var(--foreground)" dashed />
          {priceAt >= 0 && priceAt <= 100 && <Marker at={(priceAt * BINS) / 100} color="var(--amber)" />}
        </svg>
      </div>
      <figcaption className="flex justify-between gap-2 text-xs text-muted">
        <span>{dollars(from)}</span>
        <span className="text-center">
          <span className="text-amber">│</span> price {dollars(price)}
          {priceAt > 100 ? ", above every run shown" : priceAt < 0 ? ", below every run shown" : ""} · ┆ base case · middle 98% of
          runs
        </span>
        <span>{dollars(to)}</span>
      </figcaption>
    </figure>
  );
}

function Marker({ at, color, dashed = false }: { at: number; color: string; dashed?: boolean }) {
  return (
    <line
      x1={at}
      x2={at}
      y1={0}
      y2={100}
      stroke={color}
      strokeWidth={2}
      strokeDasharray={dashed ? "4 3" : undefined}
      vectorEffect="non-scaling-stroke"
    />
  );
}

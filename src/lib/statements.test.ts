import { describe, expect, it } from "vitest";
import aapl from "./providers/fixtures/aapl-facts.json";
import jpm from "./providers/fixtures/jpm-facts.json";
import { toFinancials, type CompanyFacts } from "./providers/secFacts";
import { formatCell, notAvailableMessage, statementView } from "./statements";
import type { Financials, StatementLine } from "./types";

const line = (key: string, values: (number | null)[], unit?: StatementLine["unit"]): StatementLine => ({
  key,
  label: key,
  ...(unit && { unit }),
  values,
});

const financials = (
  labels: string[],
  { income = [], balance = [], cashFlow = [] }: Partial<Pick<Financials, "income" | "balance" | "cashFlow">>,
): Financials => ({
  symbol: "TEST",
  name: "Test Co",
  period: labels[0].startsWith("Q") ? "quarterly" : "annual",
  periods: labels.map((label) => ({ end: "2025-12-31", label })),
  income,
  balance,
  cashFlow,
});

const row = (view: ReturnType<typeof statementView>, key: string) => {
  const found = view.rows.find((candidate) => candidate.key === key);
  if (!found) throw new Error(`no row ${key}`);
  return found;
};

const real = (facts: unknown, period: "annual" | "quarterly") => {
  const statements = toFinancials(facts as CompanyFacts, period);
  if (!statements) throw new Error("expected statements");
  return { symbol: "TEST", ...statements };
};

describe("columns", () => {
  it("shows five years, keeping the sixth only to work out growth", () => {
    const f = financials(["FY2026", "FY2025", "FY2024", "FY2023", "FY2022", "FY2021"], {
      income: [line("revenue", [60, 50, 40, 30, 20, 10])],
    });

    const view = statementView(f, "income");

    expect(view.periods.map((period) => period.label)).toEqual(["FY2026", "FY2025", "FY2024", "FY2023", "FY2022"]);
    expect(row(view, "revenue").values).toEqual([60, 50, 40, 30, 20]);
    expect(row(view, "revenueGrowth").values.at(-1)).toBe(100);
  });

  it("shows eight quarters", () => {
    const labels = [3, 2, 1].map((q) => `Q${q} FY2026`).concat([4, 3, 2, 1].map((q) => `Q${q} FY2025`));
    const all = [...labels, ...[4, 3, 2, 1].map((q) => `Q${q} FY2024`)];
    const f = financials(all, { income: [line("revenue", all.map((_, i) => 100 - i))] });

    expect(statementView(f, "income").periods).toHaveLength(8);
  });
});

describe("year-over-year growth", () => {
  it("compares with the same period a year earlier", () => {
    const f = financials(["FY2025", "FY2024"], { income: [line("revenue", [110, 100]), line("netIncome", [30, 40])] });

    const view = statementView(f, "income");

    expect(row(view, "revenueGrowth").values[0]).toBeCloseTo(10);
    expect(row(view, "netIncomeGrowth").values[0]).toBeCloseTo(-25);
  });

  it("finds that period by name, so a missing quarter can't shift the comparison", () => {
    // Q3 FY2025 is missing, so the fourth column back from Q4 FY2025 is Q3 FY2024, not Q4 FY2024.
    const f = financials(["Q4 FY2025", "Q2 FY2025", "Q1 FY2025", "Q4 FY2024", "Q3 FY2024"], {
      income: [line("revenue", [120, 110, 105, 100, 80])],
    });

    expect(row(statementView(f, "income"), "revenueGrowth").values[0]).toBeCloseTo(20);
  });

  it("is blank on a transition period, and the year after it compares with the last full year", () => {
    const f = financials(["FY2026", "FY2025T", "FY2025"], { income: [line("revenue", [120, 50, 100])] });
    f.periods[1].transition = true;

    expect(row(statementView(f, "income"), "revenueGrowth").values).toEqual([20, null, null]);
  });

  it("compares the year after a transition period with its 12-month figures, as at Compass Minerals", () => {
    const f = financials(["FY2022", "FY2021T"], { income: [line("revenue", [1_245_200_000, 1_145_400_000])] });
    f.periods[1].transition = true;

    const growth = row(statementView(f, "income"), "revenueGrowth").values;

    expect(growth[0]).toBeCloseTo(((1_245.2 - 1_145.4) / 1_145.4) * 100, 6);
    expect(growth[1]).toBeNull();
  });

  it("compares with a full year over a transition period of that number, even one before it", () => {
    const f = financials(["FY2024", "FY2023", "FY2023T"], { income: [line("revenue", [120, 100, 40])] });
    f.periods[2].transition = true;

    expect(row(statementView(f, "income"), "revenueGrowth").values).toEqual([20, null, null]);
  });

  it("compares a quarter in a transition period with that quarter a year earlier, as at Ferguson", () => {
    const f = financials(["Q1 FY2025T", "Q1 FY2025"], { income: [line("revenue", [8_169_000_000, 7_772_000_000])] });
    f.periods[0].transition = true;

    const growth = row(statementView(f, "income"), "revenueGrowth").values;

    expect(growth[0]).toBeCloseTo(((8_169 - 7_772) / 7_772) * 100, 6);
  });

  it("doesn't compare the new year's quarter with one in a transition period", () => {
    const f = financials(["Q2 FY2026", "Q1 FY2026", "Q1 FY2025T", "Q2 FY2025"], {
      income: [line("revenue", [120, 110, 90, 100])],
    });
    f.periods[2].transition = true;

    expect(row(statementView(f, "income"), "revenueGrowth").values).toEqual([20, null, null, null]);
  });

  it("is blank when there's nothing meaningful to compare with", () => {
    const f = financials(["FY2026", "FY2025", "FY2024", "FY2023", "FY2022"], {
      income: [line("netIncome", [12, 10, -5, 0, null])],
    });

    expect(row(statementView(f, "income"), "netIncomeGrowth").values).toEqual([20, null, null, null, null]);
  });

  it("matches a figure worked out by hand from Apple's 10-K", () => {
    const view = statementView(real(aapl, "annual"), "income");
    const growth = row(view, "revenueGrowth").values[view.periods.findIndex((p) => p.label === "FY2025")];

    expect(growth).toBeCloseTo(((416_161 - 391_035) / 391_035) * 100, 6);
    expect(formatCell("growth", growth)).toBe("+6.43%");
  });
});

describe("derived rows", () => {
  it("uses reported gross profit, and works it out where a company doesn't report it", () => {
    const f = financials(["FY2025", "FY2024"], {
      income: [line("revenue", [100, 200]), line("costOfRevenue", [60, 150]), line("grossProfit", [41, null])],
    });

    const view = statementView(f, "income");

    expect(row(view, "grossProfit").values).toEqual([41, 50]);
    expect(row(view, "grossMargin").values).toEqual([0.41, 0.25]);
  });

  it("works out operating margin", () => {
    const f = financials(["FY2025"], { income: [line("revenue", [200]), line("operatingIncome", [30])] });

    expect(row(statementView(f, "income"), "operatingMargin").values).toEqual([0.15]);
  });

  it("works out free cash flow, as operating cash flow less capital expenditures", () => {
    const f = financials(["FY2025", "FY2024"], {
      cashFlow: [line("operatingCashFlow", [100, 90]), line("capitalExpenditures", [30, null])],
    });

    expect(row(statementView(f, "cashFlow"), "freeCashFlow").values).toEqual([70, null]);
  });

  it("puts each derived row after the line it comes from", () => {
    const f = financials(["FY2025"], {
      income: [
        line("revenue", [100]),
        line("costOfRevenue", [60]),
        line("grossProfit", [40]),
        line("operatingIncome", [20]),
        line("netIncome", [10]),
      ],
      cashFlow: [line("operatingCashFlow", [50]), line("capitalExpenditures", [20]), line("investingCashFlow", [-5])],
    });

    expect(statementView(f, "income").rows.map((r) => r.key)).toEqual([
      "revenue",
      "costOfRevenue",
      "grossProfit",
      "grossMargin",
      "operatingIncome",
      "operatingMargin",
      "netIncome",
    ]);
    expect(statementView(f, "cashFlow").rows.map((r) => r.key)).toEqual([
      "operatingCashFlow",
      "capitalExpenditures",
      "freeCashFlow",
      "investingCashFlow",
    ]);
  });
});

describe("rows", () => {
  it("leaves out lines a company doesn't have, like a bank's cost of revenue", () => {
    const view = statementView(real(jpm, "annual"), "income");
    const keys = view.rows.map((r) => r.key);

    expect(keys).toContain("revenue");
    expect(keys).not.toContain("costOfRevenue");
    expect(keys).not.toContain("grossMargin");
  });

  it("keeps a line that has a value in only one period", () => {
    const f = financials(["FY2025", "FY2024"], { balance: [line("inventory", [null, 5])] });

    expect(row(statementView(f, "balance"), "inventory").values).toEqual([null, 5]);
  });

  it("marks the main totals", () => {
    const f = financials(["FY2025"], { income: [line("revenue", [100]), line("costOfRevenue", [60])] });
    const view = statementView(f, "income");

    expect(row(view, "revenue").total).toBe(true);
    expect(row(view, "costOfRevenue").total).toBeFalsy();
  });
});

describe("formatCell", () => {
  it("shows money and share counts in millions, so they read straight across to a 10-K", () => {
    expect(formatCell("money", 416_161_000_000)).toBe("416,161");
    expect(formatCell("money", -12_715_000_000)).toBe("-12,715");
    expect(formatCell("shares", 14_948_500_000)).toBe("14,949");
  });

  it("shows per-share figures, margins and growth in their own form", () => {
    expect(formatCell("perShare", 7.46)).toBe("7.46");
    expect(formatCell("margin", 0.4691)).toBe("46.91%");
    expect(formatCell("growth", 6.43)).toBe("+6.43%");
  });

  it("shows a dash where there's no value", () => {
    expect(formatCell("money", null)).toBe("—");
    expect(formatCell("growth", null)).toBe("—");
  });
});

describe("notAvailableMessage", () => {
  it("names the kind of security when it's why there are no statements", () => {
    expect(notAvailableMessage("ETF")).toBe("Financial statements aren't available for ETFs.");
    expect(notAvailableMessage("MUTUALFUND")).toBe("Financial statements aren't available for mutual funds.");
    expect(notAvailableMessage("INDEX")).toBe("Financial statements aren't available for indices.");
  });

  it("leaves a stock to the server's own message", () => {
    expect(notAvailableMessage("EQUITY")).toBeUndefined();
    expect(notAvailableMessage(undefined)).toBeUndefined();
  });
});

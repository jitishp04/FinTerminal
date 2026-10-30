import { describe, expect, it } from "vitest";
import aapl from "./fixtures/aapl-facts.json";
import jpm from "./fixtures/jpm-facts.json";
import nvda from "./fixtures/nvda-facts.json";
import { toFinancials, type CompanyFacts, type Fact, type Statements } from "./secFacts";

// The fixtures are real SEC data, trimmed to the tags we read and recent years.
// Expected values are worked out by hand from the filings, not from this code.
const statements = (facts: unknown, period: "annual" | "quarterly") => {
  const result = toFinancials(facts as CompanyFacts, period);
  if (!result) throw new Error("expected statements");
  return result;
};

const value = (financials: Statements, statement: "income" | "balance" | "cashFlow", key: string, label: string) => {
  const column = financials.periods.findIndex((period) => period.label === label);
  expect(column, `no period ${label}`).toBeGreaterThanOrEqual(0);
  const line = financials[statement].find((candidate) => candidate.key === key);
  if (!line) throw new Error(`no line ${key}`);
  return line.values[column];
};

/** A one-tag company built from `[start, end, value, accession, fy, fp, form, filed]` rows. */
const company = (tag: string, rows: [string | undefined, string, number, string, number, string, string, string][]) => {
  const facts: Fact[] = rows.map(([start, end, val, accn, fy, fp, form, filed]) => ({
    ...(start ? { start } : {}),
    end,
    val,
    accn,
    fy,
    fp,
    form,
    filed,
  }));
  return { entityName: "Test Co", facts: { "us-gaap": { [tag]: { units: { USD: facts } } } } };
};

describe("annual statements", () => {
  const annual = statements(aapl, "annual");

  it("reads the three statements from a 10-K, labeled the way the company does", () => {
    expect(annual.name).toBe("Apple Inc.");
    expect(annual.periods[0]).toEqual({ end: "2025-09-27", label: "FY2025" });
    expect(value(annual, "income", "revenue", "FY2025")).toBe(416_161_000_000);
    expect(value(annual, "income", "netIncome", "FY2025")).toBe(112_010_000_000);
    expect(value(annual, "income", "epsDiluted", "FY2025")).toBe(7.46);
    expect(value(annual, "balance", "totalAssets", "FY2025")).toBe(359_241_000_000);
    expect(value(annual, "cashFlow", "operatingCashFlow", "FY2025")).toBe(111_482_000_000);
  });

  it("marks per-share and share-count lines, and leaves dollars unmarked", () => {
    const unit = (key: string) => annual.income.find((line) => line.key === key)?.unit;
    expect(unit("epsDiluted")).toBe("perShare");
    expect(unit("sharesDiluted")).toBe("shares");
    expect(unit("revenue")).toBeUndefined();
  });

  it("names a fiscal year as the company does, even when it ends in another calendar year", () => {
    const nvidia = statements(nvda, "annual");
    expect(nvidia.periods[0]).toEqual({ end: "2026-01-25", label: "FY2026" });
    expect(value(nvidia, "income", "revenue", "FY2026")).toBe(215_938_000_000);
  });

  it("reads a bank's own revenue tag, and leaves lines a bank doesn't have empty", () => {
    const bank = statements(jpm, "annual");
    expect(value(bank, "income", "revenue", "FY2025")).toBe(182_447_000_000);
    expect(value(bank, "income", "costOfRevenue", "FY2025")).toBeNull();
  });

  it("ignores a proxy statement's rounded figure, though it was filed after the 10-K", () => {
    expect(value(statements(jpm, "annual"), "income", "netIncome", "FY2025")).toBe(57_048_000_000);
  });
});

describe("quarterly statements", () => {
  const quarterly = statements(aapl, "quarterly");

  it("lists quarters newest first, including a fiscal year still in progress", () => {
    expect(quarterly.periods.slice(0, 4).map((period) => period.label)).toEqual([
      "Q3 FY2026",
      "Q2 FY2026",
      "Q1 FY2026",
      "Q4 FY2025",
    ]);
    expect(quarterly.periods[0].end).toBe("2026-06-27");
  });

  it("uses the three-month figure when the 10-Q reports one", () => {
    expect(value(quarterly, "income", "revenue", "Q3 FY2026")).toBe(109_417_000_000);
  });

  it("works out Q4, which is never filed, from the full year", () => {
    expect(value(quarterly, "income", "revenue", "Q4 FY2025")).toBe(102_466_000_000);
    expect(value(quarterly, "income", "netIncome", "Q4 FY2025")).toBe(27_466_000_000);
    expect(value(quarterly, "cashFlow", "operatingCashFlow", "Q4 FY2025")).toBe(29_728_000_000);
  });

  it("works out quarterly cash flow from 10-Qs that only report year to date", () => {
    expect(value(quarterly, "cashFlow", "operatingCashFlow", "Q1 FY2026")).toBe(53_925_000_000);
    expect(value(quarterly, "cashFlow", "operatingCashFlow", "Q2 FY2026")).toBe(28_702_000_000);
    expect(value(quarterly, "cashFlow", "operatingCashFlow", "Q3 FY2026")).toBe(34_369_000_000);
  });

  it("reads balance sheet items at the quarter's end", () => {
    expect(value(quarterly, "balance", "totalAssets", "Q3 FY2026")).toBe(383_266_000_000);
    expect(value(quarterly, "balance", "totalAssets", "Q4 FY2025")).toBe(359_241_000_000);
  });

  it("doesn't subtract per-share figures, which don't add up across quarters", () => {
    expect(value(quarterly, "income", "epsDiluted", "Q3 FY2026")).toBe(2.02);
    expect(value(quarterly, "income", "epsDiluted", "Q4 FY2025")).toBeNull();
  });

  it("works for other fiscal calendars", () => {
    const nvidia = statements(nvda, "quarterly");
    expect(value(nvidia, "income", "revenue", "Q2 FY2027")).toBe(96_221_000_000);
    expect(value(nvidia, "income", "revenue", "Q4 FY2026")).toBe(68_127_000_000);

    const bank = statements(jpm, "quarterly");
    expect(value(bank, "income", "netIncome", "Q4 FY2025")).toBe(13_025_000_000);
    expect(value(bank, "income", "revenue", "Q4 FY2025")).toBe(45_798_000_000);
    expect(value(bank, "cashFlow", "dividendsPaid", "Q2 FY2026")).toBe(4_342_000_000);
  });

  it("handles uneven fiscal quarters, like Costco's 12, 12, 12 and 16 weeks", () => {
    const facts = company("NetCashProvidedByUsedInOperatingActivities", [
      ["2024-09-02", "2024-11-24", 3, "q1", 2025, "Q1", "10-Q", "2024-12-20"],
      ["2024-09-02", "2025-02-16", 7, "q2", 2025, "Q2", "10-Q", "2025-03-14"],
      ["2024-09-02", "2025-05-11", 12, "q3", 2025, "Q3", "10-Q", "2025-06-05"],
      ["2024-09-02", "2025-08-31", 20, "fy", 2025, "FY", "10-K", "2025-10-08"],
    ]);
    const result = statements(facts, "quarterly");
    expect(value(result, "cashFlow", "operatingCashFlow", "Q3 FY2025")).toBe(5);
    expect(value(result, "cashFlow", "operatingCashFlow", "Q4 FY2025")).toBe(8);
  });

  it("leaves a quarter blank rather than guess when an earlier quarter is missing", () => {
    const facts = company("Revenues", [
      ["2024-04-01", "2024-09-30", 200, "q2", 2024, "Q2", "10-Q", "2024-11-01"],
      ["2024-01-01", "2024-12-31", 500, "fy", 2024, "FY", "10-K", "2025-02-01"],
    ]);
    const result = statements(facts, "quarterly");
    expect(value(result, "income", "revenue", "Q4 FY2024")).toBeNull();
  });
});

describe("which number wins", () => {
  it("takes the latest filing, so restatements apply", () => {
    const facts = company("Revenues", [
      ["2024-01-01", "2024-12-31", 100, "a", 2024, "FY", "10-K", "2025-02-01"],
      ["2024-01-01", "2024-12-31", 90, "b", 2025, "FY", "10-K", "2026-02-01"],
      ["2025-01-01", "2025-12-31", 120, "b", 2025, "FY", "10-K", "2026-02-01"],
    ]);
    expect(value(statements(facts, "annual"), "income", "revenue", "FY2024")).toBe(90);
  });

  it("falls back to another tag period by period, as companies change tags", () => {
    const old = company("SalesRevenueNet", [["2023-01-01", "2023-12-31", 80, "a", 2023, "FY", "10-K", "2024-02-01"]]);
    const current = company("Revenues", [["2024-01-01", "2024-12-31", 100, "b", 2024, "FY", "10-K", "2025-02-01"]]);
    const facts = { entityName: "Test Co", facts: { "us-gaap": { ...old.facts["us-gaap"], ...current.facts["us-gaap"] } } };
    const result = statements(facts, "annual");
    expect(value(result, "income", "revenue", "FY2024")).toBe(100);
    expect(value(result, "income", "revenue", "FY2023")).toBe(80);
  });

  it("reads cash flow from the continuing-operations tags, which AT&T moved to in 2026", () => {
    for (const [line, tag] of [
      ["investingCashFlow", "NetCashProvidedByUsedInInvestingActivitiesContinuingOperations"],
      ["financingCashFlow", "NetCashProvidedByUsedInFinancingActivitiesContinuingOperations"],
    ]) {
      const facts = company(tag, [["2026-01-01", "2026-03-31", -2, "q", 2026, "Q1", "10-Q", "2026-04-27"]]);
      expect(value(statements(facts, "quarterly"), "cashFlow", line, "Q1 FY2026")).toBe(-2);
    }
  });

  it("names a period from its own filing, not from a later filing's comparison column", () => {
    // A new holding company's first 10-Q: last year's quarter sits in it, tagged with this year's fy and fp.
    const facts = company("Revenues", [
      ["2025-04-01", "2025-06-30", 90, "q", 2026, "Q2", "10-Q", "2026-08-01"],
      ["2026-04-01", "2026-06-30", 100, "q", 2026, "Q2", "10-Q", "2026-08-01"],
    ]);
    const result = statements(facts, "quarterly");
    expect(result.periods).toEqual([{ end: "2026-06-30", label: "Q2 FY2026" }]);
  });
});

describe("what there's no statement for", () => {
  it("returns nothing for a filer with no US GAAP facts", () => {
    expect(toFinancials({ entityName: "TSMC", facts: {} }, "annual")).toBeNull();
  });

  it("returns nothing for a foreign filer's 20-F", () => {
    const facts = company("Revenues", [["2024-04-01", "2025-03-31", 100, "a", 2025, "FY", "20-F", "2025-06-01"]]);
    expect(toFinancials(facts, "annual")).toBeNull();
  });

  it("returns nothing when a company has quarters but no 10-K yet", () => {
    const facts = company("Revenues", [["2026-01-01", "2026-03-31", 100, "q", 2026, "Q1", "10-Q", "2026-05-01"]]);
    expect(toFinancials(facts, "annual")).toBeNull();
    expect(toFinancials(facts, "quarterly")).not.toBeNull();
  });
});

describe("how much it returns", () => {
  it("keeps one more year than a screen shows, for year-over-year growth", () => {
    const rows = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026].map(
      (year): [string, string, number, string, number, string, string, string] => [
        `${year}-01-01`,
        `${year}-12-31`,
        year,
        `a${year}`,
        year,
        "FY",
        "10-K",
        `${year + 1}-02-01`,
      ],
    );
    expect(statements(company("Revenues", rows), "annual").periods).toHaveLength(6);
  });
});

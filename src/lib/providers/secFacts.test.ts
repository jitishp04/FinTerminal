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

const COLUMN_TAGS = {
  basic: ["WeightedAverageNumberOfSharesOutstandingBasic", "shares"],
  diluted: ["WeightedAverageNumberOfDilutedSharesOutstanding", "shares"],
  basicAndDiluted: ["WeightedAverageNumberOfShareOutstandingBasicAndDiluted", "shares"],
  epsBasic: ["EarningsPerShareBasic", "USD/shares"],
  epsDiluted: ["EarningsPerShareDiluted", "USD/shares"],
  epsBasicAndDiluted: ["EarningsPerShareBasicAndDiluted", "USD/shares"],
  netIncome: ["NetIncomeLoss", "USD"],
} as const;

/** A year, or one of its first three quarters. Whatever a column leaves out isn't tagged. */
type Column = { year: number; quarter?: 1 | 2 | 3 } & Partial<Record<keyof typeof COLUMN_TAGS, number>>;

const QUARTER_MONTHS = { 1: ["01", "03"], 2: ["04", "06"], 3: ["07", "09"] };

/** A company from `{ filed: columns }`, where a filing's own period is its latest column. */
const filings = (reports: Record<string, Column[]>) => {
  const gaap: Record<string, { units: Record<string, Fact[]> }> = {};
  for (const [filed, columns] of Object.entries(reports)) {
    const fy = Math.max(...columns.map(({ year }) => year));
    for (const { year, quarter, ...values } of columns) {
      const [first, last] = quarter ? QUARTER_MONTHS[quarter] : ["01", "12"];
      const period = {
        start: `${year}-${first}-01`,
        end: `${year}-${last}-28`,
        accn: filed,
        fy,
        fp: quarter ? `Q${quarter}` : "FY",
        form: quarter ? "10-Q" : "10-K",
        filed,
      };
      for (const [field, val] of Object.entries(values)) {
        const [tag, unit] = COLUMN_TAGS[field as keyof typeof COLUMN_TAGS];
        gaap[tag] ??= { units: { [unit]: [] } };
        gaap[tag].units[unit].push({ ...period, val });
      }
    }
  }
  return { entityName: "Test Co", facts: { "us-gaap": gaap } };
};

/** A year with no dilution, whose net income is what its shares and EPS multiply to. */
const plainYear = (year: number, shares: number, eps: number): Column => ({
  year,
  basic: shares,
  diluted: shares,
  epsBasic: eps,
  epsDiluted: eps,
  netIncome: shares * eps,
});

const perShare = (facts: unknown, year: number) => {
  const annual = statements(facts, "annual");
  return {
    eps: value(annual, "income", "epsDiluted", `FY${year}`),
    shares: value(annual, "income", "sharesDiluted", `FY${year}`),
  };
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

  it("prefers the statement's own line to a component of it, as at Pfizer", () => {
    const total = company("OtherShortTermInvestments", [[undefined, "2025-12-31", 12, "a", 2025, "FY", "10-K", "2026-02-01"]]);
    const part = company("AvailableForSaleSecuritiesDebtSecuritiesCurrent", [[undefined, "2025-12-31", 9, "a", 2025, "FY", "10-K", "2026-02-01"]]);
    const sales = company("Revenues", [["2025-01-01", "2025-12-31", 100, "a", 2025, "FY", "10-K", "2026-02-01"]]);
    const facts = {
      entityName: "Test Co",
      facts: { "us-gaap": { ...part.facts["us-gaap"], ...total.facts["us-gaap"], ...sales.facts["us-gaap"] } },
    };
    expect(value(statements(facts, "annual"), "balance", "shortTermInvestments", "FY2025")).toBe(12);
  });

  it("reads total revenue ahead of contract revenue, which leaves out an insurer's premiums", () => {
    const contract = company("RevenueFromContractWithCustomerExcludingAssessedTax", [["2025-01-01", "2025-12-31", 247, "a", 2025, "FY", "10-K", "2026-02-01"]]);
    const total = company("Revenues", [["2025-01-01", "2025-12-31", 370, "a", 2025, "FY", "10-K", "2026-02-01"]]);
    const facts = { entityName: "Test Co", facts: { "us-gaap": { ...contract.facts["us-gaap"], ...total.facts["us-gaap"] } } };
    expect(value(statements(facts, "annual"), "income", "revenue", "FY2025")).toBe(370);
  });

  it("doesn't pass general and admin costs off as selling, general and admin", () => {
    const admin = company("GeneralAndAdministrativeExpense", [["2025-01-01", "2025-12-31", 5, "a", 2025, "FY", "10-K", "2026-02-01"]]);
    const sales = company("Revenues", [["2025-01-01", "2025-12-31", 100, "a", 2025, "FY", "10-K", "2026-02-01"]]);
    const facts = { entityName: "Test Co", facts: { "us-gaap": { ...admin.facts["us-gaap"], ...sales.facts["us-gaap"] } } };
    expect(value(statements(facts, "annual"), "income", "sellingGeneralAdministrative", "FY2025")).toBeNull();
  });

  it("leaves a line blank rather than fill it with something narrower, as with Microsoft's depreciation", () => {
    const depreciation = company("Depreciation", [["2025-07-01", "2026-06-30", 34, "a", 2026, "FY", "10-K", "2026-07-30"]]);
    const sales = company("Revenues", [["2025-07-01", "2026-06-30", 100, "a", 2026, "FY", "10-K", "2026-07-30"]]);
    const facts = { entityName: "Test Co", facts: { "us-gaap": { ...depreciation.facts["us-gaap"], ...sales.facts["us-gaap"] } } };
    expect(value(statements(facts, "annual"), "cashFlow", "depreciation", "FY2026")).toBeNull();
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

describe("stock splits", () => {
  describe("NVIDIA, which split 4-for-1 in 2021 and 10-for-1 in 2024", () => {
    const annual = statements(nvda, "annual");

    it("restates a year no filing after the split reported", () => {
      expect(value(annual, "income", "epsDiluted", "FY2022")).toBeCloseTo(0.385, 6);
      expect(value(annual, "income", "sharesDiluted", "FY2022")).toBe(25_350_000_000);
    });

    it("applies only the splits after a year's latest filing", () => {
      expect(value(annual, "income", "epsDiluted", "FY2021")).toBeCloseTo(0.173, 6);
      expect(value(annual, "income", "sharesDiluted", "FY2021")).toBe(25_100_000_000);
    });

    it("leaves years the company already restated", () => {
      expect(value(annual, "income", "epsDiluted", "FY2023")).toBe(0.17);
      expect(value(annual, "income", "sharesDiluted", "FY2023")).toBe(25_070_000_000);
      expect(value(annual, "income", "epsDiluted", "FY2026")).toBe(4.9);
      expect(value(annual, "income", "sharesDiluted", "FY2026")).toBe(24_514_000_000);
    });

    it("leaves a quarter first filed before the split once a later filing restates it", () => {
      expect(value(statements(nvda, "quarterly"), "income", "epsDiluted", "Q1 FY2025")).toBe(0.6);
    });

    it("doesn't touch dollar lines", () => {
      expect(value(annual, "income", "netIncome", "FY2022")).toBe(9_752_000_000);
      expect(value(annual, "income", "netIncome", "FY2021")).toBe(4_332_000_000);
    });
  });

  it("restates quarters the same way", () => {
    const facts = filings({
      "2023-05-01": [{ ...plainYear(2023, 100, 5), quarter: 1 }],
      "2023-08-01": [{ ...plainYear(2023, 100, 6), quarter: 2 }],
      "2024-05-01": [{ ...plainYear(2023, 200, 2.5), quarter: 1 }, { ...plainYear(2024, 200, 3), quarter: 1 }],
    });
    const quarterly = statements(facts, "quarterly");
    expect(value(quarterly, "income", "epsDiluted", "Q2 FY2023")).toBe(3);
    expect(value(quarterly, "income", "sharesDiluted", "Q2 FY2023")).toBe(200);
    expect(value(quarterly, "income", "epsDiluted", "Q1 FY2023")).toBe(2.5);
  });

  it("handles a split that isn't a whole number, like 3-for-2", () => {
    const facts = filings({
      "2022-02-01": [plainYear(2020, 300, 1.5), plainYear(2021, 300, 3)],
      "2023-02-01": [plainYear(2021, 300, 3), plainYear(2022, 300, 4)],
      "2024-02-01": [plainYear(2022, 450, 2.67), plainYear(2023, 450, 3)],
    });
    expect(perShare(facts, 2021)).toEqual({ eps: 2, shares: 450 });
    expect(perShare(facts, 2022)).toEqual({ eps: 2.67, shares: 450 });
    expect(perShare(facts, 2023)).toEqual({ eps: 3, shares: 450 });
  });

  it("handles a reverse split, as at GE in 2021", () => {
    const facts = filings({
      "2020-02-01": [plainYear(2018, 8000, 0.75), plainYear(2019, 8000, 0.25)],
      "2021-02-01": [plainYear(2019, 8000, 0.25), plainYear(2020, 8000, 0.5)],
      "2022-02-01": [plainYear(2020, 1000, 4), plainYear(2021, 1000, 6)],
    });
    expect(perShare(facts, 2019)).toEqual({ eps: 2, shares: 1000 });
    expect(perShare(facts, 2020)).toEqual({ eps: 4, shares: 1000 });
  });

  it("leaves a merger's jump in shares alone, even at a split-like ratio", () => {
    const facts = filings({
      "2022-02-01": [plainYear(2020, 100, 4), plainYear(2021, 100, 5)],
      "2023-02-01": [plainYear(2021, 100, 5), plainYear(2022, 100, 6)],
      "2024-02-01": [plainYear(2022, 100, 6), plainYear(2023, 150, 5)],
      "2025-02-01": [plainYear(2023, 150, 5), plainYear(2024, 150, 6)],
    });
    expect(perShare(facts, 2021)).toEqual({ eps: 5, shares: 100 });
    expect(perShare(facts, 2022)).toEqual({ eps: 6, shares: 100 });
    expect(perShare(facts, 2023)).toEqual({ eps: 5, shares: 150 });
  });

  it("doesn't mistake a filing's share count in the wrong scale for a split, as at ConocoPhillips", () => {
    const earlier = (shares: Column) => ({
      "2022-02-01": [{ ...shares, year: 2021 }],
      "2023-02-01": [{ ...shares, year: 2021 }, { ...shares, year: 2022 }],
    });
    const wrongScale = { basic: 1_000_000_000, diluted: 1_000_000_000 };

    const withEps = plainYear(0, 1_000_000, 5);
    const taggingEps = filings({
      ...earlier(withEps),
      "2024-02-01": [{ ...withEps, ...wrongScale, year: 2022 }, { ...withEps, year: 2023 }],
    });
    expect(perShare(taggingEps, 2021).shares).toBe(1_000_000);

    const countsOnly = { year: 0, basic: 1_000_000, diluted: 1_000_000 };
    const notTaggingEps = filings({
      ...earlier(countsOnly),
      "2024-02-01": [{ ...wrongScale, year: 2022 }, { ...countsOnly, year: 2023 }],
    });
    expect(perShare(notTaggingEps, 2021).shares).toBe(1_000_000);
  });

  it("doesn't take a split's size from counts that were in the wrong scale, as at Agenus", () => {
    // A 1-for-20: the old counts are in thousands, which makes it look like 50-for-1. Only EPS shows which way it went.
    const inThousands = (year: number, eps: number): Column => ({
      year,
      basic: 400_000,
      diluted: 400_000,
      epsBasic: eps,
      epsDiluted: eps,
    });
    const facts = filings({
      "2022-02-01": [inThousands(2021, 2)],
      "2023-02-01": [inThousands(2021, 2), inThousands(2022, 1)],
      "2024-02-01": [plainYear(2022, 20_000_000, 20), plainYear(2023, 20_000_000, 15)],
    });
    expect(perShare(facts, 2021)).toEqual({ eps: 2, shares: 400_000 });

    // A small EPS can't show a split, but it can still rule one out.
    const smallEps = filings({
      "2022-02-01": [inThousands(2021, 0.2)],
      "2023-02-01": [inThousands(2021, 0.2), inThousands(2022, 0.2)],
      "2024-02-01": [plainYear(2022, 20_000_000, 4), plainYear(2023, 20_000_000, 3)],
    });
    expect(perShare(smallEps, 2021)).toEqual({ eps: 0.2, shares: 400_000 });
  });

  it("doesn't read a split into a reverse merger's history in the wrong scale, as at EchoStar", () => {
    const facts = filings({
      "2022-02-01": [plainYear(2021, 90_000_000, 2)],
      "2023-02-01": [plainYear(2021, 90_000_000, 2), plainYear(2022, 90_000_000, 0.1)],
      "2024-02-01": [
        { year: 2022, basic: 290_000, diluted: 290_000, epsBasic: -0.5, epsDiluted: -0.5, netIncome: -145_000_000 },
        plainYear(2023, 290_000_000, 1),
      ],
    });
    expect(perShare(facts, 2021)).toEqual({ eps: 2, shares: 90_000_000 });
  });

  it("doesn't mistake an accounting change to diluted shares for a split, as at AT&T", () => {
    const facts = filings({
      "2022-02-01": [{ year: 2021, basic: 100, diluted: 120, epsBasic: 5, epsDiluted: 4.2, netIncome: 500 }],
      "2023-02-01": [
        { year: 2021, basic: 100, diluted: 120, epsBasic: 5, epsDiluted: 4.2, netIncome: 500 },
        { year: 2022, basic: 100, diluted: 120, epsBasic: 6, epsDiluted: 5, netIncome: 600 },
      ],
      "2024-02-01": [
        { year: 2022, basic: 100, diluted: 150, epsBasic: 6, epsDiluted: 4, netIncome: 600 },
        { year: 2023, basic: 100, diluted: 150, epsBasic: 7, epsDiluted: 4.67, netIncome: 700 },
      ],
    });
    expect(perShare(facts, 2021)).toEqual({ eps: 4.2, shares: 120 });
  });

  it("doesn't read a split into EPS in the wrong scale, from a table with no share counts, as at Brown & Brown", () => {
    const facts = filings({
      "2022-02-01": [plainYear(2021, 100, 4)],
      "2023-02-01": [plainYear(2021, 100, 4), plainYear(2022, 100, 5)],
      "2024-02-01": [
        { year: 2022, epsBasic: 0.05, epsDiluted: 0.05, netIncome: 500 },
        plainYear(2023, 100, 6),
      ],
    });
    expect(perShare(facts, 2021)).toEqual({ eps: 4, shares: 100 });
  });

  it("doesn't read a split into EPS that a merger's accounting replaced, as at EchoStar", () => {
    const facts = filings({
      "2022-02-01": [{ year: 2021, epsBasic: 2, epsDiluted: 2, netIncome: 200 }],
      "2023-02-01": [
        { year: 2021, epsBasic: 2, epsDiluted: 2, netIncome: 200 },
        { year: 2022, epsBasic: 1, epsDiluted: 1, netIncome: 100 },
      ],
      "2024-02-01": [
        { year: 2022, epsBasic: 3, epsDiluted: 3, netIncome: 1500 },
        { year: 2023, epsBasic: 4, epsDiluted: 4, netIncome: 2000 },
      ],
    });
    expect(perShare(facts, 2021).eps).toBe(2);
  });

  it("doesn't read a split into a cent's rounding on a tiny EPS, as at Intuit", () => {
    const facts = filings({
      "2022-02-01": [{ year: 2021, epsBasic: 0.02, epsDiluted: 0.02, netIncome: 200 }],
      "2023-02-01": [
        { year: 2021, epsBasic: 0.02, epsDiluted: 0.02, netIncome: 200 },
        { year: 2022, epsBasic: 0.02, epsDiluted: 0.02, netIncome: 200 },
      ],
      "2024-02-01": [
        { year: 2022, epsBasic: 0.01, epsDiluted: 0.01, netIncome: 200 },
        { year: 2023, epsBasic: 0.01, epsDiluted: 0.01, netIncome: 100 },
      ],
    });
    expect(perShare(facts, 2021).eps).toBe(0.02);
  });

  it("doesn't read a split into EPS restated for other reasons, with no share counts to go on, as at Targa", () => {
    const facts = filings({
      "2022-02-01": [{ year: 2021, epsBasic: 6, epsDiluted: 6, netIncome: 600 }],
      "2023-02-01": [
        { year: 2021, epsBasic: 6, epsDiluted: 6, netIncome: 600 },
        { year: 2022, epsBasic: 6, epsDiluted: 6, netIncome: 600 },
      ],
      "2024-02-01": [
        { year: 2022, epsBasic: 5, epsDiluted: 5, netIncome: 600 },
        { year: 2023, epsBasic: 5, epsDiluted: 5, netIncome: 600 },
      ],
    });
    expect(perShare(facts, 2021).eps).toBe(6);
  });

  it("sees past a 10-K table with no share counts to the filing that restated them, as at Amphenol", () => {
    const facts = filings({
      "2020-02-01": [plainYear(2019, 100, 3)],
      "2021-02-01": [plainYear(2020, 100, 4)],
      "2021-03-01": [{ year: 2020, epsBasic: 4, epsDiluted: 4, netIncome: 400 }],
      "2022-02-01": [plainYear(2020, 200, 2), plainYear(2021, 200, 3)],
    });
    expect(perShare(facts, 2019)).toEqual({ eps: 1.5, shares: 200 });
  });

  it("counts two splits once each when a year's restatement spans both, as at Copart", () => {
    const facts = filings({
      "2019-02-01": [plainYear(2018, 100, 12)],
      "2020-02-01": [plainYear(2019, 100, 8)],
      "2021-02-01": [plainYear(2020, 100, 4)],
      "2022-02-01": [plainYear(2019, 200, 4), plainYear(2021, 200, 3)],
      "2023-02-01": [plainYear(2020, 400, 1), plainYear(2021, 400, 1.5), plainYear(2022, 400, 2)],
    });
    expect(perShare(facts, 2018)).toEqual({ eps: 3, shares: 400 });
    expect(perShare(facts, 2019)).toEqual({ eps: 2, shares: 400 });
    expect(perShare(facts, 2020)).toEqual({ eps: 1, shares: 400 });
  });

  it("finds a split from EPS and net income when no share count is tagged, as at Alphabet", () => {
    const facts = filings({
      "2021-02-01": [{ year: 2020, epsBasic: 41, epsDiluted: 40, netIncome: 40_000 }],
      "2022-02-01": [
        { year: 2020, epsBasic: 41, epsDiluted: 40, netIncome: 40_000 },
        { year: 2021, epsBasic: 61, epsDiluted: 60, netIncome: 60_000 },
      ],
      "2023-02-01": [
        { year: 2021, epsBasic: 3.05, epsDiluted: 3, netIncome: 60_000 },
        { year: 2022, epsBasic: 2.55, epsDiluted: 2.5, netIncome: 50_000 },
      ],
    });
    expect(perShare(facts, 2020).eps).toBe(2);
  });

  it("finds a split from basic and diluted counts when EPS isn't tagged, as at Monster", () => {
    const facts = filings({
      "2022-02-01": [{ year: 2021, basic: 1000, diluted: 1010 }],
      "2023-02-01": [{ year: 2021, basic: 1000, diluted: 1010 }, { year: 2022, basic: 1000, diluted: 1010 }],
      "2024-02-01": [{ year: 2022, basic: 2000, diluted: 2020 }, { year: 2023, basic: 2000, diluted: 2020 }],
    });
    expect(perShare(facts, 2021).shares).toBe(2020);
  });

  it("goes by the basic count when the same filing also restates income and dilution, as at DexCom", () => {
    const facts = filings({
      "2021-02-01": [{ year: 2020, basic: 100, diluted: 104, epsBasic: 3, epsDiluted: 2.88, netIncome: 300 }],
      "2022-02-01": [
        { year: 2020, basic: 100, diluted: 104, epsBasic: 3, epsDiluted: 2.88, netIncome: 300 },
        { year: 2021, basic: 100, diluted: 104, epsBasic: 5, epsDiluted: 4.81, netIncome: 500 },
      ],
      "2023-02-01": [
        { year: 2021, basic: 400, diluted: 430, epsBasic: 1.55, epsDiluted: 1.44, netIncome: 620 },
        { year: 2022, basic: 400, diluted: 430, epsBasic: 2, epsDiluted: 1.86, netIncome: 800 },
      ],
    });
    expect(perShare(facts, 2020)).toEqual({ eps: 0.72, shares: 416 });
  });

  it("follows a period across a change of tags, as at Palo Alto Networks", () => {
    const facts = filings({
      "2021-02-01": [{ year: 2020, basicAndDiluted: 100, epsBasicAndDiluted: -1.5, netIncome: -150 }],
      "2022-02-01": [
        { year: 2020, basicAndDiluted: 100, epsBasicAndDiluted: -1.5, netIncome: -150 },
        { year: 2021, basicAndDiluted: 100, epsBasicAndDiluted: -2, netIncome: -200 },
      ],
      "2023-02-01": [
        { year: 2021, basic: 300, diluted: 300, epsBasic: -0.67, epsDiluted: -0.67, netIncome: -200 },
        plainYear(2022, 300, 1),
      ],
    });
    expect(perShare(facts, 2020)).toEqual({ eps: -0.5, shares: 300 });
  });
});

describe("fiscal periods, whatever a filing's cover page says", () => {
  const labels = (facts: unknown, period: "annual" | "quarterly") =>
    statements(facts, period).periods.map(({ label }) => label);

  // Its 10-K for 2021 says 2020, and its 10-Q for the third quarter says Q2.
  const honeywell = company("NetCashProvidedByUsedInOperatingActivities", [
    ["2020-01-01", "2020-12-31", 6_208_000_000, "0000773840-21-000015", 2020, "FY", "10-K", "2021-02-12"],
    ["2021-01-01", "2021-03-31", 978_000_000, "0000773840-21-000032", 2021, "Q1", "10-Q", "2021-04-23"],
    ["2021-01-01", "2021-06-30", 2_256_000_000, "0000773840-21-000057", 2021, "Q2", "10-Q", "2021-07-23"],
    ["2021-01-01", "2021-09-30", 3_375_000_000, "0000773840-21-000065", 2021, "Q2", "10-Q", "2021-10-22"],
    ["2021-01-01", "2021-12-31", 6_038_000_000, "0000773840-22-000018", 2020, "FY", "10-K", "2022-02-11"],
    ["2022-01-01", "2022-03-31", 36_000_000, "0000773840-22-000037", 2022, "Q1", "10-Q", "2022-04-29"],
    ["2022-01-01", "2022-06-30", 825_000_000, "0000773840-22-000054", 2022, "Q2", "10-Q", "2022-07-28"],
    ["2022-01-01", "2022-09-30", 2_908_000_000, "0000773840-22-000071", 2022, "Q3", "10-Q", "2022-10-27"],
    ["2022-01-01", "2022-12-31", 5_274_000_000, "0000773840-23-000013", 2022, "FY", "10-K", "2023-02-10"],
  ]);

  // Its 10-Ks for 2021 and 2022 both say 2020, and three 10-Qs are a year behind.
  const berkley = company("Revenues", [
    ["2020-01-01", "2020-12-31", 8_098_925_000, "0000011544-21-000013", 2020, "FY", "10-K", "2021-02-18"],
    ["2021-01-01", "2021-03-31", 2_156_869_000, "0000011544-21-000018", 2021, "Q1", "10-Q", "2021-05-05"],
    ["2021-04-01", "2021-06-30", 2_296_086_000, "0000011544-21-000046", 2021, "Q2", "10-Q", "2021-08-02"],
    ["2021-07-01", "2021-09-30", 2_424_283_000, "0000011544-21-000078", 2021, "Q3", "10-Q", "2021-11-04"],
    ["2021-01-01", "2021-12-31", 9_455_466_000, "0000011544-22-000007", 2020, "FY", "10-K", "2022-02-24"],
    ["2022-01-01", "2022-03-31", 2_915_409_000, "0000011544-22-000016", 2021, "Q1", "10-Q", "2022-05-03"],
    ["2022-04-01", "2022-06-30", 2_512_887_000, "0000011544-22-000027", 2021, "Q2", "10-Q", "2022-08-02"],
    ["2022-07-01", "2022-09-30", 2_724_400_000, "0000011544-22-000032", 2022, "Q3", "10-Q", "2022-11-04"],
    ["2022-01-01", "2022-12-31", 11_166_499_000, "0000011544-23-000004", 2020, "FY", "10-K", "2023-02-24"],
    ["2023-01-01", "2023-03-31", 2_895_004_000, "0000011544-23-000008", 2022, "Q1", "10-Q", "2023-05-04"],
    ["2023-04-01", "2023-06-30", 2_995_914_000, "0000011544-23-000018", 2023, "Q2", "10-Q", "2023-08-03"],
    ["2023-07-01", "2023-09-30", 3_030_638_000, "0000011544-23-000023", 2023, "Q3", "10-Q", "2023-11-03"],
    ["2023-01-01", "2023-12-31", 12_142_938_000, "0000011544-24-000005", 2023, "FY", "10-K", "2024-02-23"],
  ]);

  it("names a year correctly when its 10-K's cover page gives the one before, as at Honeywell", () => {
    expect(labels(honeywell, "annual")).toEqual(["FY2022", "FY2021", "FY2020"]);
    expect(value(statements(honeywell, "annual"), "cashFlow", "operatingCashFlow", "FY2021")).toBe(6_038_000_000);
  });

  it("names a quarter correctly when its 10-Q's cover page gives the one before, as at Honeywell", () => {
    const result = statements(honeywell, "quarterly");
    expect(result.periods.find(({ end }) => end === "2021-09-30")?.label).toBe("Q3 FY2021");
    expect(result.periods.find(({ end }) => end === "2021-12-31")?.label).toBe("Q4 FY2021");
  });

  it("works out quarters from year-to-date totals across a stale cover page", () => {
    const result = statements(honeywell, "quarterly");
    expect(value(result, "cashFlow", "operatingCashFlow", "Q3 FY2021")).toBe(1_119_000_000);
    expect(value(result, "cashFlow", "operatingCashFlow", "Q4 FY2021")).toBe(2_663_000_000);
  });

  it("names years correctly when several cover pages in a row are stale, as at W. R. Berkley", () => {
    expect(labels(berkley, "annual")).toEqual(["FY2023", "FY2022", "FY2021", "FY2020"]);
    expect(labels(berkley, "quarterly")).toEqual([
      "Q4 FY2023",
      "Q3 FY2023",
      "Q2 FY2023",
      "Q1 FY2023",
      "Q4 FY2022",
      "Q3 FY2022",
      "Q2 FY2022",
      "Q1 FY2022",
      "Q4 FY2021",
      "Q3 FY2021",
      "Q2 FY2021",
      "Q1 FY2021",
    ]);
  });

  it("keeps a year together when one of its 10-Qs is a year behind, so Q4 can be worked out", () => {
    expect(value(statements(berkley, "quarterly"), "income", "revenue", "Q4 FY2023")).toBe(3_221_382_000);
  });

  it("names a year correctly when the newest cover page is the stale one, as at Salesforce", () => {
    const facts = company("NetCashProvidedByUsedInOperatingActivities", [
      ["2024-02-01", "2025-01-31", 13_092_000_000, "0001108524-25-000006", 2025, "FY", "10-K", "2025-03-05"],
      ["2025-02-01", "2025-04-30", 6_476_000_000, "0001108524-25-000030", 2026, "Q1", "10-Q", "2025-05-29"],
      ["2025-02-01", "2025-07-31", 7_216_000_000, "0001108524-25-000088", 2026, "Q2", "10-Q", "2025-09-04"],
      ["2025-02-01", "2025-10-31", 9_532_000_000, "0001108524-25-000238", 2026, "Q3", "10-Q", "2025-12-04"],
      ["2025-02-01", "2026-01-31", 14_996_000_000, "0001108524-26-000060", 2025, "FY", "10-K", "2026-03-02"],
      ["2026-02-01", "2026-04-30", 6_701_000_000, "0001108524-26-000127", 2027, "Q1", "10-Q", "2026-05-28"],
      ["2026-02-01", "2026-07-31", 7_970_000_000, "0001108524-26-000190", 2027, "Q2", "10-Q", "2026-08-27"],
    ]);
    expect(labels(facts, "annual")).toEqual(["FY2026", "FY2025"]);
    expect(labels(facts, "quarterly").slice(0, 3)).toEqual(["Q2 FY2027", "Q1 FY2027", "Q4 FY2026"]);
  });

  it("names a year correctly when its cover page runs ahead, as at Seagate", () => {
    const facts = company("NetCashProvidedByUsedInOperatingActivities", [
      ["2023-07-01", "2024-06-28", 918_000_000, "0001137789-24-000068", 2024, "FY", "10-K", "2024-08-02"],
      ["2024-06-29", "2024-09-27", 95_000_000, "0001137789-24-000182", 2025, "Q1", "10-Q", "2024-10-25"],
      ["2024-06-29", "2024-12-27", 316_000_000, "0001137789-25-000020", 2025, "Q2", "10-Q", "2025-01-24"],
      ["2024-06-29", "2025-03-28", 575_000_000, "0001137789-25-000075", 2025, "Q3", "10-Q", "2025-05-02"],
      ["2024-06-29", "2025-06-27", 1_083_000_000, "0001137789-25-000157", 2027, "FY", "10-K", "2025-08-01"],
      ["2025-06-28", "2025-10-03", 532_000_000, "0001137789-25-000317", 2026, "Q1", "10-Q", "2025-10-31"],
      ["2025-06-28", "2026-01-02", 1_255_000_000, "0001137789-26-000026", 2026, "Q2", "10-Q", "2026-01-30"],
      ["2025-06-28", "2026-04-03", 2_369_000_000, "0001137789-26-000088", 2026, "Q3", "10-Q", "2026-04-29"],
      ["2025-06-28", "2026-07-03", 3_674_000_000, "0001137789-26-000159", 2026, "FY", "10-K", "2026-08-04"],
    ]);
    expect(labels(facts, "annual")).toEqual(["FY2026", "FY2025", "FY2024"]);
  });

  it("trusts 10-Qs over 10-Ks that stayed a year behind, as at CrowdStrike", () => {
    const facts = company("NetCashProvidedByUsedInOperatingActivities", [
      ["2023-02-01", "2024-01-31", 1_166_207_000, "0001535527-24-000007", 2023, "FY", "10-K", "2024-03-07"],
      ["2024-02-01", "2024-04-30", 383_228_000, "0001535527-24-000013", 2025, "Q1", "10-Q", "2024-06-05"],
      ["2024-02-01", "2024-07-31", 709_869_000, "0001535527-24-000020", 2025, "Q2", "10-Q", "2024-08-29"],
      ["2024-02-01", "2024-10-31", 1_036_005_000, "0001535527-24-000026", 2025, "Q3", "10-Q", "2024-11-27"],
      ["2024-02-01", "2025-01-31", 1_381_727_000, "0001535527-25-000009", 2024, "FY", "10-K", "2025-03-10"],
      ["2025-02-01", "2025-04-30", 384_107_000, "0001535527-25-000019", 2025, "Q1", "10-Q", "2025-06-04"],
      ["2025-02-01", "2025-07-31", 716_939_000, "0001535527-25-000025", 2026, "Q2", "10-Q", "2025-08-28"],
      ["2025-02-01", "2025-10-31", 1_114_480_000, "0001535527-25-000033", 2026, "Q3", "10-Q", "2025-12-03"],
      ["2025-02-01", "2026-01-31", 1_612_349_000, "0001535527-26-000010", 2026, "FY", "10-K", "2026-03-05"],
    ]);
    expect(labels(facts, "annual")).toEqual(["FY2026", "FY2025", "FY2024"]);
  });

  it("doesn't count a 10-Q tagged FY as a year, as at Disney", () => {
    const facts = company("Revenues", [
      ["2020-10-04", "2021-10-02", 67_418_000_000, "0001744489-21-000220", 2021, "FY", "10-K", "2021-11-24"],
      ["2021-10-03", "2022-01-01", 21_819_000_000, "0001744489-22-000059", 2022, "FY", "10-Q", "2022-02-09"],
      ["2022-01-02", "2022-04-02", 19_249_000_000, "0001744489-22-000100", 2022, "FY", "10-Q", "2022-05-11"],
      ["2022-04-03", "2022-07-02", 21_504_000_000, "0001744489-22-000161", 2022, "FY", "10-Q", "2022-08-10"],
      ["2021-10-03", "2022-10-01", 82_722_000_000, "0001744489-22-000213", 2022, "FY", "10-K", "2022-11-29"],
    ]);
    expect(labels(facts, "annual")).toEqual(["FY2022", "FY2021"]);
    const quarterly = statements(facts, "quarterly");
    expect(quarterly.periods.map(({ label }) => label)).toEqual([
      "Q4 FY2022",
      "Q3 FY2022",
      "Q2 FY2022",
      "Q1 FY2022",
      "Q4 FY2021",
    ]);
    expect(value(quarterly, "income", "revenue", "Q2 FY2022")).toBe(19_249_000_000);
  });

  it("counts a 10-K tagged Q4 as a year, as at Mastercard", () => {
    const facts = company("NetCashProvidedByUsedInOperatingActivities", [
      ["2017-01-01", "2017-12-31", 5_555_000_000, "0001141391-18-000009", 2017, "Q4", "10-K", "2018-02-14"],
      ["2018-01-01", "2018-03-31", 1_035_000_000, "0001141391-18-000056", 2018, "Q1", "10-Q", "2018-05-02"],
      ["2018-01-01", "2018-12-31", 6_223_000_000, "0001141391-19-000013", 2018, "Q4", "10-K", "2019-02-13"],
    ]);
    expect(labels(facts, "annual")).toEqual(["FY2018", "FY2017"]);
  });

  it("keeps a company's own numbering where a year is named for when it began, as at Target", () => {
    const facts = company("NetCashProvidedByUsedInOperatingActivities", [
      ["2023-01-29", "2024-02-03", 8_621_000_000, "0000027419-24-000032", 2023, "FY", "10-K", "2024-03-13"],
      ["2024-02-04", "2025-02-01", 7_367_000_000, "0000027419-25-000018", 2024, "FY", "10-K", "2025-03-12"],
      ["2025-02-02", "2025-05-03", 275_000_000, "0000027419-25-000101", 2025, "Q1", "10-Q", "2025-05-30"],
      ["2025-02-02", "2026-01-31", 6_562_000_000, "0000027419-26-000016", 2025, "FY", "10-K", "2026-03-11"],
    ]);
    expect(labels(facts, "annual")).toEqual(["FY2025", "FY2024", "FY2023"]);
    expect(labels(facts, "quarterly")[1]).toBe("Q1 FY2025");
  });

  it("goes by how a company numbers its years now, as TJX's older cover pages count differently", () => {
    const older = Array.from({ length: 13 }, (_, i) => 2009 + i).map(
      (year): [string, string, number, string, number, string, string, string] => [
        `${year - 1}-02-01`,
        `${year}-01-30`,
        1,
        `k${year}`,
        year - 1,
        "FY",
        "10-K",
        `${year}-03-30`,
      ],
    );
    const recent = (
      [
        ["2023-04-29", 2024, "Q1", "10-Q"],
        ["2023-07-29", 2024, "Q2", "10-Q"],
        ["2023-10-28", 2024, "Q3", "10-Q"],
        ["2024-02-03", 2024, "FY", "10-K"],
        ["2024-05-04", 2025, "Q1", "10-Q"],
        ["2024-08-03", 2025, "Q2", "10-Q"],
        ["2024-11-02", 2025, "Q3", "10-Q"],
        ["2025-02-01", 2025, "FY", "10-K"],
        ["2025-05-03", 2026, "Q1", "10-Q"],
        ["2025-08-02", 2026, "Q2", "10-Q"],
        ["2025-11-01", 2026, "Q3", "10-Q"],
        ["2026-01-31", 2026, "FY", "10-K"],
      ] as const
    ).map(([end, fy, fp, form]): [string, string, number, string, number, string, string, string] => [
      `${end.slice(0, 4)}-01-01`,
      end,
      1,
      end,
      fy,
      fp,
      form,
      end,
    ]);
    const result = statements(company("Revenues", [...older, ...recent]), "annual");
    expect(result.periods[0]).toEqual({ end: "2026-01-31", label: "FY2026" });
    expect(result.periods.find(({ end }) => end === "2021-01-30")?.label).toBe("FY2021");
  });

  it("names a 52-week year for the year it covers, though it ends just into January, as at J&J", () => {
    const facts = company("NetCashProvidedByUsedInOperatingActivities", [
      ["2021-01-04", "2022-01-02", 23_410_000_000, "0000200406-22-000022", 2021, "FY", "10-K", "2022-02-17"],
      ["2022-01-03", "2023-01-01", 21_194_000_000, "0000200406-23-000016", 2022, "FY", "10-K", "2023-02-16"],
      ["2023-01-02", "2023-12-31", 22_791_000_000, "0000200406-24-000013", 2023, "FY", "10-K", "2024-02-16"],
      ["2024-01-01", "2024-12-29", 24_266_000_000, "0000200406-25-000038", 2024, "FY", "10-K", "2025-02-13"],
    ]);
    expect(labels(facts, "annual")).toEqual(["FY2024", "FY2023", "FY2022", "FY2021"]);
  });

  it("keeps the years either side of a changed year-end, as when Royal Gold moved to December", () => {
    const facts = company("NetCashProvidedByUsedInOperatingActivities", [
      ["2019-07-01", "2020-06-30", 340_752_000, "0001558370-20-009452", 2020, "FY", "10-K", "2020-08-06"],
      ["2020-07-01", "2021-06-30", 407_151_000, "0001558370-21-011343", 2021, "FY", "10-K", "2021-08-12"],
      ["2021-07-01", "2021-12-31", 248_783_000, "0001104659-22-024443", 2021, "FY", "10-KT", "2022-02-17"],
      ["2022-01-01", "2022-12-31", 417_345_000, "0001558370-23-001391", 2022, "FY", "10-K", "2023-02-16"],
    ]);
    expect(statements(facts, "annual").periods).toEqual([
      { end: "2022-12-31", label: "FY2022" },
      { end: "2021-12-31", label: "FY2021" },
      { end: "2021-06-30", label: "FY2021" },
      { end: "2020-06-30", label: "FY2020" },
    ]);
  });

  it("ignores a period that ends after its filing was filed, as at Morningstar", () => {
    const facts = company("ProfitLoss", [
      ["2020-07-01", "2020-09-30", 76_200_000, "0001289419-20-000218", 2020, "Q3", "10-Q", "2020-10-30"],
      ["2020-01-01", "2020-09-30", 148_300_000, "0001289419-20-000218", 2020, "Q3", "10-Q", "2020-10-30"],
      ["2020-10-01", "2020-12-31", 76_200_000, "0001289419-20-000218", 2020, "Q3", "10-Q", "2020-10-30"],
      ["2020-01-01", "2020-12-31", 223_600_000, "0001289419-21-000039", 2020, "FY", "10-K", "2021-02-26"],
    ]);
    expect(statements(facts, "quarterly").periods).toEqual([
      { end: "2020-12-31", label: "Q4 FY2020" },
      { end: "2020-09-30", label: "Q3 FY2020" },
    ]);
  });

  it("numbers quarters back from the year-end when a company moved it with no transition report", () => {
    // DevvStream: a December year-end, then its next 10-K closing in July.
    const facts = company("NetCashProvidedByUsedInOperatingActivities", [
      ["2023-01-01", "2023-12-31", -3_110_339, "0001140361-24-018430", 2023, "FY", "10-K", "2024-04-08"],
      ["2024-01-01", "2024-03-31", -360_545, "0001140361-24-026931", 2024, "Q1", "10-Q", "2024-05-21"],
      ["2024-01-01", "2024-06-30", -1_246_234, "0001140361-24-037795", 2024, "Q2", "10-Q", "2024-08-19"],
      ["2024-01-01", "2024-09-30", -1_488_222, "0001140361-25-001804", 2024, "Q3", "10-Q", "2025-01-23"],
      ["2024-08-01", "2025-01-31", -4_051_780, "0001140361-25-014173", 2025, "Q2", "10-Q", "2025-04-16"],
      ["2024-08-01", "2025-04-30", -4_763_601, "0001140361-25-023390", 2025, "Q3", "10-Q", "2025-06-23"],
      ["2024-08-01", "2025-07-31", -6_429_905, "0001140361-25-040617", 2025, "FY", "10-K", "2025-11-06"],
    ]);
    expect(labels(facts, "quarterly")).toEqual([
      "Q4 FY2025",
      "Q3 FY2025",
      "Q2 FY2025",
      "Q3 FY2024",
      "Q2 FY2024",
      "Q1 FY2024",
      "Q4 FY2023",
    ]);
  });

  it("keeps working out quarters across a moved year-end, as when Meridian went from October to December", () => {
    const facts = company("NetCashProvidedByUsedInOperatingActivities", [
      ["2022-11-01", "2023-10-31", 2_206_367, "0001477932-24-000230", 2023, "FY", "10-K", "2024-01-17"],
      ["2023-11-01", "2024-01-31", 8_175, "0001477932-24-001197", 2024, "Q1", "10-Q", "2024-03-14"],
      ["2024-01-01", "2024-06-30", 2_553_394, "0001477932-24-004695", 2024, "Q2", "10-Q", "2024-08-13"],
      ["2024-01-01", "2024-09-30", 7_317_099, "0001477932-24-007000", 2024, "Q3", "10-Q", "2024-11-12"],
      ["2024-01-01", "2024-12-31", 23_916_426, "0001477932-25-001897", 2024, "FY", "10-K", "2025-03-24"],
    ]);
    const result = statements(facts, "quarterly");
    expect(result.periods.map(({ label }) => label)).toEqual([
      "Q4 FY2024",
      "Q3 FY2024",
      "Q2 FY2024",
      "Q1 FY2024",
      "Q4 FY2023",
    ]);
    expect(value(result, "cashFlow", "operatingCashFlow", "Q3 FY2024")).toBe(4_763_705);
    expect(value(result, "cashFlow", "operatingCashFlow", "Q4 FY2024")).toBe(16_599_327);
  });

  it("treats a short period just after a year-end as the next year's, not as a year, as at Aimco", () => {
    // Aimco's last period before liquidation accounting: January 2026 alone.
    const facts = company("Revenues", [
      ["2025-01-01", "2025-12-31", 138_486_000, "0001193125-26-085547", 2025, "FY", "10-K", "2026-03-02"],
      ["2026-01-01", "2026-01-31", 6_159_000, "0001193125-26-216904", 2026, "Q1", "10-Q", "2026-05-11"],
    ]);
    expect(labels(facts, "annual")).toEqual(["FY2025"]);
    expect(labels(facts, "quarterly")).toEqual(["Q1 FY2026", "Q4 FY2025"]);
  });

  it("numbers quarters in a transition period as filed, as when Ferguson moved to December", () => {
    const facts = company("NetCashProvidedByUsedInOperatingActivities", [
      ["2024-08-01", "2025-04-30", 1_367_000_000, "0002011641-25-000015", 2025, "Q3", "10-Q", "2025-06-03"],
      ["2024-08-01", "2025-07-31", 1_908_000_000, "0002011641-25-000027", 2025, "FY", "10-K", "2025-09-26"],
      ["2025-08-01", "2025-10-31", 430_000_000, "0002011641-25-000059", 2026, "Q1", "10-Q", "2025-12-09"],
      ["2025-08-01", "2025-12-31", 859_000_000, "0002011641-26-000006", 2025, "FY", "10-KT", "2026-02-27"],
      ["2026-01-01", "2026-03-31", 772_000_000, "0002011641-26-000030", 2026, "Q1", "10-Q", "2026-05-05"],
    ]);
    const labelAt = (end: string) => statements(facts, "quarterly").periods.find((period) => period.end === end)?.label;
    expect(labelAt("2025-04-30")).toBe("Q3 FY2025");
    expect(labelAt("2025-10-31")).toBe("Q1 FY2026");
    expect(labelAt("2026-03-31")).toBe("Q1 FY2026");
  });

  it("doesn't take an amended 10-K's stray period for a year-end, as at RBC Bearings", () => {
    const facts = company("Revenues", [
      ["2021-04-04", "2022-04-02", 942_937_000, "0001213900-22-029810", 2022, "FY", "10-K", "2022-05-26"],
      ["2021-05-01", "2022-04-30", 942_937_000, "0001213900-22-045106", 2022, "FY", "10-K/A", "2022-08-05"],
      ["2022-04-03", "2022-07-02", 354_080_000, "0001213900-22-045107", 2023, "Q1", "10-Q", "2022-08-05"],
    ]);
    expect(statements(facts, "annual").periods).toEqual([{ end: "2022-04-02", label: "FY2022" }]);
  });

  it("lets 10-Ks outvote 10-Qs that give the calendar year, as at ADM Tronics", () => {
    const facts = company("NetCashProvidedByUsedInOperatingActivities", [
      ["2023-04-01", "2023-06-30", -252_744, "0001437749-23-023696", 2023, "Q2", "10-Q", "2023-08-14"],
      ["2023-04-01", "2023-09-30", -455_621, "0001437749-23-032043", 2023, "Q2", "10-Q", "2023-11-14"],
      ["2023-04-01", "2023-12-31", -495_137, "0001437749-24-004723", 2023, "Q3", "10-Q", "2024-02-20"],
      ["2023-04-01", "2024-03-31", -709_889, "0001437749-24-022742", 2024, "FY", "10-K", "2024-07-15"],
      ["2024-04-01", "2024-06-30", -59_146, "0001437749-24-027173", 2025, "Q1", "10-Q", "2024-08-19"],
      ["2024-04-01", "2024-09-30", -437_911, "0001437749-24-035247", 2024, "Q2", "10-Q", "2024-11-14"],
      ["2024-04-01", "2024-12-31", -510_933, "0001437749-25-004018", 2024, "Q3", "10-Q", "2025-02-14"],
      ["2024-04-01", "2025-03-31", 9_978, "0001437749-25-022670", 2025, "FY", "10-K", "2025-07-14"],
      ["2025-04-01", "2025-06-30", -14_800, "0001437749-25-027354", 2025, "Q1", "10-Q", "2025-08-19"],
      ["2025-04-01", "2025-09-30", -63_282, "0001437749-25-035161", 2025, "Q2", "10-Q", "2025-11-14"],
      ["2025-04-01", "2025-12-31", -82_815, "0001437749-26-004097", 2026, "Q3", "10-Q", "2026-02-13"],
      ["2025-04-01", "2026-03-31", -124_059, "0001437749-26-023316", 2026, "FY", "10-K", "2026-07-10"],
      ["2026-04-01", "2026-06-30", -32_959, "0001437749-26-028556", 2026, "Q1", "10-Q", "2026-08-19"],
    ]);
    expect(labels(facts, "annual")).toEqual(["FY2026", "FY2025", "FY2024"]);
  });

  it("goes with the earlier filing on a tie, since a stale cover page copies an earlier one", () => {
    const facts = company("NetCashProvidedByUsedInOperatingActivities", [
      ["2024-02-01", "2025-01-31", 13_092_000_000, "0001108524-25-000006", 2025, "FY", "10-K", "2025-03-05"],
      ["2025-02-01", "2026-01-31", 14_996_000_000, "0001108524-26-000060", 2025, "FY", "10-K", "2026-03-02"],
    ]);
    expect(labels(facts, "annual")).toEqual(["FY2026", "FY2025"]);
  });

  it("still reads a company whose only annual reports are amendments, as with Seafarer's", () => {
    const facts = company("NetCashProvidedByUsedInOperatingActivities", [
      ["2024-01-01", "2024-12-31", -2_868_920, "0001199835-25-000113", 2024, "FY", "10-K/A", "2025-04-09"],
      ["2025-01-01", "2025-12-31", -2_015_223, "0001199835-26-000091", 2025, "FY", "10-K/A", "2026-04-06"],
    ]);
    expect(labels(facts, "annual")).toEqual(["FY2025", "FY2024"]);
  });

  it("goes by the calendar when no filing gives a year", () => {
    const facts = company("Revenues", [["2024-01-01", "2024-12-31", 100, "a", 2024, "FY", "10-K", "2025-02-01"]]);
    for (const fact of facts.facts["us-gaap"].Revenues.units.USD) (fact as Fact).fy = null;
    expect(labels(facts, "annual")).toEqual(["FY2024"]);
  });

  it("counts back to quarters from before a company's first 10-K, as with Arq's in 2013", () => {
    const facts = company("NetCashProvidedByUsedInOperatingActivities", [
      ["2013-01-01", "2013-06-30", 11_832_000, "0001564590-13-000293", 2013, "Q2", "10-Q", "2013-08-09"],
      ["2013-01-01", "2013-09-30", 25_996_000, "0001564590-13-001262", 2013, "Q3", "10-Q", "2013-11-12"],
      ["2014-01-01", "2014-12-31", -42_549_000, "0001515156-16-000064", 2014, "FY", "10-K", "2016-02-29"],
    ]);
    expect(labels(facts, "quarterly")).toEqual(["Q4 FY2014", "Q3 FY2013", "Q2 FY2013"]);
  });

  it("carries on past a year with no 10-K in the data, as with S&P Global's for 2024", () => {
    const facts = company("NetCashProvidedByUsedInOperatingActivities", [
      ["2023-01-01", "2023-12-31", 3_710_000_000, "0000064040-24-000071", 2023, "FY", "10-K", "2024-02-09"],
      ["2024-01-01", "2024-03-31", 948_000_000, "0000064040-24-000125", 2024, "Q1", "10-Q", "2024-04-25"],
      ["2024-01-01", "2024-06-30", 2_504_000_000, "0000064040-24-000150", 2024, "Q2", "10-Q", "2024-07-30"],
      ["2024-01-01", "2024-09-30", 3_949_000_000, "0000064040-24-000178", 2024, "Q3", "10-Q", "2024-10-25"],
      ["2025-01-01", "2025-03-31", 953_000_000, "0000064040-25-000126", 2025, "Q1", "10-Q", "2025-04-29"],
    ]);
    expect(labels(facts, "quarterly")).toEqual([
      "Q1 FY2025",
      "Q3 FY2024",
      "Q2 FY2024",
      "Q1 FY2024",
      "Q4 FY2023",
    ]);
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

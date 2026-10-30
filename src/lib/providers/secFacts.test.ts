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
  profit: ["ProfitLoss", "USD"],
  commonIncome: ["NetIncomeLossAvailableToCommonStockholdersBasic", "USD"],
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

describe("share counts in the wrong scale", () => {
  const quarterlyShares = (facts: unknown, label: string) =>
    value(statements(facts, "quarterly"), "income", "sharesDiluted", label);

  it("restores a count tagged in millions, as at McDonald's", () => {
    // $8,469M of income at $11.56 a share is 732.6M shares, and the 10-K tags 732.3.
    const facts = filings({
      "2023-02-24": [
        { year: 2021, basic: 746_300_000, diluted: 751_800_000, epsBasic: 10.11, epsDiluted: 10.04, netIncome: 7_545_200_000 },
        { year: 2022, basic: 736_500_000, diluted: 741_300_000, epsBasic: 8.39, epsDiluted: 8.33, netIncome: 6_177_400_000 },
      ],
      "2024-02-22": [
        { year: 2022, basic: 736.5, diluted: 741.3, epsBasic: 8.39, epsDiluted: 8.33, netIncome: 6_177_400_000 },
        { year: 2023, basic: 727.9, diluted: 732.3, epsBasic: 11.63, epsDiluted: 11.56, netIncome: 8_468_800_000 },
      ],
      "2025-02-25": [
        { year: 2023, basic: 727.9, diluted: 732.3, epsBasic: 11.63, epsDiluted: 11.56, netIncome: 8_469_000_000 },
        { year: 2024, basic: 718.3, diluted: 721.9, epsBasic: 11.45, epsDiluted: 11.39, netIncome: 8_223_000_000 },
      ],
    });
    expect(perShare(facts, 2024)).toEqual({ eps: 11.39, shares: 721_900_000 });
    expect(perShare(facts, 2023)).toEqual({ eps: 11.56, shares: 732_300_000 });
    expect(perShare(facts, 2022)).toEqual({ eps: 8.33, shares: 741_300_000 });
    expect(value(statements(facts, "annual"), "income", "netIncome", "FY2024")).toBe(8_223_000_000);
  });

  it("restores a count tagged in thousands, though preferred dividends keep it from matching income, as at Digital Realty", () => {
    // $356.4M at $1.00 is 356M shares against the 262.5M filed in full a year before: only $263M went to common shares.
    const facts = filings({
      "2021-03-01": [{ year: 2020, basic: 260_098_978, diluted: 262_522_508, epsBasic: 1.01, epsDiluted: 1, netIncome: 356_398_000 }],
      "2022-02-25": [
        { year: 2020, basic: 260_098_978, diluted: 262_522_508, epsBasic: 1.01, epsDiluted: 1, netIncome: 356_398_000 },
        { year: 2021, basic: 282_474_927, diluted: 283_221_968, epsBasic: 5.95, epsDiluted: 5.94, netIncome: 1_709_259_000 },
      ],
      "2023-02-27": [
        { year: 2020, basic: 260_099, diluted: 262_523, epsBasic: 1.01, epsDiluted: 1, netIncome: 356_398_000 },
        { year: 2021, basic: 282_475, diluted: 283_222, epsBasic: 5.95, epsDiluted: 5.94, netIncome: 1_709_259_000 },
        { year: 2022, basic: 286_334, diluted: 297_919, epsBasic: 1.18, epsDiluted: 1.11, netIncome: 377_684_000 },
      ],
    });
    expect(perShare(facts, 2020).shares).toBe(262_523_000);
    expect(perShare(facts, 2021).shares).toBe(283_222_000);
    expect(perShare(facts, 2022).shares).toBe(297_919_000);
  });

  it("takes out three zeros too many, as at Waters", () => {
    const facts = filings({
      "2025-05-06": [
        { year: 2025, quarter: 1, basic: 59_439_000, diluted: 59_711_000, epsBasic: 2.04, epsDiluted: 2.03, netIncome: 121_381_000 },
      ],
      "2026-05-12": [
        { year: 2025, quarter: 1, basic: 59_439_000_000, diluted: 59_711_000_000, epsBasic: 2.04, epsDiluted: 2.03, netIncome: 121_000_000 },
        { year: 2026, quarter: 1, basic: 82_139_000_000, diluted: 82_139_000_000, epsBasic: -0.87, epsDiluted: -0.87, netIncome: -72_000_000 },
      ],
    });
    expect(quarterlyShares(facts, "Q1 FY2025")).toBe(59_711_000);
    expect(quarterlyShares(facts, "Q1 FY2026")).toBe(82_139_000);
  });

  it("goes by the diluted count, as Entergy's basic count beside it can be in another scale", () => {
    const facts = filings({
      "2010-05-07": [
        { year: 2010, quarter: 1, basic: 189_202_684, diluted: 191_283_703, epsBasic: 1.13, epsDiluted: 1.12, netIncome: 213_799_000 },
      ],
      "2011-05-09": [
        { year: 2010, quarter: 1, basic: 189_202_684_000, diluted: 191_283_703, epsBasic: 1.13, epsDiluted: 1.12, netIncome: 213_799_000 },
        { year: 2011, quarter: 1, basic: 178_834_342_000, diluted: 180_083_830_000, epsBasic: 1.39, epsDiluted: 1.38, netIncome: 248_663_000 },
      ],
    });
    expect(quarterlyShares(facts, "Q1 FY2010")).toBe(191_283_703);
    expect(quarterlyShares(facts, "Q1 FY2011")).toBe(180_083_830);
  });

  it("puts a count right and then applies a split to it, as at W. R. Berkley", () => {
    // The 3-for-2 of 2024 reached the filings in 2025, and FY2021 was last filed before it.
    const facts = filings({
      "2022-02-24": [{ year: 2021, basic: 184_953, diluted: 186_499, epsBasic: 5.53, epsDiluted: 5.48, netIncome: 1_022_490_000 }],
      "2023-02-24": [
        { year: 2021, basic: 277_430, diluted: 279_749, epsBasic: 3.69, epsDiluted: 3.66, netIncome: 1_022_490_000 },
        { year: 2022, basic: 276_852, diluted: 279_461, epsBasic: 4.99, epsDiluted: 4.94, netIncome: 1_381_062_000 },
      ],
      "2024-02-23": [
        { year: 2021, basic: 277_430, diluted: 279_749, epsBasic: 3.69, epsDiluted: 3.66, netIncome: 1_022_490_000 },
        { year: 2022, basic: 276_852, diluted: 279_461, epsBasic: 4.99, epsDiluted: 4.94, netIncome: 1_381_062_000 },
        { year: 2023, basic: 271_000, diluted: 273_298, epsBasic: 5.1, epsDiluted: 5.05, netIncome: 1_381_359_000 },
      ],
      "2025-02-24": [
        { year: 2022, basic: 415_278, diluted: 419_192, epsBasic: 3.33, epsDiluted: 3.29, netIncome: 1_381_062_000 },
        { year: 2023, basic: 406_500, diluted: 409_948, epsBasic: 3.4, epsDiluted: 3.37, netIncome: 1_381_359_000 },
        { year: 2024, basic: 399_734, diluted: 403_224, epsBasic: 4.39, epsDiluted: 4.36, netIncome: 1_756_115_000 },
      ],
      "2026-02-27": [
        { year: 2023, basic: 406_500_000, diluted: 409_948_000, epsBasic: 3.4, epsDiluted: 3.37, netIncome: 1_381_359_000 },
        { year: 2024, basic: 399_734_000, diluted: 403_224_000, epsBasic: 4.39, epsDiluted: 4.36, netIncome: 1_756_115_000 },
        { year: 2025, basic: 396_968_000, diluted: 399_861_000, epsBasic: 4.48, epsDiluted: 4.45, netIncome: 1_779_403_000 },
      ],
    });
    expect(perShare(facts, 2022)).toEqual({ eps: 3.29, shares: 419_192_000 });
    expect(perShare(facts, 2021).shares).toBe(419_623_500);
    expect(perShare(facts, 2021).eps).toBeCloseTo(2.44, 6);
  });

  it("puts counts right without finding a split from them, as at Agenus", () => {
    // Its 1-for-20 of 2024 stays unadjusted: splits go by counts as filed, as merged histories can pass for one once in scale.
    const facts = filings({
      "2022-03-01": [{ year: 2021, basic: 228_919, diluted: 228_919, epsBasic: -0.11, epsDiluted: -0.11, profit: -28_724_000 }],
      "2023-03-16": [
        { year: 2021, basic: 228_919, diluted: 228_919, epsBasic: -0.11, epsDiluted: -0.11, profit: -28_724_000 },
        { year: 2022, basic: 281_743, diluted: 281_743, epsBasic: -0.78, epsDiluted: -0.78, profit: -230_656_000 },
      ],
      "2024-03-14": [
        { year: 2022, basic: 281_743, diluted: 281_743, epsBasic: -0.78, epsDiluted: -0.78, profit: -230_655_670 },
        { year: 2023, basic: 357_889, diluted: 357_889, epsBasic: -0.69, epsDiluted: -0.69, profit: -257_437_042 },
      ],
      "2025-03-17": [
        { year: 2022, basic: 14_087_000, diluted: 14_087_000, epsBasic: -15.64, epsDiluted: -15.64, profit: -230_656_000 },
        { year: 2023, basic: 17_894_000, diluted: 17_894_000, epsBasic: -13.75, epsDiluted: -13.75, profit: -257_437_000 },
        { year: 2024, basic: 21_473_000, diluted: 21_473_000, epsBasic: -10.59, epsDiluted: -10.59, profit: -232_271_000 },
      ],
    });
    expect(perShare(facts, 2021)).toEqual({ eps: -0.11, shares: 228_919_000 });
    expect(perShare(facts, 2022)).toEqual({ eps: -15.64, shares: 14_087_000 });
  });

  it("doesn't take a merger's recast history for a split once its counts are in scale, as at EchoStar", () => {
    const facts = filings({
      "2022-02-01": [{ year: 2021, basicAndDiluted: 90_000_000, epsBasicAndDiluted: 2, netIncome: 180_000_000 }],
      "2023-02-01": [
        { year: 2021, basicAndDiluted: 90_000_000, epsBasicAndDiluted: 2, netIncome: 180_000_000 },
        { year: 2022, basicAndDiluted: 90_000_000, epsBasicAndDiluted: 0.1, netIncome: 9_000_000 },
      ],
      "2024-02-01": [
        { year: 2022, basicAndDiluted: 290_000, epsBasicAndDiluted: -0.5, netIncome: -145_000_000 },
        { year: 2023, basicAndDiluted: 290_000_000, epsBasicAndDiluted: 1, netIncome: 290_000_000 },
      ],
    });
    expect(perShare(facts, 2022)).toEqual({ eps: -0.5, shares: 290_000_000 });
    expect(perShare(facts, 2021)).toEqual({ eps: 2, shares: 90_000_000 });
  });

  it("uses income for common shares where a filing tags no other, as at Celldex", () => {
    // $112.3M lost at $2.40 a share is 46.8M shares, and the 10-K tags 46,888.
    const facts = filings({
      "2023-02-28": [{ year: 2022, basic: 46_888, diluted: 46_888, epsBasic: -2.4, epsDiluted: -2.4, commonIncome: -112_325_000 }],
      "2026-02-25": [{ year: 2023, basic: 48_449_000, diluted: 48_449_000, epsBasic: -2.92, epsDiluted: -2.92, netIncome: -141_429_000 }],
    });
    expect(perShare(facts, 2022).shares).toBe(46_888_000);
  });

  it("gives whole shares, as a count in millions doesn't always multiply out exactly, as at Dollar Tree", () => {
    const facts = filings({
      "2011-03-17": [{ year: 2009, basic: 134_100_000, diluted: 135_000_000, epsBasic: 2.39, epsDiluted: 2.37, netIncome: 320_500_000 }],
      "2011-05-19": [{ year: 2010, quarter: 1, basic: 129.3, diluted: 130.3, epsBasic: 0.49, epsDiluted: 0.49, netIncome: 63_600_000 }],
    });
    expect(quarterlyShares(facts, "Q1 FY2010")).toBe(130_300_000);
  });

  it("doesn't scale up a wrong number that isn't a scale error, as at Fifth Third", () => {
    // This tag holds only the 6M dilutive shares. Times 1,000 would be 6B, where income over EPS says 1.1B.
    const facts = filings({
      "2010-11-08": [{ year: 2010, quarter: 3, basic: 791_000_000, diluted: 797_000_000, epsBasic: 0.22, epsDiluted: 0.22, netIncome: 238_000_000 }],
      "2011-11-09": [{ year: 2010, quarter: 3, basic: 791_000_000, diluted: 6_000_000, epsBasic: 0.22, epsDiluted: 0.22, netIncome: 238_000_000 }],
    });
    expect(quarterlyShares(facts, "Q3 FY2010")).toBe(6_000_000);
  });

  it("leaves a right count alone when EPS is what's in the wrong scale, as at Halliburton", () => {
    // EPS of $0.26 tagged as 260,000, so income over EPS alone would say 873 shares.
    const facts = filings({
      "2020-07-24": [
        { year: 2020, quarter: 2, basic: 877_000_000, diluted: 877_000_000, epsBasicAndDiluted: -1.91, netIncome: -1_676_000_000 },
      ],
      "2021-07-23": [
        { year: 2020, quarter: 2, basic: 877_000_000, diluted: 877_000_000, epsBasicAndDiluted: -1_910_000, netIncome: -1_676_000_000 },
        { year: 2021, quarter: 2, basic: 890_000_000, diluted: 890_000_000, epsBasicAndDiluted: 260_000, netIncome: 227_000_000 },
      ],
    });
    expect(quarterlyShares(facts, "Q2 FY2020")).toBe(877_000_000);
    expect(quarterlyShares(facts, "Q2 FY2021")).toBe(890_000_000);
  });

  it("goes by the counts nearest in time, as a company can really grow a thousandfold", () => {
    const facts = filings({
      "2011-02-01": [plainYear(2010, 1_000_000, 2)],
      "2025-02-01": [plainYear(2024, 1_000_000_000, 2)],
      "2026-02-01": [{ ...plainYear(2025, 1_000_000_000, 2), epsBasic: 2000, epsDiluted: 2000 }],
    });
    expect(perShare(facts, 2025).shares).toBe(1_000_000_000);
  });

  it("leaves a count that doesn't clearly fit as filed, as at Huntington", () => {
    // Preferred dividends took two thirds of this quarter's income, so income over EPS says 2.2B shares, not 719M.
    const facts = filings({
      "2011-02-18": [{ year: 2009, basic: 532_802_000, diluted: 532_802_000, epsBasic: -6.14, epsDiluted: -6.14, netIncome: -3_094_179_000 }],
      "2010-08-09": [{ year: 2010, quarter: 2, basic: 716_450, diluted: 718_990, epsBasic: 0.04, epsDiluted: 0.04, netIncome: 88_501_000 }],
    });
    expect(quarterlyShares(facts, "Q2 FY2010")).toBe(718_990);
  });

  it("leaves a count as filed when no other count shows the right scale, as at Hershey", () => {
    const facts = filings({
      "2009-08-13": [{ year: 2009, quarter: 2, basic: 166_817, diluted: 228_396, epsBasic: 0.66, epsDiluted: 0.64, netIncome: 147_192_000 }],
    });
    expect(quarterlyShares(facts, "Q2 FY2009")).toBe(228_396);
  });

  describe("companies whose EPS and income legitimately differ", () => {
    it("leaves an Up-C company, whose EPS covers one share class, as at Interactive Brokers", () => {
      // $4,357M is the whole group's income. EPS of $2.22 on 444M shares is the $984M left for Class A.
      const facts = filings({
        "2026-02-27": [{ year: 2025, basic: 440_931_909, diluted: 443_859_546, epsBasic: 2.23, epsDiluted: 2.22, profit: 4_357_000_000 }],
      });
      expect(perShare(facts, 2025)).toEqual({ eps: 2.22, shares: 443_859_546 });
    });

    it("leaves Up-C diluted counts that assume an exchange of units, as at Rocket and TKO", () => {
      // Rocket's diluted count is 15 times its basic count, and 19 times income over EPS.
      const rocket = filings({
        "2024-02-27": [{ year: 2023, basic: 128_641_762, diluted: 1_980_523_690, epsBasic: -0.12, epsDiluted: -0.15, netIncome: -15_514_000 }],
      });
      expect(perShare(rocket, 2023)).toEqual({ eps: -0.15, shares: 1_980_523_690 });

      const tko = filings({
        "2025-02-26": [{ year: 2024, basic: 81_340_472, diluted: 171_874_540, epsBasic: 0.12, epsDiluted: 0.02, netIncome: 9_408_000 }],
      });
      expect(perShare(tko, 2024)).toEqual({ eps: 0.02, shares: 171_874_540 });
    });

    it("leaves a company with preferred stock, as at Coherent and Celsius", () => {
      // Preferred dividends turn Coherent's $49M of income into a loss per share.
      const coherent = filings({
        "2026-08-14": [{ year: 2025, basic: 154_755_000, diluted: 154_755_000, epsBasic: -0.52, epsDiluted: -0.52, netIncome: 49_364_000 }],
      });
      expect(perShare(coherent, 2025)).toEqual({ eps: -0.52, shares: 154_755_000 });

      const celsius = filings({
        "2026-03-02": [{ year: 2025, basic: 252_301_000, diluted: 254_911_000, epsBasic: 0.25, epsDiluted: 0.25, netIncome: 107_999_000 }],
      });
      expect(perShare(celsius, 2025)).toEqual({ eps: 0.25, shares: 254_911_000 });
    });
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

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

/** A year, or one of its quarters, on its own or `toDate`. Whatever a column leaves out isn't tagged. */
type Column = { year: number; quarter?: 1 | 2 | 3 | 4; toDate?: boolean } & Partial<Record<keyof typeof COLUMN_TAGS, number>>;

const QUARTER_MONTHS = { 1: ["01", "03"], 2: ["04", "06"], 3: ["07", "09"], 4: ["10", "12"] };

/** A company from `{ filed: columns }`, where a filing's own period is its latest column. */
const filings = (reports: Record<string, Column[]>) => {
  const gaap: Record<string, { units: Record<string, Fact[]> }> = {};
  for (const [filed, columns] of Object.entries(reports)) {
    const fy = Math.max(...columns.map(({ year }) => year));
    for (const { year, quarter, toDate, ...values } of columns) {
      const [first, last] = quarter ? QUARTER_MONTHS[quarter] : ["01", "12"];
      const period = {
        start: `${year}-${toDate ? "01" : first}-01`,
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

  describe("a filing that restates history without a split", () => {
    const quarterly = (facts: unknown, key: string, label: string) =>
      value(statements(facts, "quarterly"), "income", key, label);

    it("keeps a reverse merger's replaced history replaced for later filings, as at Dianthus", () => {
      // Magenta's history gave way to Dianthus's in 2023. Income moved 2.8 times for 2022's first nine months, but
      // only 1.8 times for 2023's first half, and that filing is no more a split than the first one was.
      const facts = filings({
        "2022-03-08": [{ year: 2021, basic: 54_948_808, diluted: 54_948_808, epsBasic: -1.29, epsDiluted: -1.29, netIncome: -71_136_000 }],
        "2022-11-03": [{ year: 2022, quarter: 3, toDate: true, basic: 58_963_280, diluted: 58_963_280, epsBasic: -0.95, epsDiluted: -0.95, netIncome: -56_284_000 }],
        "2023-03-23": [{ year: 2022, basic: 59_372_357, diluted: 59_372_357, epsBasic: -1.29, epsDiluted: -1.29, netIncome: -76_462_000 }],
        "2023-08-03": [{ year: 2023, quarter: 2, toDate: true, basic: 60_648_076, diluted: 60_648_076, epsBasic: -0.54, epsDiluted: -0.54, netIncome: -32_454_000 }],
        "2023-11-09": [
          { year: 2022, quarter: 3, toDate: true, basic: 874_138, diluted: 874_138, epsBasic: -21, epsDiluted: -21, netIncome: -18_360_000 },
          { year: 2023, quarter: 3, toDate: true, basic: 1_896_605, diluted: 1_896_605, epsBasic: -17.4, epsDiluted: -17.4, netIncome: -32_992_000 },
        ],
        "2024-03-21": [
          { year: 2022, basic: 874_234, diluted: 874_234, epsBasic: -32.57, epsDiluted: -32.57, netIncome: -28_476_000 },
          { year: 2023, basic: 5_153_423, diluted: 5_153_423, epsBasic: -8.45, epsDiluted: -8.45, netIncome: -43_555_000 },
        ],
        "2024-08-08": [
          { year: 2023, quarter: 2, toDate: true, basic: 874_805, diluted: 874_805, epsBasic: -20.84, epsDiluted: -20.84, netIncome: -18_229_000 },
          { year: 2024, quarter: 2, toDate: true, basic: 31_794_881, diluted: 31_794_881, epsBasic: -0.99, epsDiluted: -0.99, netIncome: -31_355_000 },
        ],
      });
      expect(perShare(facts, 2021)).toEqual({ eps: -1.29, shares: 54_948_808 });
      expect(perShare(facts, 2022)).toEqual({ eps: -32.57, shares: 874_234 });
    });

    it("doesn't take a merger for a split though income moved by less than double, as at Knight-Swift", () => {
      // Swift's history replaced Knight's at a ratio near 3 for 5, but 80,284,000 / 134,622,000 is 0.5964. One quarter's
      // income happens to match within 2%, and its ratio of 0.6022 doesn't land on a split either. FY2016 does land on one
      // in the next 10-K, at 80,362,000 / 134,139,000, but that comparison is across a history already replaced.
      const facts = filings({
        "2016-11-01": [
          { year: 2016, quarter: 3, toDate: true, basic: 134_622_000, diluted: 136_227_000, epsBasic: 0.73, epsDiluted: 0.73, netIncome: 98_825_000 },
          { year: 2016, quarter: 3, basic: 132_930_000, diluted: 134_462_000, epsBasic: 0.18, epsDiluted: 0.18, netIncome: 24_024_000 },
        ],
        "2017-02-17": [{ year: 2016, basic: 134_139_000, diluted: 135_494_000, epsBasic: 1.11, epsDiluted: 1.1, netIncome: 149_267_000 }],
        "2017-07-24": [{ year: 2017, quarter: 2, basic: 133_544_000, diluted: 134_507_000, epsBasic: 0.2, epsDiluted: 0.2, netIncome: 26_297_000 }],
        "2017-11-09": [
          { year: 2016, quarter: 3, toDate: true, basic: 80_284_000, diluted: 81_112_000, epsBasic: 0.89, epsDiluted: 0.88, netIncome: 71_702_000 },
          { year: 2016, quarter: 3, basic: 80_040_000, diluted: 80_949_000, epsBasic: 0.3, epsDiluted: 0.29, netIncome: 23_767_000 },
          { year: 2017, quarter: 3, basic: 102_846_000, diluted: 103_752_000, epsBasic: 0.04, epsDiluted: 0.04, netIncome: 3_881_000 },
        ],
        "2018-03-01": [
          { year: 2016, basic: 80_362_000, diluted: 81_228_000, epsBasic: 1.17, epsDiluted: 1.16, netIncome: 93_863_000 },
          { year: 2017, basic: 110_657_000, diluted: 111_697_000, epsBasic: 4.38, epsDiluted: 4.34, netIncome: 484_292_000 },
        ],
      });
      expect(quarterly(facts, "sharesDiluted", "Q2 FY2017")).toBe(134_507_000);
      expect(perShare(facts, 2016)).toEqual({ eps: 1.16, shares: 81_228_000 });
    });

    it("doesn't let income moved too far clear a filing that lands near a split, as at Keurig Dr Pepper", () => {
      // Keurig's history replaced Dr Pepper Snapple's. 790,500,000 / 182,700,000 is 4.327, within a fraction of 13 for 3, but
      // income fell from $568M to $235M. A quarter's income fell less, and at 4.358 it doesn't land on a split.
      const facts = filings({
        "2017-10-25": [
          { year: 2017, quarter: 3, toDate: true, basic: 182_700_000, diluted: 183_500_000, epsBasic: 3.11, epsDiluted: 3.09, netIncome: 568_000_000 },
          { year: 2017, quarter: 3, basic: 181_400_000, diluted: 182_100_000, epsBasic: 1.12, epsDiluted: 1.11, netIncome: 203_000_000 },
        ],
        "2018-02-14": [{ year: 2017, basic: 182_000_000, diluted: 182_800_000, epsBasic: 5.91, epsDiluted: 5.89, netIncome: 1_076_000_000 }],
        "2018-11-08": [
          { year: 2017, quarter: 3, toDate: true, basic: 790_500_000, diluted: 790_500_000, epsBasic: 0.3, epsDiluted: 0.29, netIncome: 235_000_000 },
          { year: 2017, quarter: 3, basic: 790_500_000, diluted: 790_500_000, epsBasic: 0.15, epsDiluted: 0.14, netIncome: 116_000_000 },
          { year: 2018, quarter: 3, basic: 1_361_800_000, diluted: 1_373_600_000, epsBasic: 0.11, epsDiluted: 0.11, netIncome: 148_000_000 },
        ],
      });
      expect(perShare(facts, 2017)).toEqual({ eps: 5.89, shares: 182_800_000 });
    });

    it("doesn't take income filed to a different rounding for income restated, as at AGNT", () => {
      // The 2-for-1 of 2021, at 2.017 times for FY2019 as weighted counts don't scale exactly. Income is the same $9.5M, filed
      // in whole dollars and then in thousands. Q3 2020 was last filed before it here: 75,653,407 times 2 is 151,306,814.
      const facts = filings({
        "2020-03-12": [{ year: 2019, basic: 62_585_555, diluted: 62_585_555, epsBasic: -0.15, epsDiluted: -0.15, netIncome: -9_527_714 }],
        "2020-11-09": [{ year: 2020, quarter: 3, basic: 69_256_733, diluted: 75_653_407, epsBasic: 0.22, epsDiluted: 0.2, netIncome: 14_970_000 }],
        "2021-03-11": [
          { year: 2019, basic: 126_256_407, diluted: 126_256_407, epsBasic: -0.08, epsDiluted: -0.08, netIncome: -9_528_000 },
          { year: 2020, basic: 138_572_358, diluted: 151_550_075, epsBasic: 0.22, epsDiluted: 0.21, netIncome: 31_131_000 },
        ],
      });
      expect(quarterly(facts, "sharesDiluted", "Q3 FY2020")).toBe(151_306_814);
      expect(perShare(facts, 2020)).toEqual({ eps: 0.21, shares: 151_550_075 });
    });

    it("doesn't let a period whose income changed sign clear a filing", () => {
      const facts = filings({
        "2021-02-01": [plainYear(2020, 100, 3)],
        "2022-02-01": [plainYear(2021, 100, 4)],
        "2023-02-01": [plainYear(2021, 200, -2), plainYear(2022, 200, 1)],
      });
      expect(perShare(facts, 2020)).toEqual({ eps: 3, shares: 100 });
    });

    it("doesn't take a shell's history replaced for a split, however exact, as at Ondas", () => {
      // 16,120,860 / 3,718,388 is 4.335, near enough 13 for 3, but the shell lost $31K to Ondas's $2.4M.
      const facts = filings({
        "2018-01-17": [
          { year: 2017, quarter: 3, toDate: true, basicAndDiluted: 3_718_388, netIncome: -30_920 },
          { year: 2017, quarter: 3, basicAndDiluted: 5_127_174 },
        ],
        "2018-03-28": [{ year: 2017, basicAndDiluted: 4_232_986, epsBasicAndDiluted: -0.01, netIncome: -44_663 }],
        "2018-11-13": [
          { year: 2017, quarter: 3, toDate: true, basicAndDiluted: 16_120_860, epsBasicAndDiluted: -0.15, netIncome: -2_407_167 },
          { year: 2017, quarter: 3, basicAndDiluted: 16_120_860, epsBasicAndDiluted: -0.06, netIncome: -1_036_433 },
          { year: 2018, quarter: 3, basicAndDiluted: 24_033_664, epsBasicAndDiluted: -0.02, netIncome: -447_532 },
        ],
      });
      expect(perShare(facts, 2017)).toEqual({ eps: -0.01, shares: 4_232_986 });
    });

    it("doesn't take a SPAC's merger for a split, whatever its round share counts land near, as at Cipher", () => {
      // 200,000,000 / 17,000,000 is 11.76, within 2% of 12, and with EPS of $0.00 there's nothing to rule it out.
      const facts = filings({
        "2021-05-07": [{ year: 2021, quarter: 1, basicAndDiluted: 15_720_926, epsBasicAndDiluted: 0, netIncome: -8_431_800 }],
        "2021-08-10": [{ year: 2021, quarter: 2, basicAndDiluted: 17_000_000, epsBasicAndDiluted: 0, netIncome: -1_043_472 }],
        "2022-08-09": [
          { year: 2021, quarter: 2, basic: 200_000_000, diluted: 200_000_000, epsBasic: 0, epsDiluted: 0, netIncome: -548_000 },
          { year: 2022, quarter: 2, basic: 247_730_410, diluted: 247_730_410, epsBasic: -0.12, epsDiluted: -0.12, netIncome: -29_219_000 },
        ],
      });
      expect(quarterly(facts, "sharesDiluted", "Q1 FY2021")).toBe(15_720_926);
    });

    it("counts income of nothing as moved, as a new SPAC's first quarter can be, as at Opendoor", () => {
      // The shell made nothing in its first quarter, and Opendoor lost $62M in the same one. 84,027,000 / 7,021,978 is near 12.
      const facts = filings({
        "2020-06-04": [{ year: 2020, quarter: 1, basicAndDiluted: 7_021_978, epsBasicAndDiluted: 0, netIncome: 0 }],
        "2020-08-13": [{ year: 2020, quarter: 2, basicAndDiluted: 11_111_082, epsBasicAndDiluted: -0.03, netIncome: -277_902 }],
        "2021-05-12": [
          { year: 2020, quarter: 1, basic: 84_027_000, diluted: 84_027_000, epsBasic: -0.74, epsDiluted: -0.74, profit: -62_196_000 },
          { year: 2021, quarter: 1, basic: 565_381_000, diluted: 565_381_000, epsBasic: -0.48, epsDiluted: -0.48, profit: -270_436_000 },
        ],
      });
      expect(quarterly(facts, "sharesDiluted", "Q2 FY2020")).toBe(11_111_082);
      expect(quarterly(facts, "epsDiluted", "Q2 FY2020")).toBe(-0.03);
    });

    it("still finds a real split soon after a merger replaced history, as at GeneDx", () => {
      // CM Life Sciences' history gave way to Sema4's in 2022, and income flipped. The 1-for-33 of 2023 is comparable from
      // the first filing after that: 244,368,743 / 33 is 7,405,113, and Q2 2022 wasn't restated in these filings.
      const facts = filings({
        "2021-05-24": [{ year: 2021, quarter: 1, basicAndDiluted: 11_068_750, epsBasicAndDiluted: -5.28, netIncome: -58_471_923 }],
        "2021-07-21": [{ year: 2021, quarter: 2, basicAndDiluted: 11_068_750, epsBasicAndDiluted: 1.18, netIncome: 13_009_880 }],
        "2022-05-12": [
          { year: 2021, quarter: 1, basic: 549_778, diluted: 549_778, epsBasic: -348.82, epsDiluted: -348.82, netIncome: -191_775_000 },
          { year: 2022, quarter: 1, basic: 244_368_743, diluted: 244_368_743, epsBasic: -0.31, epsDiluted: -0.31, netIncome: -76_896_000 },
        ],
        "2022-08-15": [
          { year: 2021, quarter: 2, basic: 1_100_734, diluted: 1_100_734, epsBasic: -41.94, epsDiluted: -41.94, netIncome: -46_161_000 },
          { year: 2022, quarter: 2, basic: 337_752_029, diluted: 337_752_029, epsBasic: -0.25, epsDiluted: -0.25, netIncome: -85_742_000 },
        ],
        "2023-05-09": [
          { year: 2022, quarter: 1, basic: 7_405_113, diluted: 7_405_113, epsBasic: -10.38, epsDiluted: -10.38, netIncome: -76_896_000 },
          { year: 2023, quarter: 1, basic: 20_061_945, diluted: 20_061_945, epsBasic: -3.04, epsDiluted: -3.04, netIncome: -60_989_000 },
        ],
      });
      expect(quarterly(facts, "sharesDiluted", "Q2 FY2022")).toBeCloseTo(337_752_029 / 33, 3);
      expect(quarterly(facts, "epsDiluted", "Q2 FY2022")).toBeCloseTo(-8.25, 6);
      expect(quarterly(facts, "sharesDiluted", "Q1 FY2022")).toBe(7_405_113);
    });

    it("dates a split after a merger from a filing with no count for its latest period, as at Option Care", () => {
      // Option Care's history replaced BioScrip's in 2019, and income flipped. The 1-for-4 of 2020 reached the 10-K of March,
      // whose latest period is a quarterly table with EPS and no count: 651,576,000 / 4 is 162,894,000 exactly.
      const facts = filings({
        "2018-11-06": [{ year: 2018, quarter: 3, basicAndDiluted: 127_528_000, epsBasicAndDiluted: -0.09, netIncome: -8_174_000 }],
        "2019-11-06": [
          { year: 2018, quarter: 3, basicAndDiluted: 570_455_000, epsBasicAndDiluted: 0, netIncome: 1_791_000 },
          { year: 2019, quarter: 3, basicAndDiluted: 651_576_000, epsBasicAndDiluted: -0.07, netIncome: -42_794_000 },
        ],
        "2020-03-05": [
          { year: 2019, basicAndDiluted: 156_280_000, epsBasicAndDiluted: -0.49, netIncome: -75_920_000 },
          { year: 2019, quarter: 4, epsBasicAndDiluted: -0.09, netIncome: -15_811_000 },
        ],
        "2020-05-07": [{ year: 2020, quarter: 1, basicAndDiluted: 176_661_000, epsBasicAndDiluted: -0.11, netIncome: -19_910_000 }],
        "2020-11-03": [
          { year: 2019, quarter: 3, basic: 162_894_000, diluted: 162_894_000, epsBasic: -0.26, epsDiluted: -0.26, netIncome: -42_794_000 },
          { year: 2020, quarter: 3, basic: 184_232_000, diluted: 184_822_000, epsBasic: 0.01, epsDiluted: 0.01, netIncome: 1_663_000 },
        ],
      });
      expect(perShare(facts, 2019)).toEqual({ eps: -0.49, shares: 156_280_000 });
      expect(quarterly(facts, "sharesDiluted", "Q1 FY2020")).toBe(176_661_000);
      expect(quarterly(facts, "sharesDiluted", "Q3 FY2019")).toBe(162_894_000);
    });

    it("finds a split though one period's income moved with it, as at Tenet", () => {
      // The 1-for-4 of 2012 lands exactly: 120,204,000 / 480,817,000 is 0.2500. The older filing tags income to common
      // shares and the newer one income before noncontrolling interests, $6M against $15M for a quarter, and that doesn't
      // undo it. The split then shows in the FY2012 10-K, where income matches. Q1 2012 was last filed before it here.
      const facts = filings({
        "2011-11-01": [
          { year: 2011, quarter: 3, toDate: true, basic: 480_817_000, diluted: 497_862_000, epsBasic: 0.28, epsDiluted: 0.27, netIncome: 134_000_000 },
          { year: 2011, quarter: 3, basic: 468_753_000, diluted: 483_632_000, epsBasic: 0.02, epsDiluted: 0.02, netIncome: 6_000_000 },
        ],
        "2012-02-28": [{ year: 2011, basic: 468_726_000, diluted: 485_181_000, epsBasic: 0.12, epsDiluted: 0.12, profit: 94_000_000 }],
        "2012-05-08": [{ year: 2012, quarter: 1, basic: 411_373_000, diluted: 484_873_000, epsBasic: 0.14, epsDiluted: 0.13, profit: 67_000_000 }],
        "2012-11-07": [
          { year: 2011, quarter: 3, toDate: true, basic: 120_204_000, diluted: 124_466_000, epsBasic: 1.11, epsDiluted: 1.08, profit: 160_000_000 },
          { year: 2011, quarter: 3, basic: 117_188_000, diluted: 120_908_000, epsBasic: 0.05, epsDiluted: 0.05, profit: 15_000_000 },
          { year: 2012, quarter: 3, basic: 104_244_000, diluted: 107_311_000, epsBasic: 0.38, epsDiluted: 0.37, profit: 32_000_000 },
        ],
        "2013-02-26": [
          { year: 2011, basic: 117_182_000, diluted: 121_295_000, epsBasic: 0.49, epsDiluted: 0.48, profit: 94_000_000 },
          { year: 2012, basic: 104_200_000, diluted: 108_926_000, epsBasic: 1.35, epsDiluted: 1.3, profit: 133_000_000 },
        ],
      });
      expect(quarterly(facts, "sharesDiluted", "Q1 FY2012")).toBe(121_218_250);
      expect(quarterly(facts, "epsDiluted", "Q1 FY2012")).toBeCloseTo(0.52, 6);
      expect(quarterly(facts, "sharesDiluted", "Q3 FY2012")).toBe(107_311_000);
    });
  });

  describe("when a split reached the filings", () => {
    const quarterly = (facts: unknown, key: string, label: string) =>
      value(statements(facts, "quarterly"), "income", key, label);

    it("dates a split by the first filing on the new basis, not the first it can be compared in, as at Carvana", () => {
      // Its 5-for-1 reached the filings by the 10-Q of July 2026, and its 10-Qs give it nothing to compare until the
      // FY2026 10-K, which isn't out yet. That filing here is FY2025 times 5, and the rest are as filed.
      const facts = filings({
        "2025-02-19": [{ year: 2024, basic: 122_344_000, diluted: 132_206_000, epsBasic: 1.72, epsDiluted: 1.59, netIncome: 210_000_000 }],
        "2026-02-18": [{ year: 2025, basic: 137_634_000, diluted: 224_277_000, epsBasic: 10.22, epsDiluted: 8.45, netIncome: 1_407_000_000 }],
        "2026-07-29": [{ year: 2026, quarter: 2, basic: 717_691_000, diluted: 739_960_000, netIncome: 310_000_000 }],
        "2026-10-28": [{ year: 2026, quarter: 3, basic: 720_857_000, diluted: 739_910_000, netIncome: 289_000_000 }],
        "2027-02-17": [
          { year: 2025, basic: 688_170_000, diluted: 1_121_385_000, epsBasic: 2.04, epsDiluted: 1.69, netIncome: 1_407_000_000 },
          { year: 2026, basic: 720_000_000, diluted: 740_000_000, epsBasic: 1.5, epsDiluted: 1.46, netIncome: 1_080_000_000 },
        ],
      });
      expect(quarterly(facts, "sharesDiluted", "Q2 FY2026")).toBe(739_960_000);
      expect(quarterly(facts, "sharesDiluted", "Q3 FY2026")).toBe(739_910_000);
      expect(perShare(facts, 2025)).toEqual({ eps: 1.69, shares: 1_121_385_000 });
      expect(perShare(facts, 2024).shares).toBe(661_030_000);
      expect(perShare(facts, 2024).eps).toBeCloseTo(0.318, 6);
    });

    it("doesn't multiply filings already on the new basis, as at Aebi Schmidt", () => {
      // 40,352,000 is 7.5 times the 5,380,000 of the first 10-Q, in thousands there, and nothing can be compared until
      // the 10-Q of May 2026. FY2025 would read 440M if the filings since August 2025 were taken as the old basis.
      const facts = filings({
        "2025-06-27": [{ year: 2025, quarter: 1, basic: 5380, epsBasic: 0.39, epsDiluted: 0.39, netIncome: 2_075_000 }],
        "2025-08-14": [{ year: 2025, quarter: 2, basic: 40_352, diluted: 40_352, epsBasic: -0.06, epsDiluted: -0.06, netIncome: -2_310_000 }],
        "2025-11-13": [{ year: 2025, quarter: 3, basic: 76_963_000, diluted: 77_134_000, epsBasic: 0.02, epsDiluted: 0.02, netIncome: 1_206_000 }],
        "2026-03-19": [{ year: 2025, basic: 58_664_000, diluted: 58_784_000, epsBasic: 0.17, epsDiluted: 0.17, netIncome: 9_739_000 }],
        "2026-05-14": [
          { year: 2025, quarter: 1, basic: 40_352_000, diluted: 40_352_000, epsBasic: 0.05, epsDiluted: 0.05, netIncome: 2_075_000 },
          { year: 2026, quarter: 1, basic: 77_106_000, diluted: 77_406_000, epsBasic: 0.01, epsDiluted: 0.01, netIncome: 695_000 },
        ],
      });
      expect(perShare(facts, 2025)).toEqual({ eps: 0.17, shares: 58_784_000 });
      expect(quarterly(facts, "sharesDiluted", "Q3 FY2025")).toBe(77_134_000);
      expect(quarterly(facts, "sharesDiluted", "Q2 FY2025")).toBe(40_352_000);
      expect(quarterly(facts, "sharesDiluted", "Q1 FY2025")).toBe(40_352_000);
    });

    it("reads a split from basic counts in the wrong scale, and dates it the same way, as at Tractor Supply", () => {
      // The 2-for-1 of 2010: 36,333,000 in August 2010, then 72,600 in thousands. Nothing compares until a year later.
      const facts = filings({
        "2010-08-03": [{ year: 2010, quarter: 2, basic: 36_333_000, diluted: 37_339_000, epsBasic: 2.11, epsDiluted: 2.05, netIncome: 76_487_000 }],
        "2010-11-02": [{ year: 2010, quarter: 3, basic: 72_600, diluted: 74_932, epsBasic: 0.44, epsDiluted: 0.43, netIncome: 32_017_000 }],
        "2011-02-23": [{ year: 2010, basic: 72_597, diluted: 74_686, epsBasic: 2.31, epsDiluted: 2.25, netIncome: 167_972_000 }],
        "2011-05-03": [{ year: 2011, quarter: 1, basic: 72_704, diluted: 74_927, epsBasic: 0.25, epsDiluted: 0.24, netIncome: 18_335_000 }],
        "2011-08-04": [
          { year: 2010, quarter: 2, basic: 72_665, diluted: 74_678, epsBasic: 1.06, epsDiluted: 1.04, netIncome: 77_318_000 },
          { year: 2011, quarter: 2, basic: 72_007, diluted: 74_180, epsBasic: 1.27, epsDiluted: 1.23, netIncome: 91_160_000 },
        ],
      });
      expect(quarterly(facts, "sharesDiluted", "Q3 FY2010")).toBe(74_932_000);
      expect(quarterly(facts, "epsDiluted", "Q3 FY2010")).toBe(0.43);
      expect(perShare(facts, 2010)).toEqual({ eps: 2.25, shares: 74_686_000 });
      expect(quarterly(facts, "sharesDiluted", "Q2 FY2010")).toBe(74_678_000);
    });

    it("doesn't date a split by a step an earlier split explains, as at HEICO", () => {
      // Two 5-for-4s within a year: the first of them is already known by the time the second is, in a comparison spanning
      // both. Q3 2017 was last filed between the two: 86,893,000 times 5/4 is 108,616,250. HEICO's year ends in October,
      // so its quarters and filing dates are two months later here.
      const facts = filings({
        "2016-07-27": [{ year: 2016, quarter: 2, basic: 66_923_000, diluted: 68_028_000, epsBasic: 0.58, epsDiluted: 0.57, netIncome: 38_657_000 }],
        "2017-05-02": [{ year: 2017, quarter: 1, basic: 67_314_000, diluted: 69_123_000, epsBasic: 0.61, epsDiluted: 0.59, netIncome: 40_927_000 }],
        "2017-07-25": [
          { year: 2016, quarter: 2, basic: 83_653_000, diluted: 85_035_000, epsBasic: 0.46, epsDiluted: 0.45, netIncome: 38_657_000 },
          { year: 2017, quarter: 2, basic: 84_221_000, diluted: 86_637_000, epsBasic: 0.54, epsDiluted: 0.53, netIncome: 45_686_000 },
        ],
        "2017-10-25": [{ year: 2017, quarter: 3, basic: 84_343_000, diluted: 86_893_000, epsBasic: 0.54, epsDiluted: 0.53, netIncome: 45_698_000 }],
        "2018-05-01": [
          { year: 2017, quarter: 1, basic: 105_178_000, diluted: 108_005_000, epsBasic: 0.39, epsDiluted: 0.38, netIncome: 40_927_000 },
          { year: 2018, quarter: 1, basic: 105_639_000, diluted: 109_112_000, epsBasic: 0.62, epsDiluted: 0.6, netIncome: 65_152_000 },
        ],
        "2018-07-31": [
          { year: 2017, quarter: 2, basic: 105_276_000, diluted: 108_296_000, epsBasic: 0.43, epsDiluted: 0.42, netIncome: 45_686_000 },
          { year: 2018, quarter: 2, basic: 105_940_000, diluted: 109_271_000, epsBasic: 0.56, epsDiluted: 0.55, netIncome: 59_618_000 },
        ],
      });
      expect(quarterly(facts, "sharesDiluted", "Q3 FY2017")).toBe(108_616_250);
      expect(quarterly(facts, "epsDiluted", "Q3 FY2017")).toBeCloseTo(0.424, 6);
      expect(quarterly(facts, "sharesDiluted", "Q2 FY2017")).toBe(108_296_000);
    });

    it("goes by the step nearest a split, as a merger can make one too, as at Waste Connections", () => {
      // Its merger with Progressive Waste took the count up 1.25 times in 2016, and the 3-for-2 of 2017 took it up 1.50 times.
      // Q3 2016 was last filed before the split: 175,766,759 times 3/2 is 263,650,138.5, and it restated that to 263,650,138.
      const facts = filings({
        "2016-08-05": [{ year: 2016, quarter: 2, basic: 140_203_557, diluted: 140_587_155, epsBasic: 0.2, epsDiluted: 0.2, netIncome: 27_489_000 }],
        "2016-10-31": [{ year: 2016, quarter: 3, basic: 175_336_967, diluted: 175_766_759, epsBasic: 0.51, epsDiluted: 0.5, netIncome: 88_617_000 }],
        "2017-02-27": [{ year: 2016, basic: 153_550_008, diluted: 154_054_331, epsBasic: 1.61, epsDiluted: 1.6, netIncome: 246_540_000 }],
        "2017-05-01": [{ year: 2017, quarter: 1, basic: 175_374_630, diluted: 175_935_482, epsBasic: 0.08, epsDiluted: 0.08, netIncome: 14_874_000 }],
        "2017-07-26": [
          { year: 2016, quarter: 2, basic: 210_305_335, diluted: 210_880_732, epsBasic: 0.13, epsDiluted: 0.13, netIncome: 27_489_000 },
          { year: 2017, quarter: 2, basic: 263_387_338, diluted: 264_109_594, epsBasic: 0.47, epsDiluted: 0.47, netIncome: 123_656_000 },
        ],
      });
      expect(quarterly(facts, "sharesDiluted", "Q3 FY2016")).toBe(263_650_138.5);
      expect(quarterly(facts, "epsDiluted", "Q3 FY2016")).toBeCloseTo(0.333333, 6);
      expect(quarterly(facts, "sharesDiluted", "Q2 FY2017")).toBe(264_109_594);
    });

    it("doesn't date a split by a step after the filing that restated it, however close, as at Neogen", () => {
      // The 2-for-1 of 2021 stepped 1.994 times, and the 3M merger of 2022 stepped 2.004 times. Neogen's year ends in May, so
      // its periods sit a month later here. Q1 2021 was last filed before the split: 53,695,000 times 2 is 107,390,000.
      const facts = filings({
        "2020-09-30": [{ year: 2020, quarter: 3, basic: 52_992_000, diluted: 53_285_000, epsBasic: 0.3, epsDiluted: 0.3, netIncome: 15_860_000 }],
        "2020-12-29": [{ year: 2020, quarter: 4, basic: 53_129_000, diluted: 53_404_000, epsBasic: 0.3, epsDiluted: 0.3, netIncome: 15_885_000 }],
        "2021-03-31": [{ year: 2021, quarter: 1, basic: 53_413_000, diluted: 53_695_000, epsBasic: 0.25, epsDiluted: 0.25, netIncome: 13_377_000 }],
        "2021-07-30": [{ year: 2021, quarter: 2, basic: 106_499_000, diluted: 107_120_000, epsBasic: 0.57, epsDiluted: 0.57, netIncome: 60_882_000 }],
        "2021-09-30": [
          { year: 2020, quarter: 3, basic: 105_984_000, diluted: 106_570_000, epsBasic: 0.15, epsDiluted: 0.15, netIncome: 15_860_000 },
          { year: 2021, quarter: 3, basic: 107_490_000, diluted: 108_109_000, epsBasic: 0.16, epsDiluted: 0.16, netIncome: 17_077_000 },
        ],
        "2022-09-30": [{ year: 2022, quarter: 3, basic: 107_837_000, diluted: 107_857_000, epsBasic: 0.05, epsDiluted: 0.05, netIncome: 5_209_000 }],
        "2023-01-09": [{ year: 2022, quarter: 4, basic: 216_134_000, diluted: 216_134_000, epsBasic: -0.19, epsDiluted: -0.19, netIncome: -41_841_000 }],
      });
      expect(quarterly(facts, "sharesDiluted", "Q1 FY2021")).toBe(107_390_000);
      expect(quarterly(facts, "sharesDiluted", "Q2 FY2021")).toBe(107_120_000);
    });

    it("goes by a filing's latest quarter, as a year to date lags it, as at Summit", () => {
      // Its rights offering restated counts 1.406 times, and took the third quarter of 2022 up 1.49 times, to 148,582,751.
      // The nine months to then show only 1.16, and the first half of 2023 happens to show 1.42 a year later.
      const facts = filings({
        "2022-08-11": [
          { year: 2022, quarter: 2, toDate: true, basic: 99_627_701, diluted: 99_627_701, epsBasic: -0.38, epsDiluted: -0.38, netIncome: -38_168_000 },
          { year: 2022, quarter: 2, basic: 99_654_092, diluted: 99_654_092, epsBasic: -0.17, epsDiluted: -0.17, netIncome: -16_771_000 },
        ],
        "2022-11-09": [
          { year: 2022, quarter: 3, toDate: true, basic: 115_110_095, diluted: 115_110_095, epsBasic: -0.52, epsDiluted: -0.52, netIncome: -59_553_000 },
          { year: 2022, quarter: 3, basic: 148_582_751, diluted: 148_582_751, epsBasic: -0.14, epsDiluted: -0.14, netIncome: -21_385_000 },
        ],
        "2023-03-09": [{ year: 2022, basic: 193_336_063, diluted: 193_336_063, epsBasic: -0.41, epsDiluted: -0.41, netIncome: -78_782_000 }],
        "2023-05-11": [{ year: 2023, quarter: 1, basic: 378_163_980, diluted: 378_163_980, epsBasic: -1.43, epsDiluted: -1.43, netIncome: -542_376_000 }],
        "2023-08-09": [
          { year: 2022, quarter: 2, toDate: true, basic: 140_077_890, diluted: 140_077_890, epsBasic: -0.27, epsDiluted: -0.27, netIncome: -38_168_000 },
          { year: 2022, quarter: 2, basic: 140_114_997, diluted: 140_114_997, epsBasic: -0.12, epsDiluted: -0.12, netIncome: -16_771_000 },
          { year: 2023, quarter: 2, toDate: true, basic: 538_807_328, diluted: 538_807_328, epsBasic: -1.03, epsDiluted: -1.03, netIncome: -557_093_000 },
          { year: 2023, quarter: 2, basic: 697_685_365, diluted: 697_685_365, epsBasic: -0.02, epsDiluted: -0.02, netIncome: -14_717_000 },
        ],
      });
      expect(quarterly(facts, "sharesDiluted", "Q3 FY2022")).toBe(148_582_751);
      expect(perShare(facts, 2022)).toEqual({ eps: -0.41, shares: 193_336_063 });
    });

    it("dates a split by the basic count, as an accounting change can move diluted shares", () => {
      // Diluted shares double in the 10-Q before the split, and basic shares double in the 10-Q that first shows it.
      const facts = filings({
        "2022-02-01": [{ year: 2021, basic: 1000, diluted: 1500, epsBasic: 5, epsDiluted: 3.33, netIncome: 5000 }],
        "2022-08-01": [{ year: 2022, quarter: 2, basic: 1000, diluted: 3000, epsBasic: 1, epsDiluted: 0.33, netIncome: 1000 }],
        "2022-11-01": [{ year: 2022, quarter: 3, basic: 2000, diluted: 3000, epsBasic: 0.5, epsDiluted: 0.33, netIncome: 1000 }],
        "2023-02-01": [
          { year: 2021, basic: 2000, diluted: 3000, epsBasic: 2.5, epsDiluted: 1.67, netIncome: 5000 },
          { year: 2022, basic: 2000, diluted: 3000, epsBasic: 2, epsDiluted: 1.33, netIncome: 4000 },
        ],
      });
      expect(quarterly(facts, "sharesDiluted", "Q2 FY2022")).toBe(6000);
      expect(quarterly(facts, "sharesDiluted", "Q3 FY2022")).toBe(3000);
    });

    it("doesn't take one bad tag for a split, with no step behind it and a ratio that misses, as at Enliven", () => {
      // A 10-Q repeated Q2 2023's 40,961,024 for Q1 2023, which was 18,514,644. That's 2.21 times, within 2% of 9 for 4, in a
      // quarter where the count only rose 1.14 times, and the step of 2.21 in 2023 was the merger, a year before the older filing.
      const facts = filings({
        "2023-02-10": [{ year: 2022, basic: 26_287_264, diluted: 26_385_567, epsBasic: 0.06, epsDiluted: 0.06, netIncome: 1_488_000 }],
        "2023-05-11": [{ year: 2023, quarter: 1, basic: 18_514_644, diluted: 18_514_644, epsBasic: -0.8, epsDiluted: -0.8, netIncome: -14_724_000 }],
        "2023-08-10": [{ year: 2023, quarter: 2, basic: 40_961_024, diluted: 40_961_024, epsBasic: -0.41, epsDiluted: -0.41, netIncome: -16_721_000 }],
        "2024-05-14": [
          { year: 2023, quarter: 1, basic: 18_514_644, diluted: 18_514_644, epsBasic: -0.8, epsDiluted: -0.8, netIncome: -14_724_000 },
          { year: 2024, quarter: 1, basic: 42_045_608, diluted: 42_045_608, epsBasic: -0.54, epsDiluted: -0.54, netIncome: -22_738_000 },
        ],
        "2024-08-13": [
          { year: 2023, quarter: 1, basic: 40_961_024, diluted: 40_961_024, netIncome: -14_724_000 },
          { year: 2024, quarter: 2, basic: 48_075_035, diluted: 48_075_035, epsBasic: -0.41, epsDiluted: -0.41, netIncome: -19_950_000 },
        ],
      });
      expect(perShare(facts, 2022)).toEqual({ eps: 0.06, shares: 26_385_567 });
      expect(quarterly(facts, "sharesDiluted", "Q1 FY2024")).toBe(42_045_608);
    });

    it("needs no step behind a split read from EPS alone, as at Oceaneering", () => {
      // It tags no share counts, and $0.99 against $0.49 misses 2-for-1 by 1% on rounding. FY2010 was last filed before it.
      const facts = filings({
        "2010-08-06": [{ year: 2010, quarter: 2, epsBasic: 0.99, epsDiluted: 0.98, profit: 54_317_000 }],
        "2011-02-25": [{ year: 2010, epsBasic: 3.66, epsDiluted: 3.65, profit: 200_531_000 }],
        "2011-08-03": [
          { year: 2010, quarter: 2, epsBasic: 0.49, epsDiluted: 0.49, profit: 54_317_000 },
          { year: 2011, quarter: 2, epsBasic: 0.52, epsDiluted: 0.52, profit: 56_693_000 },
        ],
      });
      expect(value(statements(facts, "annual"), "income", "epsDiluted", "FY2010")).toBeCloseTo(1.825, 6);
    });

    it("keeps a split that no step in the counts shows, as a share issue can hide it, as at Service Properties", () => {
      // The 1-for-5 of 2026 came with a share issue, so its 10-Q shows 128,085,000, not 33M. The comparison is exact:
      // 165,743,000 / 5 is 33,148,600. FY2025 was last filed before it: 165,951,000 / 5 is 33,190,200.
      const facts = filings({
        "2025-08-05": [{ year: 2025, quarter: 2, basic: 165_743_000, diluted: 165_743_000, epsBasic: -0.23, epsDiluted: -0.23, netIncome: -38_159_000 }],
        "2025-11-05": [{ year: 2025, quarter: 3, basic: 166_085_000, diluted: 166_085_000, epsBasic: -0.28, epsDiluted: -0.28, netIncome: -46_945_000 }],
        "2026-02-25": [{ year: 2025, basic: 165_951_000, diluted: 165_951_000, epsBasic: -1.22, epsDiluted: -1.22, netIncome: -202_321_000 }],
        "2026-05-06": [{ year: 2026, quarter: 1, basic: 166_395_000, diluted: 166_395_000, epsBasic: -0.91, epsDiluted: -0.91, netIncome: -151_178_000 }],
        "2026-08-05": [
          { year: 2025, quarter: 2, basic: 33_148_000, diluted: 33_148_000, epsBasic: -1.15, epsDiluted: -1.15, netIncome: -38_159_000 },
          { year: 2026, quarter: 2, basic: 128_085_000, diluted: 128_085_000, epsBasic: -1.75, epsDiluted: -1.75, netIncome: -223_838_000 },
        ],
      });
      expect(perShare(facts, 2025).shares).toBe(33_190_200);
      expect(perShare(facts, 2025).eps).toBeCloseTo(-6.1, 6);
      expect(quarterly(facts, "sharesDiluted", "Q2 FY2026")).toBe(128_085_000);
    });
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

  it("adjusts a split its counts only show once they're in scale, as at Agenus", () => {
    // The 1-for-20 of 2024: 281,743 in thousands against 14,087,000 looks like 50-for-1 until it's put right. FY2021 was
    // last filed before it: 228,919,000 / 20 is 11,445,950, and $0.11 lost a share is $2.20.
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
    expect(perShare(facts, 2021).shares).toBe(11_445_950);
    expect(perShare(facts, 2021).eps).toBeCloseTo(-2.2, 6);
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

  it("places a basic count by basic EPS, where a filing tags no other, as Alkermes's 10-Qs do", () => {
    const facts = filings({
      "2022-02-01": [plainYear(2021, 100_000_000, 2)],
      "2023-02-01": [{ year: 2022, basic: 100_000, epsBasic: 3, netIncome: 300_000_000 }],
      "2024-02-01": [plainYear(2022, 400_000_000, 0.75), plainYear(2023, 400_000_000, 1)],
    });
    expect(perShare(facts, 2021)).toEqual({ eps: 0.5, shares: 400_000_000 });
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

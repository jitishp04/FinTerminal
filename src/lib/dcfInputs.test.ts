import { describe, expect, it } from "vitest";
import { toDcfInputs, unfitReason } from "./dcfInputs";
import type { Financials, Profile } from "./types";

const M = 1e6;

/** Statements with these columns, newest first, and lines in $M (shares in millions). */
function statements(
  period: Financials["period"],
  periods: [label: string, end: string][],
  lines: Partial<Record<"income" | "balance" | "cashFlow", Record<string, (number | null)[]>>>,
): Financials {
  const toLines = (section: Record<string, (number | null)[]> = {}) =>
    Object.entries(section).map(([key, values]) => ({ key, label: key, values: values.map((v) => (v === null ? null : v * M)) }));
  return {
    symbol: "MSFT",
    name: "MICROSOFT CORPORATION",
    period,
    periods: periods.map(([label, end]) => ({ label, end })),
    income: toLines(lines.income),
    balance: toLines(lines.balance),
    cashFlow: toLines(lines.cashFlow),
  };
}

// Microsoft as the SEC's data had it on 1 November 2026, through /api/financials.
const quarterly = statements(
  "quarterly",
  [
    ["Q1 FY2027", "2026-09-30"],
    ["Q4 FY2026", "2026-06-30"],
    ["Q3 FY2026", "2026-03-31"],
    ["Q2 FY2026", "2025-12-31"],
    ["Q1 FY2026", "2025-09-30"],
  ],
  {
    income: { sharesDiluted: [7446, null, 7445, 7460, 7466] },
    balance: {
      cash: [20281, 20935, 32105, 24296, 28849],
      shortTermInvestments: [44228, 55908, 46167, 65166, 73163],
      currentDebt: [4391, 9227, null, null, null],
      longTermDebt: [31090, 31067, 31423, 35425, 35376],
    },
    cashFlow: {
      operatingCashFlow: [58000, 55441, 46679, 35758, 45057],
      capitalExpenditures: [39367, 35802, 30876, 29876, 19394],
    },
  },
);
const annual = statements(
  "annual",
  [
    ["FY2026", "2026-06-30"],
    ["FY2025", "2025-06-30"],
    ["FY2024", "2024-06-30"],
  ],
  {
    income: { revenue: [331839, 281724, 245122], sharesDiluted: [7453, 7465, 7469] },
    cashFlow: { operatingCashFlow: [182935, 136162, 118548], capitalExpenditures: [115948, 64551, 44477] },
  },
);
const profile = { symbol: "MSFT", name: "Microsoft Corporation", type: "EQUITY", currency: "USD", beta: 1.099 } as Profile;
const riskFree = { date: "2026-10-29", value: 4.12 };
const source = { profile, price: 521.91, annual, quarterly, riskFree };

describe("toDcfInputs", () => {
  it("takes free cash flow over the last 4 quarters, and the latest balance sheet and share count", () => {
    expect(toDcfInputs(source)).toEqual({
      symbol: "MSFT",
      name: "Microsoft Corporation",
      currency: "USD",
      price: 521.91,
      beta: 1.099,
      riskFree,
      // 58,000 + 55,441 + 46,679 + 35,758 = 195,878, less 39,367 + 35,802 + 30,876 + 29,876 = 135,921.
      freeCashFlow: {
        value: 59957 * M,
        operatingCashFlow: 195878 * M,
        capitalExpenditures: 135921 * M,
        period: "the 4 quarters to 2026-09-30",
      },
      balance: {
        date: "2026-09-30",
        cash: 20281 * M,
        shortTermInvestments: 44228 * M,
        currentDebt: 4391 * M,
        longTermDebt: 31090 * M,
      },
      shares: { value: 7446 * M, period: "Q1 FY2027" },
      revenue: [
        { period: "FY2024", value: 245122 * M },
        { period: "FY2025", value: 281724 * M },
        { period: "FY2026", value: 331839 * M },
      ],
    });
  });

  it("falls back to the latest fiscal year when one of the 4 quarters is missing", () => {
    const gap = { ...quarterly, cashFlow: quarterly.cashFlow.map((l) => ({ ...l, values: [null, ...l.values.slice(1)] })) };
    const inputs = toDcfInputs({ ...source, quarterly: gap });
    // 182,935 − 115,948.
    expect(inputs).toMatchObject({ freeCashFlow: { value: 66987 * M, period: "FY2026" } });
  });

  it("takes the year's share count when the latest quarter has none, as after a 10-K", () => {
    const afterTenK = { ...quarterly, periods: quarterly.periods.slice(1), income: [{ key: "sharesDiluted", label: "", values: [null, 7445 * M] }] };
    expect(toDcfInputs({ ...source, quarterly: afterTenK })).toMatchObject({ shares: { value: 7453 * M, period: "FY2026" } });
  });

  it("counts a balance sheet line the company didn't report as 0", () => {
    const inputs = toDcfInputs({ ...source, quarterly: { ...quarterly, balance: quarterly.balance.filter((l) => l.key !== "shortTermInvestments") } });
    expect(inputs).toMatchObject({ balance: { shortTermInvestments: 0 } });
  });

  it("explains why when free cash flow isn't positive", () => {
    const losing = { ...quarterly, cashFlow: quarterly.cashFlow.map((l) => (l.key === "capitalExpenditures" ? { ...l, values: l.values.map((v) => v! * 2) } : l)) };
    expect(toDcfInputs({ ...source, quarterly: losing })).toEqual({
      symbol: "MSFT",
      reason:
        "MSFT's free cash flow was -$75,964M over the 4 quarters to 2026-09-30. A DCF grows positive cash flow, so it doesn't fit.",
    });
  });

  it("explains why when the filings lack the cash flow or share count", () => {
    const empty = statements("annual", [["FY2026", "2026-06-30"]], {});
    const noQuarters = statements("quarterly", [["Q1 FY2027", "2026-09-30"]], {});
    expect(toDcfInputs({ ...source, annual: empty, quarterly: noQuarters })).toMatchObject({ reason: expect.stringMatching(/don't give operating cash flow/) });
    const noShares = { ...quarterly, income: [] };
    expect(toDcfInputs({ ...source, annual: { ...annual, income: [] }, quarterly: noShares })).toMatchObject({
      reason: expect.stringMatching(/don't give a diluted share count/),
    });
  });
});

describe("unfitReason", () => {
  const company = (fields: Partial<Profile>) => ({ symbol: "X", name: "X", type: "EQUITY", ...fields }) as Profile;

  it("fits a company", () => {
    expect(unfitReason(company({ industry: "Software - Infrastructure" }))).toBeUndefined();
    expect(unfitReason(company({ industry: "Insurance Brokers" }))).toBeUndefined();
  });

  it("says what a fund, index, currency or future is", () => {
    expect(unfitReason(company({ symbol: "SPY", type: "ETF" }))).toBe("A DCF values a company from its cash flows, and SPY is an ETF.");
    expect(unfitReason(company({ symbol: "^GSPC", type: "INDEX" }))).toBe("A DCF values a company from its cash flows, and ^GSPC is an index.");
    expect(unfitReason(company({ symbol: "EURUSD=X", type: "CURRENCY" }))).toMatch(/is a currency\.$/);
    expect(unfitReason(company({ symbol: "GC=F", type: "FUTURE" }))).toMatch(/is a future\.$/);
    expect(unfitReason(company({ symbol: "VFIAX", type: "MUTUALFUND" }))).toMatch(/is a mutual fund\.$/);
  });

  it("leaves out banks and insurers, whose free cash flow says little", () => {
    expect(unfitReason(company({ symbol: "JPM", industry: "Banks - Diversified" }))).toBe(
      "Free cash flow says little about a bank, whose cash moves with deposits and loans, so a DCF doesn't fit JPM.",
    );
    expect(unfitReason(company({ symbol: "CB", industry: "Insurance - Property & Casualty" }))).toBe(
      "Free cash flow says little about an insurer, whose cash moves with premiums and claims, so a DCF doesn't fit CB.",
    );
  });
});

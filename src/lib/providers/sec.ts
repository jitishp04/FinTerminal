import { ApiError } from "../api";
import { cached } from "../cache";
import { baseForm, isInsiderForm } from "../filings";
import { parseForm4, rawXmlUrl, toInsiderTrades } from "../form4";
import type { Filing, FinancialPeriod, Financials, Filings, InsiderTrades } from "../types";
import { tracked } from "./health";
import { toFinancials, type CompanyFacts } from "./secFacts";

const WWW = "https://www.sec.gov";
const DATA = "https://data.sec.gov";

const HOUR = 60 * 60 * 1000;
const TICKERS_TTL = 24 * HOUR;
const FACTS_TTL = 6 * HOUR;
const FILINGS_TTL = HOUR;
// A filing never changes once it's filed.
const FORM4_TTL = 24 * HOUR;

// The SEC allows 10 requests a second. This keeps a little under that.
const REQUEST_GAP_MS = 110;

// JPMorgan files over 20,000 structured notes a year, so a list needs a limit.
const MAX_FILINGS = 100;
// Each Form 4 is one more request, so a trades list reads only the latest: 40 take about 4.5 seconds the first time.
const FORM4_FILINGS = 40;

interface Company {
  cik: number;
  name: string;
}

interface Submissions {
  /** 1 if insiders file forms about this company's own stock. */
  insiderTransactionForIssuerExists: number;
  /** 1 if it files those forms itself, as a large holder of other companies' stock. */
  insiderTransactionForOwnerExists: number;
  filings: {
    /** Parallel arrays, newest first, covering at least the last year. */
    recent: {
      accessionNumber: string[];
      filingDate: string[];
      reportDate: string[];
      form: string[];
      primaryDocument: string[];
    };
  };
}

let nextSlot = 0;

function waitForSlot(): Promise<void> {
  const now = Date.now();
  const slot = Math.max(now, nextSlot);
  nextSlot = slot + REQUEST_GAP_MS;
  return new Promise((resolve) => setTimeout(resolve, slot - now));
}

/** One SEC request, read as JSON unless `read` says otherwise. Null if the SEC has no such record. */
function request<T>(url: string, read: (response: Response) => Promise<T> = (response) => response.json()): Promise<T | null> {
  return tracked("sec", async () => {
    const agent = process.env.SEC_USER_AGENT;
    if (!agent) {
      throw new ApiError(500, "SEC_USER_AGENT isn't set. Add your name and email to .env.local: see .env.example.");
    }
    await waitForSlot();
    const response = await fetch(url, { headers: { "User-Agent": agent } });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`The SEC answered ${response.status} for ${url}`);
    return read(response);
  });
}

/** Ticker to company. Includes some funds, such as SPY, but they have no statements. */
function companies(): Promise<Map<string, Company>> {
  return cached("sec:tickers", TICKERS_TTL, async () => {
    const rows = await request<Record<string, { cik_str: number; ticker: string; title: string }>>(
      `${WWW}/files/company_tickers.json`,
    );
    if (!rows) throw new Error("The SEC's ticker list is missing");
    return new Map(Object.values(rows).map((row) => [row.ticker, { cik: row.cik_str, name: row.title }]));
  });
}

const paddedCik = (cik: number) => String(cik).padStart(10, "0");

/** Annual or quarterly statements. Funds and foreign filers get a 404 with a clear message. */
export async function financials(symbol: string, period: FinancialPeriod): Promise<Financials> {
  const notAvailable = new ApiError(404, `The SEC has no ${period} statements for ${symbol}. Funds and foreign companies don't file them.`);
  const company = (await companies()).get(symbol);
  if (!company) throw notAvailable;

  const statements = await cached(`sec:facts:${company.cik}`, FACTS_TTL, async () => {
    const facts = await request<CompanyFacts>(`${DATA}/api/xbrl/companyfacts/CIK${paddedCik(company.cik)}.json`);
    return { annual: facts && toFinancials(facts, "annual"), quarterly: facts && toFinancials(facts, "quarterly") };
  });
  const found = statements[period];
  if (!found) throw notAvailable;
  return { symbol, ...found };
}

function toFilings(cik: number, submissions: Submissions) {
  const { recent } = submissions.filings;
  const filings: Filing[] = recent.form.map((form, i) => ({
    form,
    filed: recent.filingDate[i],
    reportDate: recent.reportDate[i] || null,
    url: `${WWW}/Archives/edgar/data/${cik}/${recent.accessionNumber[i].replaceAll("-", "")}/${recent.primaryDocument[i]}`,
  }));
  return {
    // With no insiders of its own, its insider forms are about stock it holds elsewhere: Shopify's are all Klaviyo and Affirm.
    filings: submissions.insiderTransactionForIssuerExists ? filings : filings.filter(({ form }) => !isInsiderForm(form)),
    filesAsHolder: submissions.insiderTransactionForOwnerExists === 1,
  };
}

/** Filings from about the last year or more, newest first. `forms` narrows it, and an amendment counts as its form. */
export async function filings(symbol: string, forms: string[]): Promise<Filings> {
  const notAvailable = new ApiError(404, `No SEC filings for ${symbol}.`);
  const company = (await companies()).get(symbol);
  if (!company) throw notAvailable;

  const found = await cached(`sec:filings:${company.cik}`, FILINGS_TTL, async () => {
    const submissions = await request<Submissions>(`${DATA}/submissions/CIK${paddedCik(company.cik)}.json`);
    return submissions && toFilings(company.cik, submissions);
  });
  if (!found) throw notAvailable;

  const { filings: all, filesAsHolder } = found;
  const wanted = forms.length > 0 ? all.filter(({ form }) => forms.includes(baseForm(form))) : all;
  return { symbol, name: company.name, filesAsHolder, filings: wanted.slice(0, MAX_FILINGS) };
}

/**
 * The common-stock transactions in a company's latest Form 4 filings, newest first.
 * Amendments are left out, so a corrected filing isn't counted twice. A filing that
 * can't be read is skipped and counted.
 */
export async function insiderTrades(symbol: string): Promise<InsiderTrades> {
  const { name, filings: recent } = await filings(symbol, ["4"]);
  const form4s = recent.filter(({ form }) => form === "4").slice(0, FORM4_FILINGS);
  const parsed = await Promise.allSettled(
    form4s.map(({ url }) =>
      cached(`sec:form4:${url}`, FORM4_TTL, async () => {
        const xml = await request(rawXmlUrl(url), (response) => response.text());
        if (xml === null) throw new Error(`No Form 4 XML at ${url}`);
        return parseForm4(xml);
      }),
    ),
  );
  const trades = parsed.flatMap((result, i) => (result.status === "fulfilled" ? toInsiderTrades(result.value, form4s[i]) : []));
  return {
    symbol,
    name,
    trades: trades.sort((a, b) => b.date.localeCompare(a.date) || b.filed.localeCompare(a.filed)),
    filings: form4s.length,
    skipped: parsed.filter((result) => result.status === "rejected").length,
    since: form4s.at(-1)?.filed,
  };
}

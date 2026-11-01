import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { codeName, parseForm4, rawXmlUrl, toInsiderTrades } from "./form4";

// Real filings from sec.gov, as filed, fetched on 1 November 2026.
const fixture = (name: string) => readFileSync(new URL(`./fixtures/form4/${name}`, import.meta.url), "utf8");

describe("parseForm4", () => {
  it("reads a sale: Apple's general counsel, 27 October 2026", () => {
    expect(parseForm4(fixture("aapl-sale.xml"))).toEqual({
      owners: [{ name: "Newstead Jennifer", role: "SVP, GC and Government Affairs" }],
      trades: [{ date: "2026-10-27", code: "S", acquired: false, shares: 2399, price: 343.36, sharesAfter: 32396, direct: true }],
    });
  });

  it("reads an open-market buy held indirectly: Intel's CEO, 11 August 2026", () => {
    expect(parseForm4(fixture("intc-buy.xml"))).toEqual({
      owners: [{ name: "TAN LIP BU", role: "CEO, Director" }],
      trades: [{ date: "2026-08-11", code: "P", acquired: true, shares: 105263, price: 95, sharesAfter: 1314669, direct: false }],
    });
  });

  it("leaves the price out when it's only in a footnote, and skips derivative lines: Apple's COO, 1 October 2026", () => {
    // Units vesting (M, its price a footnote), then shares withheld for tax (F). The filing's derivative line isn't a row.
    expect(parseForm4(fixture("aapl-vest.xml")).trades).toEqual([
      { date: "2026-10-01", code: "M", acquired: true, shares: 99878, sharesAfter: 1173773, direct: true },
      { date: "2026-10-01", code: "F", acquired: false, shares: 52854, price: 330.32, sharesAfter: 1120919, direct: true },
    ]);
  });

  it("reads a gift filed at $0, with role flags written as 1 and 0: an Nvidia director, 7 October 2026", () => {
    expect(parseForm4(fixture("nvda-gift.xml"))).toEqual({
      owners: [{ name: "COXE TENCH", role: "Director" }],
      trades: [{ date: "2026-10-07", code: "G", acquired: false, shares: 500000, price: 0, sharesAfter: 23671360, direct: false }],
    });
  });

  it("gives no rows for a filing with no common-stock transactions, and counts a missing flag as false", () => {
    expect(parseForm4(fixture("jpm-holdings.xml"))).toEqual({ owners: [{ name: "Lake Marianne", role: "CEO CCB" }], trades: [] });
  });

  it("lists every owner of a joint filing", () => {
    // Constructed: no joint filing turned up in about 100 samples, so a second owner is added to Intel's.
    const second = `<reportingOwner><reportingOwnerId><rptOwnerName>Tan Family Trust &amp; Co</rptOwnerName></reportingOwnerId>
      <reportingOwnerRelationship><isTenPercentOwner>true</isTenPercentOwner><isOther>true</isOther><otherText>Trust</otherText></reportingOwnerRelationship></reportingOwner>`;
    const joint = fixture("intc-buy.xml").replace("<aff10b5One>", `${second}<aff10b5One>`);
    expect(parseForm4(joint).owners).toEqual([
      { name: "TAN LIP BU", role: "CEO, Director" },
      { name: "Tan Family Trust & Co", role: "10% owner, Trust" },
    ]);
  });

  it("names an officer with no title, and anything that isn't a Form 4 fails", () => {
    const untitled = fixture("aapl-sale.xml").replace(/<officerTitle>[^<]*<\/officerTitle>/, "");
    expect(parseForm4(untitled).owners[0].role).toBe("Officer");
    expect(() => parseForm4("<html>Not found</html>")).toThrow(/Form 4/);
  });
});

describe("rawXmlUrl", () => {
  it("drops the viewer folder from a filing's link", () => {
    expect(rawXmlUrl("https://www.sec.gov/Archives/edgar/data/320193/000114036126041201/xslF345X06/form4.xml")).toBe(
      "https://www.sec.gov/Archives/edgar/data/320193/000114036126041201/form4.xml",
    );
  });
});

describe("codeName", () => {
  it("puts the common codes in plain words", () => {
    expect(codeName("P")).toBe("Open-market buy");
    expect(codeName("S")).toBe("Sale");
    expect(codeName("F")).toBe("Withheld for tax");
    expect(codeName("Q")).toBe("Code Q");
  });
});

describe("toInsiderTrades", () => {
  const filing = { form: "4", filed: "2026-08-13", reportDate: "2026-08-11", url: "https://www.sec.gov/x/xslF345X06/form4.xml" };

  it("gives each transaction its filer, role and filing", () => {
    expect(toInsiderTrades(parseForm4(fixture("intc-buy.xml")), filing)).toEqual([
      {
        insider: "TAN LIP BU",
        role: "CEO, Director",
        date: "2026-08-11",
        code: "P",
        acquired: true,
        shares: 105263,
        price: 95,
        sharesAfter: 1314669,
        direct: false,
        filed: "2026-08-13",
        url: filing.url,
      },
    ]);
  });

  it("names every owner of a joint filing", () => {
    const form = { owners: [{ name: "A", role: "Director" }, { name: "B", role: "10% owner" }, { name: "C", role: "Director" }], trades: [] };
    const trade = { date: "2026-08-11", code: "P", acquired: true, shares: 1, direct: true };
    expect(toInsiderTrades({ ...form, trades: [trade] }, filing)[0]).toMatchObject({ insider: "A, B and C", role: "Director; 10% owner" });
  });
});

import { describe, expect, it } from "vitest";
import { FILING_FILTERS, filingsUrl, formName, INSIDER_FILTERS, isInsiderForm } from "./filings";

describe("filing filters", () => {
  it("offers each main form, and All covers the rest", () => {
    expect(FILING_FILTERS.map(({ label }) => label)).toEqual(["All", "10-K", "10-Q", "8-K", "DEF 14A", "S-1"]);
    const [all, ...rest] = FILING_FILTERS;
    expect(all.forms).toEqual(rest.flatMap(({ forms }) => forms));
  });

  it("files a foreign company's forms under their US equivalents, or ASML would list nothing", () => {
    const formsOf = (label: string) => FILING_FILTERS.find((filter) => filter.label === label)?.forms;
    expect(formsOf("10-K")).toContain("20-F");
    expect(formsOf("10-K")).toContain("40-F");
    expect(formsOf("8-K")).toContain("6-K");
    expect(formsOf("S-1")).toContain("F-1");
  });

  it("offers each insider form", () => {
    expect(INSIDER_FILTERS.map(({ label }) => label)).toEqual(["All", "Form 3", "Form 4", "Form 5"]);
    expect(INSIDER_FILTERS[0].forms).toEqual(["3", "4", "5"]);
  });
});

describe("formName", () => {
  it("has a name for every form on offer", () => {
    for (const { forms } of [...FILING_FILTERS, ...INSIDER_FILTERS]) {
      for (const form of forms) expect(formName(form), form).toBeTruthy();
    }
  });

  it("says when a filing is an amendment", () => {
    expect(formName("10-K")).toBe("Annual report");
    expect(formName("10-K/A")).toBe("Annual report, amended");
    expect(formName("4/A")).toBe("Change in holdings, amended");
  });
});

describe("isInsiderForm", () => {
  it("knows Forms 3, 4 and 5 and their amendments", () => {
    expect(["3", "4", "5", "4/A"].every(isInsiderForm)).toBe(true);
    expect(["10-K", "144", "S-4", "8-K"].some(isInsiderForm)).toBe(false);
  });
});

describe("filingsUrl", () => {
  it("keeps a form name with a space in it intact", () => {
    const url = new URL(filingsUrl("BRK-B", ["DEF 14A", "10-K"]), "http://localhost");

    expect(url.pathname).toBe("/api/filings");
    expect(url.searchParams.get("symbol")).toBe("BRK-B");
    expect(url.searchParams.get("forms")).toBe("DEF 14A,10-K");
  });
});

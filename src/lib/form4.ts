import type { Filing, InsiderTrade } from "./types";

// Form 4: what an insider bought, sold or was given. The SEC publishes each as a small,
// machine-written XML document with a fixed shape, so a few targeted patterns read it.

export interface Form4Owner {
  /** As filed, usually last name first: "Newstead Jennifer". */
  name: string;
  /** "CEO, Director", "10% owner", … */
  role: string;
}

export interface Form4Trade {
  date: string;
  /** The SEC's transaction code: P, S, A, M, F, G, … */
  code: string;
  /** Shares acquired, or else disposed of. */
  acquired: boolean;
  shares: number;
  /** Per share. Missing when the filing gives it only in a footnote. */
  price?: number;
  sharesAfter?: number;
  /** Held directly, rather than through a trust, family member or fund. */
  direct: boolean;
}

export interface Form4 {
  /** The company whose stock this is: a large holder files Form 4s about other companies too. */
  issuerCik: number;
  owners: Form4Owner[];
  /** Common stock and other non-derivative lines only, in the filing's order. */
  trades: Form4Trade[];
}

const CODES: Record<string, string> = {
  P: "Open-market buy",
  S: "Sale",
  A: "Grant or award",
  D: "Sold back to the company",
  F: "Withheld for tax",
  M: "Exercise or vesting",
  X: "Option exercise",
  C: "Conversion",
  G: "Gift",
  W: "Will or inheritance",
  J: "Other",
  L: "Small purchase",
  I: "Discretionary",
  Z: "Into or out of a trust",
};

/** A transaction code in plain words. */
export const codeName = (code: string) => CODES[code] ?? `Code ${code}`;

/** A filing's XML, from its link: the link opens a viewer folder in front of the same file. */
export const rawXmlUrl = (url: string) => url.replace(/\/xslF345X\d+\//, "/");

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (text: string) => text.replace(/&(amp|lt|gt|quot|apos);/g, (_, name: string) => ENTITIES[name]).trim();

/** Every `<tag>…</tag>` inside `xml`. */
const blocks = (xml: string, tag: string) => [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g"))].map((m) => m[1]);

/** The text of `<tag>`, or of the `<value>` inside it. */
function text(xml: string, tag: string): string | undefined {
  const inner = blocks(xml, tag)[0];
  if (inner === undefined) return undefined;
  const value = /<value>([^<]*)<\/value>/.exec(inner);
  return decode(value ? value[1] : inner.includes("<") ? "" : inner) || undefined;
}

const number = (xml: string, tag: string) => {
  const value = text(xml, tag);
  return value === undefined ? undefined : Number(value);
};

// Flags come as true/false or as 1/0, and a missing one is false.
const flag = (xml: string, tag: string) => /^(true|1)$/i.test(text(xml, tag) ?? "");

function role(relationship: string): string {
  const parts = [
    flag(relationship, "isOfficer") ? (text(relationship, "officerTitle") ?? "Officer") : undefined,
    flag(relationship, "isDirector") ? "Director" : undefined,
    flag(relationship, "isTenPercentOwner") ? "10% owner" : undefined,
    flag(relationship, "isOther") ? (text(relationship, "otherText") ?? "Other") : undefined,
  ];
  return parts.filter(Boolean).join(", ");
}

/** The owners and common-stock transactions in a Form 4's XML. Throws if it isn't one. */
export function parseForm4(xml: string): Form4 {
  if (!/<ownershipDocument>/.test(xml)) throw new Error("Not a Form 4 ownership document");
  const owners = blocks(xml, "reportingOwner").map((owner) => ({
    name: text(owner, "rptOwnerName") ?? "Unnamed",
    role: role(blocks(owner, "reportingOwnerRelationship")[0] ?? ""),
  }));
  const trades = blocks(xml, "nonDerivativeTransaction").map((line): Form4Trade => {
    const price = number(line, "transactionPricePerShare");
    const sharesAfter = number(line, "sharesOwnedFollowingTransaction");
    return {
      date: text(line, "transactionDate") ?? "",
      code: text(line, "transactionCode") ?? "",
      acquired: text(line, "transactionAcquiredDisposedCode") === "A",
      shares: number(line, "transactionShares") ?? 0,
      ...(price !== undefined && { price }),
      ...(sharesAfter !== undefined && { sharesAfter }),
      direct: text(line, "directOrIndirectOwnership") !== "I",
    };
  });
  return { issuerCik: Number(text(xml, "issuerCik")), owners, trades };
}

const joined = (names: string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);

/** A parsed filing's transactions as rows, each with its filers and the filing. */
export function toInsiderTrades({ owners, trades }: Pick<Form4, "owners" | "trades">, filing: Filing): InsiderTrade[] {
  const insider = joined(owners.map((o) => o.name));
  const role = [...new Set(owners.map((o) => o.role).filter(Boolean))].join("; ");
  return trades.map((trade) => ({ insider, role, ...trade, filed: filing.filed, url: filing.url }));
}

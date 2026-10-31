export interface FilingFilter {
  label: string;
  forms: string[];
}

const INSIDER_FORMS = ["3", "4", "5"];

// A foreign company's forms sit with their US equivalents, or ASML would have nothing to list.
const BY_FORM: FilingFilter[] = [
  { label: "10-K", forms: ["10-K", "10-KT", "20-F", "40-F"] },
  { label: "10-Q", forms: ["10-Q", "10-QT"] },
  { label: "8-K", forms: ["8-K", "6-K"] },
  { label: "DEF 14A", forms: ["DEF 14A"] },
  { label: "S-1", forms: ["S-1", "F-1"] },
];

/** CF's choices. All leaves out routine forms: JPMorgan's list would otherwise be nothing but structured notes. */
export const FILING_FILTERS: FilingFilter[] = [{ label: "All", forms: BY_FORM.flatMap(({ forms }) => forms) }, ...BY_FORM];

/** INS's choices. */
export const INSIDER_FILTERS: FilingFilter[] = [
  { label: "All", forms: INSIDER_FORMS },
  ...INSIDER_FORMS.map((form) => ({ label: `Form ${form}`, forms: [form] })),
];

const FORM_NAMES: Record<string, string> = {
  "10-K": "Annual report",
  "10-KT": "Transition report",
  "20-F": "Annual report, foreign company",
  "40-F": "Annual report, Canadian company",
  "10-Q": "Quarterly report",
  "10-QT": "Transition report",
  "8-K": "Current report",
  "6-K": "Current report, foreign company",
  "DEF 14A": "Proxy statement",
  "S-1": "Registration statement",
  "F-1": "Registration statement, foreign company",
  "3": "First statement of holdings",
  "4": "Change in holdings",
  "5": "Annual statement of holdings",
};

/** The form an amendment amends, or the form itself. */
export const baseForm = (form: string) => form.replace(/\/A$/, "");

export const isInsiderForm = (form: string) => INSIDER_FORMS.includes(baseForm(form));

/** What a form on offer is, in plain words. */
export function formName(form: string) {
  const name = FORM_NAMES[baseForm(form)];
  return form.endsWith("/A") ? `${name}, amended` : name;
}

export const filingsUrl = (symbol: string, forms: string[]) =>
  `/api/filings?symbol=${encodeURIComponent(symbol)}&forms=${encodeURIComponent(forms.join(","))}`;

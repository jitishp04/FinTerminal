// Number formats for prices and changes. Fixed to en-US so every panel reads the same.

/** Decimals for a price: exchange rates and prices under 10 need four. */
export const priceDecimals = (price: number) => (Math.abs(price) < 10 ? 4 : 2);

const fixed = (decimals: number, signed = false) =>
  new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    signDisplay: signed ? "exceptZero" : "auto",
  });

/** `344.15`, `1.1162`, `7,736.42`. */
export function formatPrice(value: number, decimals = priceDecimals(value)): string {
  return fixed(decimals).format(value);
}

/** `+2.95`, `-0.0036`, `0.00`. Pass the price's decimals: a small move on a big price keeps two. */
export function formatChange(value: number, decimals: number): string {
  return fixed(decimals, true).format(value);
}

/** From a percent number: `-0.76` → `-0.76%`. */
export function formatPercent(value: number): string {
  return `${fixed(2, true).format(value)}%`;
}

/** From a fraction, unsigned: `0.0071` → `0.71%`. Tiny ones keep two significant digits: `0.000945` → `0.095%`. */
export function formatFraction(value: number): string {
  const percent = value * 100;
  if (percent !== 0 && Math.abs(percent) < 0.1) return `${percent.toPrecision(2)}%`;
  return `${fixed(2).format(percent)}%`;
}

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumSignificantDigits: 3 });

/** Three significant digits with a suffix: `3.83T`, `45.6B`, `22.1M`, `950`. */
export function formatCompact(value: number): string {
  return compact.format(value);
}

const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** Grouped whole number: `228,000`. */
export function formatInteger(value: number): string {
  return whole.format(value);
}

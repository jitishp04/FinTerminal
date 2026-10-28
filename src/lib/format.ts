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

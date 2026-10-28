// Moving averages over a series of closes. Each result lines up with its input:
// undefined until `period` values are in.

/** Simple moving average: the mean of the last `period` values. */
export function sma(values: number[], period: number): (number | undefined)[] {
  let sum = 0;
  return values.map((value, i) => {
    sum += value;
    if (i >= period) sum -= values[i - period];
    return i >= period - 1 ? sum / period : undefined;
  });
}

/** Exponential moving average, seeded with the simple average of the first `period` values. */
export function ema(values: number[], period: number): (number | undefined)[] {
  const k = 2 / (period + 1);
  let previous: number | undefined;
  return values.map((value, i) => {
    if (i < period - 1) return undefined;
    previous =
      previous === undefined ? values.slice(0, period).reduce((a, b) => a + b, 0) / period : previous + k * (value - previous);
    return previous;
  });
}

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

/** Bollinger Bands: `width` population standard deviations either side of the simple average. */
export function bollinger(values: number[], period: number, width: number) {
  const averages = sma(values, period);
  const band = (side: 1 | -1) =>
    averages.map((average, i) => {
      if (average === undefined) return undefined;
      const window = values.slice(i - period + 1, i + 1);
      const variance = window.reduce((sum, value) => sum + (value - average) ** 2, 0) / period;
      return average + side * width * Math.sqrt(variance);
    });
  return { upper: band(1), lower: band(-1) };
}

/** Wilder's Relative Strength Index, seeded with the simple averages of the first `period` changes. Undefined when nothing moved. */
export function rsi(values: number[], period: number): (number | undefined)[] {
  let gain = 0;
  let loss = 0;
  return values.map((value, i) => {
    if (i === 0) return undefined;
    const rise = Math.max(value - values[i - 1], 0);
    const fall = Math.max(values[i - 1] - value, 0);
    gain += (i <= period ? rise : rise - gain) / period;
    loss += (i <= period ? fall : fall - loss) / period;
    if (i < period || gain + loss === 0) return undefined;
    return 100 - 100 / (1 + gain / loss);
  });
}

/**
 * Shared helpers for indicator calculators.
 */

/**
 * Exponential moving average over a numeric source, seeded with the SMA of the
 * first `period` values. Positions with insufficient history are `null`.
 */
export function emaArray(source: (number | null)[], period: number): (number | null)[] {
  const k = 2 / (period + 1);
  const out: (number | null)[] = new Array(source.length).fill(null);
  let ema: number | null = null;
  let seedSum = 0;
  let seedCount = 0;

  for (let i = 0; i < source.length; i++) {
    const v = source[i];
    if (v === null || v === undefined) continue;
    if (ema === null) {
      seedSum += v;
      seedCount++;
      if (seedCount === period) {
        ema = seedSum / period;
        out[i] = ema;
      }
    } else {
      ema = v * k + ema * (1 - k);
      out[i] = ema;
    }
  }
  return out;
}

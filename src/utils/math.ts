export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function pick<T>(...values: (T | undefined | null)[]): T {
  for (const v of values) {
    if (v !== undefined && v !== null) return v;
  }
  return values[values.length - 1] as T;
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && isFinite(value);
}

/**
 * `start, start + step, …` up to `end` (inclusive within `tolerance`). A step
 * that is not positive and finite yields no values, and a step so small that
 * the run would pass `maxCount` values is widened to the smallest whole
 * multiple of itself that fits (so ticks stay on the requested grid), so a bad
 * interval can neither loop forever nor build a huge array.
 */
export function stepValues(start: number, end: number, step: number, maxCount = 1000, tolerance = 0): number[] {
  if (!isNumber(start) || !isNumber(end) || !isNumber(step) || step <= 0 || end < start) return [];
  const span = end + tolerance - start;
  const effectiveStep = span / step > maxCount ? step * Math.ceil(span / step / maxCount) : step;
  const values: number[] = [];
  for (let i = 0; i <= maxCount; i++) {
    const v = start + i * effectiveStep;
    if (v > end + tolerance) break;
    values.push(v);
  }
  return values;
}

/**
 * Smallest finite value, or `fallback` when there is none. Unlike
 * `Math.min(...values)` it works on arrays of any length (spreading ~100k+
 * arguments overflows the call stack) and ignores null/NaN entries.
 */
export function arrayMin(values: ArrayLike<number | null | undefined>, fallback = NaN): number {
  let min = Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (typeof v === 'number' && v < min) min = v;
  }
  return min === Infinity ? fallback : min;
}

/** Largest finite value, or `fallback` when there is none. See {@link arrayMin}. */
export function arrayMax(values: ArrayLike<number | null | undefined>, fallback = NaN): number {
  let max = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (typeof v === 'number' && v > max) max = v;
  }
  return max === -Infinity ? fallback : max;
}

export function normalizeAngle(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

export function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

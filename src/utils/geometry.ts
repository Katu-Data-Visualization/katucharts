/**
 * Geometry helpers shared by circular/radial series so the percentage-vs-pixel
 * handling stays consistent across chart types instead of being re-implemented
 * per series.
 */

/**
 * Resolves a length that may be a percentage string (e.g. `'50%'`) against a
 * total, or a plain number / numeric string. Returns `0` for empty input.
 */
export function resolvePercent(value: string | number | undefined | null, total: number): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim().endsWith('%')) {
    return (parseFloat(value) / 100) * total;
  }
  return parseFloat(value) || 0;
}

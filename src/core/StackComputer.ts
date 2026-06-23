/**
 * Shared primitives for series stacking math. The chart computes per-stack
 * totals and forward offsets in four places (series render, animated redraw,
 * axis-domain updates and stack labels); these helpers keep the stack-key
 * format and the accumulation loop in one place so the variants cannot drift.
 */

interface StackKeyConfig {
  _internalType: string;
  stack?: string | number;
}

interface StackPoint {
  x?: number | string;
  y?: number | null;
}

/**
 * Identity of a stack group: series of the same internal type and `stack` name
 * accumulate together.
 */
export function stackKey(cfg: StackKeyConfig): string {
  return `${cfg._internalType}__${cfg.stack ?? '_default'}`;
}

/**
 * Adds each point's `y` into `totals`, keyed by `x` (defaulting to 0). Mutates
 * and returns `totals` so callers can fold several series into one map.
 */
export function accumulateStackTotals(
  data: ReadonlyArray<StackPoint>,
  totals: Map<number | string, number>
): Map<number | string, number> {
  for (const d of data) {
    const xKey = d.x ?? 0;
    totals.set(xKey, (totals.get(xKey) || 0) + (d.y ?? 0));
  }
  return totals;
}

/**
 * Conditional formatting engine for circos tracks.
 * Processes rule arrays against data points, returning resolved visual styles.
 */

import type { CircosRule, CircosDataPoint, ResolvedStyle } from './CircosTypes';

export function applyRules(
  point: CircosDataPoint,
  index: number,
  rules: CircosRule[] | undefined,
  defaults: ResolvedStyle,
): ResolvedStyle {
  if (!rules || rules.length === 0) return defaults;

  const result = { ...defaults };

  for (const rule of rules) {
    let matched = false;
    try {
      matched = rule.condition(point, index);
    } catch {
      continue;
    }

    if (!matched) continue;

    if (rule.style.color !== undefined) result.color = rule.style.color;
    if (rule.style.opacity !== undefined) result.opacity = rule.style.opacity;
    if (rule.style.size !== undefined) result.size = rule.style.size;
    if (rule.style.show !== undefined) result.show = rule.style.show;
    if (rule.style.symbol !== undefined) result.symbol = rule.style.symbol;
    if (rule.style.strokeWidth !== undefined) result.strokeWidth = rule.style.strokeWidth;
    if (rule.style.strokeColor !== undefined) result.strokeColor = rule.style.strokeColor;

    if (rule.flow !== 'continue') break;
  }

  return result;
}

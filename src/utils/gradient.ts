/**
 * Resolves paint values that may be gradient definitions into SVG-usable fills.
 * Plain color strings pass through unchanged; gradient objects are materialized
 * as `<linearGradient>`/`<radialGradient>` definitions and returned as a
 * `url(#id)` reference so area, line and other series can use array-shorthand
 * gradient fills declaratively.
 */

import type { Selection } from 'd3-selection';
import type { GradientColor } from '../types/options';
import { parseColor } from './color';

export function isGradientColor(value: unknown): value is GradientColor {
  return (
    !!value &&
    typeof value === 'object' &&
    ('linearGradient' in (value as object) || 'radialGradient' in (value as object))
  );
}

let gradientId = 0;

/**
 * Appends a gradient stop, splitting any alpha out of the color into
 * `stop-opacity` since SVG `stop-color` ignores the alpha channel.
 */
function appendStop(
  grad: Selection<any, unknown, any, unknown>,
  offset: number,
  color: string,
): void {
  const c = parseColor(color);
  grad
    .append('stop')
    .attr('offset', String(offset))
    .attr('stop-color', `rgb(${c.r}, ${c.g}, ${c.b})`)
    .attr('stop-opacity', c.a);
}

export function resolveFillPaint(
  fill: string | GradientColor | undefined,
  defsTarget: Selection<any, unknown, any, unknown>,
  fallback: string,
): string {
  if (fill === undefined || fill === null) return fallback;
  if (typeof fill === 'string') return fill;
  if (!isGradientColor(fill)) return fallback;

  const id = `katucharts-fill-grad-${++gradientId}`;
  const defs = defsTarget.append('defs');

  if ('radialGradient' in fill) {
    const g = fill.radialGradient;
    const grad = defs
      .append('radialGradient')
      .attr('id', id)
      .attr('cx', String(g.cx ?? 0.5))
      .attr('cy', String(g.cy ?? 0.5))
      .attr('r', String(g.r ?? 0.5));
    for (const [offset, color] of fill.stops) {
      appendStop(grad, offset, color);
    }
  } else {
    const g = fill.linearGradient;
    const grad = defs
      .append('linearGradient')
      .attr('id', id)
      .attr('x1', String(g.x1 ?? 0))
      .attr('y1', String(g.y1 ?? 0))
      .attr('x2', String(g.x2 ?? 0))
      .attr('y2', String(g.y2 ?? 1));
    for (const [offset, color] of fill.stops) {
      appendStop(grad, offset, color);
    }
  }

  return `url(#${id})`;
}

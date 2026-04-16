/**
 * Track axes renderer — concentric grid lines within track bands.
 * Optional value labels at 12 o'clock position.
 */

import type { CircosTrackAxes } from '../CircosTypes';
import { DEFAULT_CHART_TEXT_COLOR, DEFAULT_CHART_TEXT_SIZE } from '../../../../utils/chartText';

export function renderTrackAxes(
  group: any,
  axes: CircosTrackAxes,
  innerR: number,
  outerR: number,
): void {
  if (!axes.show) return;
  const count = axes.count ?? 3;
  const color = axes.color || '#ddd';
  const opacity = axes.opacity ?? 0.5;
  const strokeWidth = axes.strokeWidth ?? 0.5;
  const step = (outerR - innerR) / (count + 1);

  for (let i = 1; i <= count; i++) {
    const r = innerR + step * i;
    group.append('circle')
      .attr('class', 'circos-track-axis')
      .attr('cx', 0)
      .attr('cy', 0)
      .attr('r', r)
      .attr('fill', 'none')
      .attr('stroke', color)
      .attr('stroke-width', strokeWidth)
      .attr('stroke-dasharray', '2,2')
      .attr('opacity', opacity);

    if (axes.showValues) {
      const label = axes.valueFormat
        ? axes.valueFormat.replace('{value}', String(Math.round(i / (count + 1) * 100)))
        : String(Math.round(i / (count + 1) * 100));
      group.append('text')
        .attr('class', 'circos-track-axis-label')
        .attr('x', 0)
        .attr('y', -r)
        .attr('text-anchor', 'middle')
        .attr('font-size', DEFAULT_CHART_TEXT_SIZE)
        .attr('fill', DEFAULT_CHART_TEXT_COLOR)
        .text(label);
    }
  }
}

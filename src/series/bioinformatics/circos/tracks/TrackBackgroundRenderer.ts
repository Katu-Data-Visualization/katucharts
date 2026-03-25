/**
 * Track background renderer — filled arc ring behind track data.
 */

import { arc as d3Arc } from 'd3-shape';
import type { CircosTrackBackground } from '../CircosTypes';

export function renderTrackBackground(
  group: any,
  bg: CircosTrackBackground,
  innerR: number,
  outerR: number,
): void {
  const color = bg.color || '#f9f9f9';
  const opacity = bg.opacity ?? 0.3;

  const arcGen = d3Arc<any>()
    .innerRadius(innerR)
    .outerRadius(outerR)
    .startAngle(0)
    .endAngle(2 * Math.PI);

  group.append('path')
    .attr('class', 'circos-track-bg')
    .attr('d', arcGen({}))
    .attr('fill', color)
    .attr('opacity', opacity)
    .attr('stroke', bg.border?.color || 'none')
    .attr('stroke-width', bg.border?.width ?? 0);
}

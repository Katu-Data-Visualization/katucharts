/**
 * Highlight track renderer — semi-transparent arc regions for marking areas.
 */

import { arc as d3Arc } from 'd3-shape';
import type { CircosTrack, TrackRenderOptions } from '../CircosTypes';
import type { CircosLayoutEngine } from '../CircosLayoutEngine';

export function renderHighlightTrack(
  engine: CircosLayoutEngine,
  group: any,
  track: CircosTrack,
  innerR: number,
  outerR: number,
  opts: TrackRenderOptions,
): void {
  const color = track.color || 'rgba(255,200,0,0.3)';

  const arcGen = d3Arc<any>()
    .innerRadius(innerR)
    .outerRadius(outerR)
    .startAngle((d: any) => engine.getAngleForPosition(d.chr, d.start))
    .endAngle((d: any) => engine.getAngleForPosition(d.chr, d.end ?? d.start))
    .cornerRadius(2);

  const highlights = group.selectAll('.circos-highlight')
    .data(track.data)
    .join('path')
    .attr('class', 'circos-highlight')
    .attr('d', arcGen)
    .attr('fill', (d: any) => d.color || color)
    .attr('stroke', 'none');

  if (opts.animate) {
    highlights.attr('opacity', 0)
      .transition().duration(opts.duration).delay(opts.baseDelay ?? 0)
      .attr('opacity', 1);
  }
}

/**
 * Stack track renderer — stacked categorical arc segments at each bin position.
 * Groups data by position, stacks categories radially outward.
 */

import { arc as d3Arc } from 'd3-shape';
import type { CircosTrack, CircosDataPoint, TrackRenderOptions } from '../CircosTypes';
import type { CircosLayoutEngine } from '../CircosLayoutEngine';

const CATEGORY_COLORS = [
  '#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f',
  '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac',
];

export function renderStackTrack(
  engine: CircosLayoutEngine,
  group: any,
  track: CircosTrack,
  innerR: number,
  outerR: number,
  opts: TrackRenderOptions,
): void {
  const bins = new Map<string, CircosDataPoint[]>();
  for (const d of track.data) {
    const key = `${d.chr}:${d.start}:${d.end ?? d.start}`;
    if (!bins.has(key)) bins.set(key, []);
    bins.get(key)!.push(d);
  }

  const categories = [...new Set(track.data.map(d => d.category || 'default'))];
  const catColors = new Map<string, string>();
  categories.forEach((cat, i) => catColors.set(cat, CATEGORY_COLORS[i % CATEGORY_COLORS.length]));

  let maxStack = 0;
  for (const points of bins.values()) {
    const total = points.reduce((s, d) => s + (d.value ?? 1), 0);
    if (total > maxStack) maxStack = total;
  }
  const safeMax = maxStack || 1;

  const segments: any[] = [];
  for (const [, points] of bins) {
    const ref = points[0];
    const startAngle = engine.getAngleForPosition(ref.chr, ref.start);
    const endAngle = engine.getAngleForPosition(ref.chr, ref.end ?? ref.start);
    let cumulative = 0;
    for (const d of points) {
      const val = d.value ?? 1;
      const segInner = innerR + (outerR - innerR) * (cumulative / safeMax);
      const segOuter = innerR + (outerR - innerR) * ((cumulative + val) / safeMax);
      segments.push({
        startAngle, endAngle,
        innerR: segInner, outerR: segOuter,
        color: d.color || catColors.get(d.category || 'default') || track.color || '#4e79a7',
        point: d,
      });
      cumulative += val;
    }
  }

  const arcGen = d3Arc<any>()
    .innerRadius(d => d.innerR)
    .outerRadius(d => d.outerR)
    .startAngle(d => d.startAngle)
    .endAngle(d => d.endAngle)
    .cornerRadius(2);

  const arcs = group.selectAll('.circos-stack')
    .data(segments)
    .join('path')
    .attr('class', 'circos-stack')
    .attr('d', arcGen)
    .attr('fill', (d: any) => d.color)
    .attr('stroke', '#fff')
    .attr('stroke-width', 0.3)
    .attr('opacity', track.opacity ?? 0.85);

  if (opts.animate) {
    arcs.attr('opacity', 0)
      .transition().duration(opts.duration).delay(opts.baseDelay ?? 0)
      .attr('opacity', track.opacity ?? 0.85);
  }
}

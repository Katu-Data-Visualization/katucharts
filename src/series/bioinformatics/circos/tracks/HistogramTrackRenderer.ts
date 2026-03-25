/**
 * Histogram track renderer — radial arc bars scaled by value.
 * SVG for small datasets, Canvas for large.
 */

import { arc as d3Arc } from 'd3-shape';
import type { CircosTrack, TrackRenderOptions } from '../CircosTypes';
import type { CircosLayoutEngine } from '../CircosLayoutEngine';
import { safeMinMax, parseColor } from '../CircosLayoutEngine';
import { applyRules } from '../CircosRules';

export function renderHistogramTrack(
  engine: CircosLayoutEngine,
  group: any,
  track: CircosTrack,
  innerR: number,
  outerR: number,
  opts: TrackRenderOptions,
): void {
  const useCanvas = track.data.length > opts.canvasThreshold;
  if (useCanvas) {
    renderHistogramCanvas(engine, group, track, innerR, outerR, opts);
  } else {
    renderHistogramSVG(engine, group, track, innerR, outerR, opts);
  }
}

function renderHistogramSVG(
  engine: CircosLayoutEngine,
  group: any,
  track: CircosTrack,
  innerR: number,
  outerR: number,
  opts: TrackRenderOptions,
): void {
  const values = track.data.map(d => d.value ?? 0);
  const { max: maxVal } = safeMinMax(values);
  const safeMax = maxVal || 1;
  const color = track.color || '#3498db';

  const arcGen = d3Arc<any>()
    .innerRadius(innerR)
    .outerRadius((d: any) => innerR + (outerR - innerR) * ((d.value ?? 0) / safeMax))
    .startAngle((d: any) => engine.getAngleForPosition(d.chr, d.start))
    .endAngle((d: any) => engine.getAngleForPosition(d.chr, d.end ?? d.start))
    .cornerRadius(2);

  const bars = group.selectAll('.circos-hist')
    .data(track.data)
    .join('path')
    .attr('class', 'circos-hist')
    .attr('d', arcGen)
    .attr('fill', (d: any, i: number) => {
      const s = applyRules(d, i, track.rules, { color, opacity: track.opacity ?? 0.8, size: 0, show: true });
      return d.color || s.color;
    })
    .attr('stroke', '#fff')
    .attr('stroke-width', 0.3)
    .attr('opacity', (d: any, i: number) => {
      const s = applyRules(d, i, track.rules, { color, opacity: track.opacity ?? 0.8, size: 0, show: true });
      return s.show ? s.opacity : 0;
    });

  if (opts.animate) {
    bars.attr('opacity', 0)
      .transition().duration(opts.duration * 0.5).delay(opts.duration * 0.5)
      .attr('opacity', (d: any, i: number) => {
        const s = applyRules(d, i, track.rules, { color, opacity: track.opacity ?? 0.8, size: 0, show: true });
        return s.show ? s.opacity : 0;
      });
  }
}

function renderHistogramCanvas(
  engine: CircosLayoutEngine,
  group: any,
  track: CircosTrack,
  innerR: number,
  outerR: number,
  opts: TrackRenderOptions,
): void {
  const values = track.data.map(d => d.value ?? 0);
  const { max: maxVal } = safeMinMax(values);
  const safeMax = maxVal || 1;
  const color = track.color || '#3498db';
  const rgba = parseColor(color);

  const size = Math.ceil(Math.max(opts.cx, opts.cy) * 2);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  if (!ctx) return;

  const halfSize = size / 2;
  ctx.fillStyle = `rgba(${rgba[0]},${rgba[1]},${rgba[2]},0.8)`;

  for (let i = 0; i < track.data.length; i++) {
    const d = track.data[i];
    const startAngle = engine.getAngleForPosition(d.chr, d.start) - Math.PI / 2;
    const endAngle = engine.getAngleForPosition(d.chr, d.end ?? d.start) - Math.PI / 2;
    const barOuter = innerR + (outerR - innerR) * ((d.value ?? 0) / safeMax);

    ctx.beginPath();
    ctx.arc(halfSize, halfSize, barOuter, startAngle, endAngle);
    ctx.arc(halfSize, halfSize, innerR, endAngle, startAngle, true);
    ctx.closePath();
    ctx.fill();
  }

  group.append('image')
    .attr('class', 'katucharts-circos-canvas-hist')
    .attr('x', -halfSize)
    .attr('y', -halfSize)
    .attr('width', size)
    .attr('height', size)
    .attr('href', canvas.toDataURL());
}

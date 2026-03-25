/**
 * Heatmap track renderer — arc segments colored by value intensity.
 * SVG for small datasets, Canvas for large.
 */

import { arc as d3Arc } from 'd3-shape';
import { scaleSequential } from 'd3-scale';
import type { CircosTrack, TrackRenderOptions } from '../CircosTypes';
import type { CircosLayoutEngine } from '../CircosLayoutEngine';
import { safeMinMax, parseColor } from '../CircosLayoutEngine';
import { getColorInterpolator } from '../CircosColorScales';

export function renderHeatmapTrack(
  engine: CircosLayoutEngine,
  group: any,
  track: CircosTrack,
  innerR: number,
  outerR: number,
  opts: TrackRenderOptions,
): void {
  const useCanvas = track.data.length > opts.canvasThreshold;
  if (useCanvas) {
    renderHeatmapCanvas(engine, group, track, innerR, outerR, opts);
  } else {
    renderHeatmapSVG(engine, group, track, innerR, outerR, opts);
  }
}

function renderHeatmapSVG(
  engine: CircosLayoutEngine,
  group: any,
  track: CircosTrack,
  innerR: number,
  outerR: number,
  opts: TrackRenderOptions,
): void {
  const values = track.data.map(d => d.value ?? 0);
  const { min: minVal, max: maxVal } = safeMinMax(values);
  const interpolator = getColorInterpolator(track.colorScale);
  const colorScale = scaleSequential(interpolator).domain([minVal, maxVal]);

  const arcGen = d3Arc<any>()
    .innerRadius(innerR)
    .outerRadius(outerR)
    .startAngle((d: any) => engine.getAngleForPosition(d.chr, d.start))
    .endAngle((d: any) => engine.getAngleForPosition(d.chr, d.end ?? d.start))
    .cornerRadius(2);

  const cells = group.selectAll('.circos-heat')
    .data(track.data)
    .join('path')
    .attr('class', 'circos-heat')
    .attr('d', arcGen)
    .attr('fill', (d: any) => d.color || colorScale(d.value ?? 0))
    .attr('stroke', 'none');

  if (opts.animate) {
    cells.attr('opacity', 0)
      .transition().duration(opts.duration * 0.5).delay(opts.duration * 0.5)
      .attr('opacity', 1);
  }
}

function renderHeatmapCanvas(
  engine: CircosLayoutEngine,
  group: any,
  track: CircosTrack,
  innerR: number,
  outerR: number,
  opts: TrackRenderOptions,
): void {
  const values = track.data.map(d => d.value ?? 0);
  const { min: minVal, max: maxVal } = safeMinMax(values);
  const interpolator = getColorInterpolator(track.colorScale);
  const colorScale = scaleSequential(interpolator).domain([minVal, maxVal]);

  const size = Math.ceil(Math.max(opts.cx, opts.cy) * 2);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  if (!ctx) return;

  const halfSize = size / 2;

  for (let i = 0; i < track.data.length; i++) {
    const d = track.data[i];
    const startAngle = engine.getAngleForPosition(d.chr, d.start) - Math.PI / 2;
    const endAngle = engine.getAngleForPosition(d.chr, d.end ?? d.start) - Math.PI / 2;
    ctx.fillStyle = d.color || colorScale(d.value ?? 0);

    ctx.beginPath();
    ctx.arc(halfSize, halfSize, outerR, startAngle, endAngle);
    ctx.arc(halfSize, halfSize, innerR, endAngle, startAngle, true);
    ctx.closePath();
    ctx.fill();
  }

  group.append('image')
    .attr('class', 'katucharts-circos-canvas-heat')
    .attr('x', -halfSize)
    .attr('y', -halfSize)
    .attr('width', size)
    .attr('height', size)
    .attr('href', canvas.toDataURL());
}

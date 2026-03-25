/**
 * Scatter track renderer — points at (angle, radius) by chr+position and value.
 * Supports both SVG (small) and Canvas (large dataset) rendering.
 */

import { scaleLinear } from 'd3-scale';
import type { CircosTrack, TrackRenderOptions, ResolvedStyle } from '../CircosTypes';
import type { CircosLayoutEngine } from '../CircosLayoutEngine';
import { safeMinMax, parseColor } from '../CircosLayoutEngine';
import { applyRules } from '../CircosRules';

export function renderScatterTrack(
  engine: CircosLayoutEngine,
  group: any,
  track: CircosTrack,
  innerR: number,
  outerR: number,
  opts: TrackRenderOptions,
): void {
  const useCanvas = track.data.length > opts.canvasThreshold;
  if (useCanvas) {
    renderScatterCanvas(engine, group, track, innerR, outerR, opts);
  } else {
    renderScatterSVG(engine, group, track, innerR, outerR, opts);
  }
}

function renderScatterSVG(
  engine: CircosLayoutEngine,
  group: any,
  track: CircosTrack,
  innerR: number,
  outerR: number,
  opts: TrackRenderOptions,
): void {
  const values = track.data.map(d => d.value ?? 0);
  const { min: minVal, max: maxVal } = safeMinMax(values);
  const rScale = engine.createRadialScale(values, innerR, outerR, track.logScale);
  const color = track.color || '#e74c3c';
  const pointRadius = track.options?.radius ?? 2;

  const circles = group.selectAll('.circos-scatter')
    .data(track.data)
    .join('circle')
    .attr('class', 'circos-scatter')
    .attr('cx', (d: any) => {
      const pos = engine.polarToCartesian(engine.getAngleForPosition(d.chr, d.start), rScale(d.value ?? 0));
      return pos.x;
    })
    .attr('cy', (d: any) => {
      const pos = engine.polarToCartesian(engine.getAngleForPosition(d.chr, d.start), rScale(d.value ?? 0));
      return pos.y;
    })
    .attr('r', (d: any, i: number) => {
      const s = applyRules(d, i, track.rules, { color, opacity: track.opacity ?? 0.7, size: pointRadius, show: true });
      return s.show ? s.size : 0;
    })
    .attr('fill', (d: any, i: number) => {
      const s = applyRules(d, i, track.rules, { color, opacity: track.opacity ?? 0.7, size: pointRadius, show: true });
      return d.color || s.color;
    })
    .attr('opacity', (d: any, i: number) => {
      const s = applyRules(d, i, track.rules, { color, opacity: track.opacity ?? 0.7, size: pointRadius, show: true });
      return s.opacity;
    });

  if (opts.animate) {
    circles.attr('r', 0)
      .transition().duration(opts.duration * 0.5).delay(opts.duration * 0.5)
      .attr('r', (d: any, i: number) => {
        const s = applyRules(d, i, track.rules, { color, opacity: track.opacity ?? 0.7, size: pointRadius, show: true });
        return s.show ? s.size : 0;
      });
  }

  if (opts.events && opts.seriesRef) {
    circles
      .on('mouseover', (event: MouseEvent, d: any) => {
        opts.events.emit('point:mouseover', {
          point: { name: d.chr, x: d.start, y: d.value, custom: d },
          index: track.data.indexOf(d), series: opts.seriesRef, event,
          plotX: 0, plotY: 0,
        });
      })
      .on('mouseout', (event: MouseEvent, d: any) => {
        opts.events.emit('point:mouseout', {
          point: { name: d.chr, x: d.start, y: d.value },
          index: track.data.indexOf(d), series: opts.seriesRef, event,
        });
      });
  }
}

function renderScatterCanvas(
  engine: CircosLayoutEngine,
  group: any,
  track: CircosTrack,
  innerR: number,
  outerR: number,
  opts: TrackRenderOptions,
): void {
  const values = track.data.map(d => d.value ?? 0);
  const rScale = engine.createRadialScale(values, innerR, outerR, track.logScale);
  const color = track.color || '#e74c3c';
  const pointRadius = track.options?.radius ?? 1.5;
  const rgba = parseColor(color);

  const size = Math.ceil(Math.max(opts.cx, opts.cy) * 2);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  if (!ctx) return;

  const halfSize = size / 2;

  for (let i = 0; i < track.data.length; i++) {
    const d = track.data[i];
    const s = applyRules(d, i, track.rules, { color, opacity: 0.7, size: pointRadius, show: true });
    if (!s.show) continue;

    const angle = engine.getAngleForPosition(d.chr, d.start) - Math.PI / 2;
    const r = rScale(d.value ?? 0);
    const px = halfSize + Math.cos(angle) * r;
    const py = halfSize + Math.sin(angle) * r;

    if (d.color) {
      const c = parseColor(d.color);
      ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${s.opacity})`;
    } else {
      const c = parseColor(s.color);
      ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${s.opacity})`;
    }

    ctx.beginPath();
    ctx.arc(px, py, s.size, 0, 2 * Math.PI);
    ctx.fill();
  }

  group.append('image')
    .attr('class', 'katucharts-circos-canvas-scatter')
    .attr('x', -halfSize)
    .attr('y', -halfSize)
    .attr('width', size)
    .attr('height', size)
    .attr('href', canvas.toDataURL());
}

/**
 * Ribbon track renderer — variable-width filled links.
 * Width proportional to source/target span. Supports twist detection.
 * Path: source arc → bezier to target → target arc → bezier back.
 */

import type { CircosTrack, CircosDataPoint, TrackRenderOptions } from '../CircosTypes';
import type { CircosLayoutEngine } from '../CircosLayoutEngine';
import { applyRules } from '../CircosRules';

export function renderRibbonTrack(
  engine: CircosLayoutEngine,
  group: any,
  track: CircosTrack,
  innerR: number,
  opts: TrackRenderOptions,
): void {
  const color = track.color || '#8888cc';
  const ribbonOpacity = track.opacity ?? 0.4;
  const curveFactor = track.options?.curveFactor ?? 0.6;
  const ribbonData = track.data.filter(d => d.sourceChr && d.targetChr);

  const ribbons = group.selectAll('.circos-ribbon')
    .data(ribbonData)
    .join('path')
    .attr('class', 'circos-ribbon')
    .attr('d', (d: CircosDataPoint) => buildRibbonPath(engine, d, innerR, curveFactor))
    .attr('fill', (d: CircosDataPoint, i: number) => {
      const s = applyRules(d, i, track.rules, { color, opacity: ribbonOpacity, size: 0, show: true });
      return d.color || s.color;
    })
    .attr('stroke', (d: CircosDataPoint, i: number) => {
      const s = applyRules(d, i, track.rules, { color, opacity: ribbonOpacity, size: 0, show: true });
      return s.strokeColor || 'none';
    })
    .attr('stroke-width', 0.5)
    .attr('opacity', ribbonOpacity);

  if (opts.animate) {
    ribbons.attr('opacity', 0)
      .transition().duration(opts.duration * 0.5).delay(opts.duration * 0.7)
      .attr('opacity', ribbonOpacity);
  }

  if (opts.events && opts.seriesRef) {
    ribbons
      .on('mouseover', (event: MouseEvent, d: CircosDataPoint) => {
        (event.currentTarget as SVGElement).setAttribute('opacity', String(Math.min(ribbonOpacity + 0.3, 1)));
        opts.events.emit('point:mouseover', {
          point: { name: `${d.sourceChr}→${d.targetChr}`, custom: d },
          index: ribbonData.indexOf(d), series: opts.seriesRef, event,
          plotX: 0, plotY: 0,
        });
      })
      .on('mouseout', (event: MouseEvent, d: CircosDataPoint) => {
        (event.currentTarget as SVGElement).setAttribute('opacity', String(ribbonOpacity));
        opts.events.emit('point:mouseout', {
          point: { name: `${d.sourceChr}→${d.targetChr}` },
          index: ribbonData.indexOf(d), series: opts.seriesRef, event,
        });
      });
  }
}

function buildRibbonPath(
  engine: CircosLayoutEngine,
  d: CircosDataPoint,
  innerR: number,
  curveFactor: number,
): string {
  const r = innerR * 0.95;
  const cf = 1 - curveFactor;

  const sa0 = engine.getAngleForPosition(d.sourceChr!, d.sourceStart ?? 0) - Math.PI / 2;
  const sa1 = engine.getAngleForPosition(d.sourceChr!, d.sourceEnd ?? d.sourceStart ?? 0) - Math.PI / 2;
  const ta0 = engine.getAngleForPosition(d.targetChr!, d.targetStart ?? 0) - Math.PI / 2;
  const ta1 = engine.getAngleForPosition(d.targetChr!, d.targetEnd ?? d.targetStart ?? 0) - Math.PI / 2;

  const sx0 = r * Math.cos(sa0), sy0 = r * Math.sin(sa0);
  const sx1 = r * Math.cos(sa1), sy1 = r * Math.sin(sa1);
  const tx0 = r * Math.cos(ta0), ty0 = r * Math.sin(ta0);
  const tx1 = r * Math.cos(ta1), ty1 = r * Math.sin(ta1);

  const sla = Math.abs(sa1 - sa0) > Math.PI ? 1 : 0;
  const tla = Math.abs(ta1 - ta0) > Math.PI ? 1 : 0;

  return `M${sx0},${sy0}A${r},${r},0,${sla},1,${sx1},${sy1}`
    + `C${cf * sx1},${cf * sy1},${cf * tx0},${cf * ty0},${tx0},${ty0}`
    + `A${r},${r},0,${tla},1,${tx1},${ty1}`
    + `C${cf * tx1},${cf * ty1},${cf * sx0},${cf * sy0},${sx0},${sy0}Z`;
}

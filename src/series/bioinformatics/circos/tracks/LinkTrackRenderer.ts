/**
 * Link track renderer — thin bezier curves between genomic positions.
 * Batches by color for large link sets (>500).
 */

import { select } from 'd3-selection';
import 'd3-transition';
import type { CircosTrack, CircosDataPoint, TrackRenderOptions } from '../CircosTypes';
import type { CircosLayoutEngine } from '../CircosLayoutEngine';
import { applyRules } from '../CircosRules';

export function renderLinkTrack(
  engine: CircosLayoutEngine,
  group: any,
  track: CircosTrack,
  innerR: number,
  opts: TrackRenderOptions,
): void {
  const color = track.color || '#999999';
  const linkOpacity = track.opacity ?? 0.5;
  const linkData = track.data.filter(d => d.sourceChr && d.targetChr);

  if (linkData.length > 500) {
    renderLinkBatched(engine, group, linkData, innerR, color, linkOpacity, opts);
    return;
  }

  const links = group.selectAll('.circos-link')
    .data(linkData)
    .join('path')
    .attr('class', 'circos-link')
    .attr('d', (d: CircosDataPoint) => buildLinkPath(engine, d, innerR))
    .attr('fill', 'none')
    .attr('stroke', (d: CircosDataPoint, i: number) => {
      const s = applyRules(d, i, track.rules, { color, opacity: linkOpacity, size: 1.5, show: true });
      return d.color || s.color;
    })
    .attr('stroke-width', (d: CircosDataPoint, i: number) => {
      const s = applyRules(d, i, track.rules, { color, opacity: linkOpacity, size: 1.5, show: true });
      return s.show ? (s.strokeWidth ?? s.size) : 0;
    })
    .attr('opacity', linkOpacity);

  if (opts.animate) {
    links.each(function(this: any) {
      const pathEl = this as SVGPathElement;
      const totalLength = pathEl.getTotalLength?.() || 0;
      if (totalLength === 0) return;
      select(this)
        .attr('stroke-dasharray', `${totalLength} ${totalLength}`)
        .attr('stroke-dashoffset', totalLength)
        .transition().duration(opts.duration).delay(opts.baseDelay ?? 0)
        .attr('stroke-dashoffset', 0)
        .on('end', function() {
          select(this).attr('stroke-dasharray', null).attr('stroke-dashoffset', null);
        });
    });
  }
}

function renderLinkBatched(
  engine: CircosLayoutEngine,
  group: any,
  linkData: CircosDataPoint[],
  innerR: number,
  defaultColor: string,
  linkOpacity: number,
  opts: TrackRenderOptions,
): void {
  const colorGroups = new Map<string, string[]>();
  for (const d of linkData) {
    const c = d.color || defaultColor;
    if (!colorGroups.has(c)) colorGroups.set(c, []);
    colorGroups.get(c)!.push(buildLinkPath(engine, d, innerR));
  }

  for (const [c, paths] of colorGroups) {
    const combined = group.append('path')
      .attr('class', 'circos-link-batch')
      .attr('d', paths.join(''))
      .attr('fill', 'none')
      .attr('stroke', c)
      .attr('stroke-width', 1)
      .attr('opacity', linkOpacity);

    if (opts.animate) {
      const pathEl = combined.node() as SVGPathElement;
      const totalLength = pathEl?.getTotalLength?.() || 0;
      if (totalLength > 0) {
        combined
          .attr('stroke-dasharray', `${totalLength} ${totalLength}`)
          .attr('stroke-dashoffset', totalLength)
          .transition().duration(opts.duration).delay(opts.baseDelay ?? 0)
          .attr('stroke-dashoffset', 0)
          .on('end', function(this: any) {
            select(this).attr('stroke-dasharray', null).attr('stroke-dashoffset', null);
          });
      }
    }
  }
}

function buildLinkPath(engine: CircosLayoutEngine, d: CircosDataPoint, innerR: number): string {
  const srcAngle = engine.getAngleForPosition(d.sourceChr!, d.sourceStart ?? 0);
  const tgtAngle = engine.getAngleForPosition(d.targetChr!, d.targetStart ?? 0);
  const r = innerR * 0.95;
  const s = engine.polarToCartesian(srcAngle, r);
  const t = engine.polarToCartesian(tgtAngle, r);
  return `M${s.x},${s.y}Q0,0,${t.x},${t.y}`;
}

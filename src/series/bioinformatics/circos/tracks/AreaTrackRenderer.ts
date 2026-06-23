/**
 * Area track renderer — filled region between line trace and baseline.
 * Like line track but with fill between the trace and innerR/outerR.
 */

import type { CircosTrack, TrackRenderOptions } from '../CircosTypes';
import type { CircosLayoutEngine } from '../CircosLayoutEngine';

export function renderAreaTrack(
  engine: CircosLayoutEngine,
  group: any,
  track: CircosTrack,
  innerR: number,
  outerR: number,
  opts: TrackRenderOptions,
): void {
  const rScale = engine.createRadialScale(
    track.data.map(d => d.value ?? 0), innerR, outerR, track.logScale,
  );
  const color = track.color || '#27ae60';
  const fillColor = track.options?.fillColor || color;
  const fillOpacity = track.options?.fillOpacity ?? 0.3;
  const strokeWidth = track.options?.strokeWidth ?? 1.5;
  const baseline = track.options?.baseline === 'outer' ? outerR : innerR;

  const linePoints: string[] = [];
  const basePoints: string[] = [];

  for (let i = 0; i < track.data.length; i++) {
    const d = track.data[i];
    const angle = engine.getAngleForPosition(d.chr, d.start);
    const dataR = rScale(d.value ?? 0);
    const dataPos = engine.polarToCartesian(angle, dataR);
    const basePos = engine.polarToCartesian(angle, baseline);
    linePoints.push(`${dataPos.x},${dataPos.y}`);
    basePoints.push(`${basePos.x},${basePos.y}`);
  }

  const areaPath = `M${linePoints.join('L')}L${basePoints.reverse().join('L')}Z`;

  const area = group.append('path')
    .attr('class', 'circos-area-fill')
    .attr('d', areaPath)
    .attr('fill', fillColor)
    .attr('opacity', fillOpacity)
    .attr('stroke', 'none');

  const line = group.append('path')
    .attr('class', 'circos-area-line')
    .attr('d', `M${linePoints.join('L')}`)
    .attr('fill', 'none')
    .attr('stroke', color)
    .attr('stroke-width', strokeWidth)
    .attr('opacity', track.opacity ?? 1);

  if (opts.animate) {
    const bd = opts.baseDelay ?? 0;
    area.attr('opacity', 0)
      .transition().duration(opts.duration).delay(bd)
      .attr('opacity', fillOpacity);

    const totalLength = (line.node() as SVGPathElement)?.getTotalLength?.() ?? 1000;
    line
      .attr('stroke-dasharray', `${totalLength} ${totalLength}`)
      .attr('stroke-dashoffset', totalLength)
      .transition().duration(opts.duration).delay(bd)
      .attr('stroke-dashoffset', 0);
  }
}

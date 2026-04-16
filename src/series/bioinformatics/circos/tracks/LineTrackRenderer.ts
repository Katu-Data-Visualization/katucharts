/**
 * Line track renderer — continuous radial path connecting data points.
 * Animated via stroke-dasharray reveal.
 */

import type { CircosTrack, TrackRenderOptions } from '../CircosTypes';
import type { CircosLayoutEngine } from '../CircosLayoutEngine';

export function renderLineTrack(
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
  const color = track.color || '#2ecc71';

  const parts: string[] = new Array(track.data.length);
  for (let i = 0; i < track.data.length; i++) {
    const d = track.data[i];
    const pos = engine.polarToCartesian(
      engine.getAngleForPosition(d.chr, d.start),
      rScale(d.value ?? 0),
    );
    parts[i] = `${pos.x},${pos.y}`;
  }

  const path = group.append('path')
    .attr('d', `M${parts.join('L')}`)
    .attr('fill', 'none')
    .attr('stroke', color)
    .attr('stroke-width', track.options?.strokeWidth ?? 1.5)
    .attr('opacity', track.opacity ?? 1);

  if (opts.animate) {
    const totalLength = (path.node() as SVGPathElement)?.getTotalLength?.() ?? 1000;
    path
      .attr('stroke-dasharray', `${totalLength} ${totalLength}`)
      .attr('stroke-dashoffset', totalLength)
      .transition().duration(opts.duration).delay(opts.baseDelay ?? 0)
      .attr('stroke-dashoffset', 0);
  }
}

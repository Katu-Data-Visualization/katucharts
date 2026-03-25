/**
 * Lollipop track renderer — radial stems with dots at endpoints.
 * Standard in genomics for showing mutation/variant positions and their
 * significance (NG-Circos LOLLIPOP module equivalent).
 * Each point: thin radial line from baseline to value radius + circle dot.
 */

import type { CircosTrack, TrackRenderOptions } from '../CircosTypes';
import type { CircosLayoutEngine } from '../CircosLayoutEngine';
import { applyRules } from '../CircosRules';

export function renderLollipopTrack(
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
  const color = track.color || '#e74c3c';
  const dotRadius = track.options?.dotRadius ?? 3;
  const stemWidth = track.options?.stemWidth ?? 1;
  const stemColor = track.options?.stemColor || '#999';

  for (let i = 0; i < track.data.length; i++) {
    const d = track.data[i];
    const s = applyRules(d, i, track.rules, {
      color, opacity: track.opacity ?? 0.85, size: dotRadius, show: true,
    });
    if (!s.show) continue;

    const angle = engine.getAngleForPosition(d.chr, d.start);
    const valueR = rScale(d.value ?? 0);
    const basePos = engine.polarToCartesian(angle, innerR);
    const tipPos = engine.polarToCartesian(angle, valueR);

    group.append('line')
      .attr('class', 'circos-lollipop-stem')
      .attr('x1', basePos.x)
      .attr('y1', basePos.y)
      .attr('x2', tipPos.x)
      .attr('y2', tipPos.y)
      .attr('stroke', stemColor)
      .attr('stroke-width', stemWidth)
      .attr('opacity', s.opacity * 0.7);

    const dot = group.append('circle')
      .attr('class', 'circos-lollipop-dot')
      .attr('cx', tipPos.x)
      .attr('cy', tipPos.y)
      .attr('r', s.size)
      .attr('fill', d.color || s.color)
      .attr('stroke', '#fff')
      .attr('stroke-width', 0.5)
      .attr('opacity', s.opacity);

    if (opts.events && opts.seriesRef) {
      dot
        .style('cursor', 'pointer')
        .on('mouseover', (event: MouseEvent) => {
          (event.currentTarget as SVGElement).setAttribute('r', String(s.size * 1.5));
          opts.events.emit('point:mouseover', {
            point: { name: d.label || d.chr, x: d.start, y: d.value, custom: d },
            index: i, series: opts.seriesRef, event,
            plotX: 0, plotY: 0,
          });
        })
        .on('mouseout', (event: MouseEvent) => {
          (event.currentTarget as SVGElement).setAttribute('r', String(s.size));
          opts.events.emit('point:mouseout', {
            point: { name: d.label || d.chr, x: d.start, y: d.value },
            index: i, series: opts.seriesRef, event,
          });
        });
    }
  }

  if (opts.animate) {
    group.selectAll('.circos-lollipop-stem')
      .attr('opacity', 0)
      .transition().duration(opts.duration * 0.4).delay(opts.duration * 0.5)
      .attr('opacity', (track.opacity ?? 0.85) * 0.7);

    group.selectAll('.circos-lollipop-dot')
      .attr('r', 0)
      .transition().duration(opts.duration * 0.3).delay(opts.duration * 0.7)
      .attr('r', dotRadius);
  }
}

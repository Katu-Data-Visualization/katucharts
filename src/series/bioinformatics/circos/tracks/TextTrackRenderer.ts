/**
 * Text track renderer — rotated text labels at genomic positions.
 * Anti-overlap via sweep-line: sort by angle, push outward if collision.
 * Optional leader lines connecting label to original position.
 */

import type { CircosTrack, TrackRenderOptions } from '../CircosTypes';
import type { CircosLayoutEngine } from '../CircosLayoutEngine';

interface PlacedLabel {
  text: string;
  angle: number;
  baseRadius: number;
  placedRadius: number;
  x: number;
  y: number;
  point: any;
}

export function renderTextTrack(
  engine: CircosLayoutEngine,
  group: any,
  track: CircosTrack,
  innerR: number,
  outerR: number,
  opts: TrackRenderOptions,
): void {
  const fontSize = track.options?.fontSize ?? 8;
  const fontFamily = track.options?.fontFamily ?? 'sans-serif';
  const showLeaderLines = track.options?.showLeaderLines !== false;
  const maxLabels = track.options?.maxLabels ?? 200;
  const snuggleDistance = track.options?.snuggleDistance ?? 12;
  const color = track.color || '#333';

  const labelData = track.data
    .filter(d => d.label)
    .slice(0, maxLabels)
    .map(d => ({
      text: d.label!,
      angle: engine.getAngleForPosition(d.chr, d.start),
      baseRadius: (innerR + outerR) / 2,
      point: d,
    }))
    .sort((a, b) => a.angle - b.angle);

  const placed: PlacedLabel[] = [];
  const minAngularGap = (fontSize * 1.2) / ((innerR + outerR) / 2);

  for (const label of labelData) {
    let radius = label.baseRadius;
    let collision = true;

    while (collision && radius < outerR + snuggleDistance * 5) {
      collision = false;
      for (const p of placed) {
        const angDiff = Math.abs(label.angle - p.angle);
        const rDiff = Math.abs(radius - p.placedRadius);
        if (angDiff < minAngularGap && rDiff < snuggleDistance) {
          collision = true;
          radius += snuggleDistance;
          break;
        }
      }
    }

    const pos = engine.polarToCartesian(label.angle, radius);
    placed.push({
      text: label.text,
      angle: label.angle,
      baseRadius: label.baseRadius,
      placedRadius: radius,
      x: pos.x, y: pos.y,
      point: label.point,
    });
  }

  if (showLeaderLines) {
    const displaced = placed.filter(p => Math.abs(p.placedRadius - p.baseRadius) > 2);
    group.selectAll('.circos-text-leader')
      .data(displaced)
      .join('line')
      .attr('class', 'circos-text-leader')
      .attr('x1', (d: PlacedLabel) => engine.polarToCartesian(d.angle, d.baseRadius).x)
      .attr('y1', (d: PlacedLabel) => engine.polarToCartesian(d.angle, d.baseRadius).y)
      .attr('x2', (d: PlacedLabel) => d.x)
      .attr('y2', (d: PlacedLabel) => d.y)
      .attr('stroke', '#aaa')
      .attr('stroke-width', 0.5)
      .attr('opacity', 0.6);
  }

  const labels = group.selectAll('.circos-text')
    .data(placed)
    .join('text')
    .attr('class', 'circos-text')
    .attr('transform', (d: PlacedLabel) => {
      const angleDeg = d.angle * 180 / Math.PI - 90;
      const flip = angleDeg > 90 && angleDeg < 270;
      return `translate(${d.x},${d.y}) rotate(${flip ? angleDeg + 180 : angleDeg})`;
    })
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'central')
    .attr('font-size', `${fontSize}px`)
    .attr('font-family', fontFamily)
    .attr('fill', (d: PlacedLabel) => d.point.color || color)
    .text((d: PlacedLabel) => d.text);

  if (opts.animate) {
    labels.attr('opacity', 0)
      .transition().duration(opts.duration * 0.4).delay(opts.duration * 0.6)
      .attr('opacity', 1);
  }
}

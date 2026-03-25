/**
 * Connector track renderer — simple connecting lines between positions.
 * Types: straight, elbow (radial→angular), bezier.
 */

import type { CircosTrack, CircosDataPoint, TrackRenderOptions, ConnectorType } from '../CircosTypes';
import type { CircosLayoutEngine } from '../CircosLayoutEngine';

export function renderConnectorTrack(
  engine: CircosLayoutEngine,
  group: any,
  track: CircosTrack,
  innerR: number,
  outerR: number,
  opts: TrackRenderOptions,
): void {
  const color = track.color || '#666';
  const connType: ConnectorType = (track.options?.connectorType as ConnectorType) ?? 'bezier';
  const strokeWidth = track.options?.strokeWidth ?? 1;
  const dashArray = track.options?.dashArray ?? '';
  const showArrows = track.options?.showArrows ?? false;
  const midR = (innerR + outerR) / 2;

  const connData = track.data.filter(d => d.sourceChr && d.targetChr);

  if (showArrows) {
    const defs = group.append('defs');
    defs.append('marker')
      .attr('id', 'circos-conn-arrow')
      .attr('viewBox', '0 0 10 10')
      .attr('refX', 8)
      .attr('refY', 5)
      .attr('markerWidth', 5)
      .attr('markerHeight', 5)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,0L10,5L0,10Z')
      .attr('fill', color);
  }

  const conns = group.selectAll('.circos-connector')
    .data(connData)
    .join('path')
    .attr('class', 'circos-connector')
    .attr('d', (d: CircosDataPoint) => buildConnectorPath(engine, d, midR, connType))
    .attr('fill', 'none')
    .attr('stroke', (d: CircosDataPoint) => d.color || color)
    .attr('stroke-width', strokeWidth)
    .attr('stroke-dasharray', dashArray)
    .attr('opacity', track.opacity ?? 0.7);

  if (showArrows) {
    conns.attr('marker-end', 'url(#circos-conn-arrow)');
  }

  if (opts.animate) {
    conns.attr('opacity', 0)
      .transition().duration(opts.duration * 0.4).delay(opts.duration * 0.6)
      .attr('opacity', track.opacity ?? 0.7);
  }
}

function buildConnectorPath(
  engine: CircosLayoutEngine,
  d: CircosDataPoint,
  radius: number,
  type: ConnectorType,
): string {
  const srcAngle = engine.getAngleForPosition(d.sourceChr!, d.sourceStart ?? 0);
  const tgtAngle = engine.getAngleForPosition(d.targetChr!, d.targetStart ?? 0);
  const s = engine.polarToCartesian(srcAngle, radius);
  const t = engine.polarToCartesian(tgtAngle, radius);

  switch (type) {
    case 'straight':
      return `M${s.x},${s.y}L${t.x},${t.y}`;

    case 'elbow': {
      const midAngle = (srcAngle + tgtAngle) / 2;
      const innerMid = engine.polarToCartesian(midAngle, radius * 0.7);
      return `M${s.x},${s.y}L${innerMid.x},${innerMid.y}L${t.x},${t.y}`;
    }

    case 'bezier':
    default:
      return `M${s.x},${s.y}Q0,0,${t.x},${t.y}`;
  }
}

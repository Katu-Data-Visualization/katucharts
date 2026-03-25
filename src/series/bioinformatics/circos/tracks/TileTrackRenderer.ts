/**
 * Tile track renderer — region span annotations as small arcs with auto-layering.
 * Greedy layer assignment to avoid overlap within each chromosome.
 */

import { arc as d3Arc } from 'd3-shape';
import type { CircosTrack, CircosDataPoint, TrackRenderOptions } from '../CircosTypes';
import type { CircosLayoutEngine } from '../CircosLayoutEngine';
import { applyRules } from '../CircosRules';

const TILE_COLORS = [
  '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
  '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf',
];

export function renderTileTrack(
  engine: CircosLayoutEngine,
  group: any,
  track: CircosTrack,
  innerR: number,
  outerR: number,
  opts: TrackRenderOptions,
): void {
  const maxLayers = track.options?.maxLayers ?? 5;
  const margin = track.options?.margin ?? 1;
  const orientation = track.options?.orientation ?? 'out';
  const color = track.color || '#1f77b4';

  const sorted = [...track.data].sort((a, b) => {
    if (a.chr !== b.chr) return a.chr.localeCompare(b.chr);
    return a.start - b.start;
  });

  const layers: { chr: string; end: number }[][] = Array.from({ length: maxLayers }, () => []);

  const assigned: { point: CircosDataPoint; layer: number }[] = [];
  for (const d of sorted) {
    let placed = false;
    for (let li = 0; li < maxLayers; li++) {
      const layer = layers[li];
      const lastInChr = [...layer].reverse().find(e => e.chr === d.chr);
      if (!lastInChr || lastInChr.end <= d.start) {
        layer.push({ chr: d.chr, end: d.end ?? d.start });
        assigned.push({ point: d, layer: li });
        placed = true;
        break;
      }
    }
    if (!placed) {
      assigned.push({ point: d, layer: maxLayers - 1 });
    }
  }

  const layerHeight = (outerR - innerR - margin * (maxLayers - 1)) / maxLayers;

  const tileData = assigned.map(({ point, layer }) => {
    let tInner: number, tOuter: number;
    if (orientation === 'in') {
      tOuter = outerR - layer * (layerHeight + margin);
      tInner = tOuter - layerHeight;
    } else {
      tInner = innerR + layer * (layerHeight + margin);
      tOuter = tInner + layerHeight;
    }
    return {
      startAngle: engine.getAngleForPosition(point.chr, point.start),
      endAngle: engine.getAngleForPosition(point.chr, point.end ?? point.start),
      innerR: tInner,
      outerR: tOuter,
      point,
      layer,
    };
  });

  const arcGen = d3Arc<any>()
    .innerRadius(d => d.innerR)
    .outerRadius(d => d.outerR)
    .startAngle(d => d.startAngle)
    .endAngle(d => d.endAngle)
    .cornerRadius(2);

  const tiles = group.selectAll('.circos-tile')
    .data(tileData)
    .join('path')
    .attr('class', 'circos-tile')
    .attr('d', arcGen)
    .attr('fill', (d: any, i: number) => {
      const s = applyRules(d.point, i, track.rules, { color, opacity: track.opacity ?? 0.75, size: 0, show: true });
      return d.point.color || s.color || TILE_COLORS[d.layer % TILE_COLORS.length];
    })
    .attr('stroke', '#fff')
    .attr('stroke-width', 0.3)
    .attr('opacity', (d: any, i: number) => {
      const s = applyRules(d.point, i, track.rules, { color, opacity: track.opacity ?? 0.75, size: 0, show: true });
      return s.show ? s.opacity : 0;
    });

  if (opts.animate) {
    tiles.attr('opacity', 0)
      .transition().duration(opts.duration * 0.4).delay(opts.duration * 0.5)
      .attr('opacity', track.opacity ?? 0.75);
  }
}

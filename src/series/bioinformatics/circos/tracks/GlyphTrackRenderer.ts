/**
 * Glyph track renderer — custom d3-shape symbols at angular+radial positions.
 * Supports: circle, triangle-up/down, diamond, square, cross, star.
 */

import {
  symbolCircle, symbolTriangle, symbolDiamond,
  symbolSquare, symbolCross, symbolStar, symbol as d3Symbol,
} from 'd3-shape';
import type { CircosTrack, GlyphSymbol, TrackRenderOptions } from '../CircosTypes';
import type { CircosLayoutEngine } from '../CircosLayoutEngine';
import { applyRules } from '../CircosRules';

const SYMBOL_MAP: Record<GlyphSymbol, any> = {
  'circle': symbolCircle,
  'triangle-up': symbolTriangle,
  'triangle-down': symbolTriangle,
  'diamond': symbolDiamond,
  'square': symbolSquare,
  'cross': symbolCross,
  'star': symbolStar,
};

export function renderGlyphTrack(
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
  const defaultSymbol: GlyphSymbol = (track.options?.symbol as GlyphSymbol) ?? 'circle';
  const glyphSize = track.options?.size ?? 30;

  const glyphs = group.selectAll('.circos-glyph')
    .data(track.data)
    .join('path')
    .attr('class', 'circos-glyph')
    .attr('transform', (d: any) => {
      const angle = engine.getAngleForPosition(d.chr, d.start);
      const r = rScale(d.value ?? 0);
      const pos = engine.polarToCartesian(angle, r);
      const rotDeg = angle * 180 / Math.PI - 90;
      const sym = d.symbol || defaultSymbol;
      const extraRot = sym === 'triangle-down' ? 180 : 0;
      return `translate(${pos.x},${pos.y}) rotate(${rotDeg + extraRot})`;
    })
    .attr('d', (d: any, i: number) => {
      const s = applyRules(d, i, track.rules, { color, opacity: track.opacity ?? 0.8, size: glyphSize, show: true });
      const sym: GlyphSymbol = s.symbol || d.symbol || defaultSymbol;
      const symType = SYMBOL_MAP[sym as GlyphSymbol] || symbolCircle;
      return d3Symbol().type(symType).size(s.show ? s.size : 0)();
    })
    .attr('fill', (d: any, i: number) => {
      const s = applyRules(d, i, track.rules, { color, opacity: track.opacity ?? 0.8, size: glyphSize, show: true });
      return d.color || s.color;
    })
    .attr('opacity', (d: any, i: number) => {
      const s = applyRules(d, i, track.rules, { color, opacity: track.opacity ?? 0.8, size: glyphSize, show: true });
      return s.opacity;
    });

  if (opts.animate) {
    glyphs.attr('opacity', 0)
      .transition().duration(opts.duration).delay(opts.baseDelay ?? 0)
      .attr('opacity', track.opacity ?? 0.8);
  }
}

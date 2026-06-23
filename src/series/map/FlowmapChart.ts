import { select } from 'd3-selection';
import 'd3-transition';
import { BaseSeries } from '../BaseSeries';
import type { InternalSeriesConfig } from '../../types/options';
import { ENTRY_DURATION, HOVER_DURATION, EASE_ENTRY, EASE_HOVER } from '../../core/animationConstants';
import { createMapProjection, applyGlobeProjection, isGlobeProjection, pointLonLat } from './mapProjection';

type XY = [number, number];

/**
 * `flowmap` series — draws directional, tapered, curved flow bands between two
 * geographic endpoints. Endpoints (`from`/`to`) may be `[lon, lat]` pairs or
 * the `id` of a point in a sibling `mappoint` series; either way they are
 * projected through the same projection as the basemap. Band thickness scales
 * with each link's `weight`, and an arrowhead marks the destination. Mirrors
 * the `flowmap` series type.
 */
export class FlowmapChart extends BaseSeries {
  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  private resolveMapData(): any {
    const cfg = this.config as any;
    if (cfg.mapData) return cfg.mapData;
    for (const s of this.context.allSeries || []) {
      const sc = (s as any).config;
      if (s !== this && sc?.mapData) return sc.mapData;
    }
    return null;
  }

  /** Maps point ids (from sibling `mappoint`/`map` series) to `[lon, lat]`. */
  private buildIdMap(): Map<string, XY> {
    const idMap = new Map<string, XY>();
    for (const s of this.context.allSeries || []) {
      if (s === this) continue;
      for (const p of s.data) {
        const ll = pointLonLat(p);
        const id = (p as any).id ?? (p as any).name;
        if (id != null && ll) idMap.set(String(id), ll);
      }
    }
    return idMap;
  }

  private resolveEndpoint(ep: any, idMap: Map<string, XY>): XY | null {
    if (ep == null) return null;
    if (Array.isArray(ep) && typeof ep[0] === 'number') return [ep[0], ep[1]];
    if (typeof ep === 'object') return pointLonLat(ep);
    return idMap.get(String(ep)) || null;
  }

  render(): void {
    const cfg = this.config as any;
    const { plotArea } = this.context;
    const mapData = this.resolveMapData();
    if (!mapData) return;

    const { projection, projName } = createMapProjection(mapData, cfg.projection, plotArea, cfg.mapDataObject);
    if (isGlobeProjection(projName, cfg)) applyGlobeProjection(projection, plotArea);

    const idMap = this.buildIdMap();
    const layer = this.group.append('g').attr('class', 'katucharts-mapzoom katucharts-flowmap-layer');

    const seriesColor = cfg.color || this.getColor();
    const fillOpacity = cfg.fillOpacity ?? 0.5;
    const curveFactor = cfg.curveFactor ?? 0.3;
    const drawArrow = cfg.markerEnd?.enabled !== false;
    const animate = this.context.animate;

    const weights = this.data.map((p: any) => p.weight ?? p.y ?? p.value ?? 1);
    const maxWeight = Math.max(...weights, 1);
    const baseWidth = cfg.width != null ? (cfg.width <= 1 ? cfg.width * 40 : cfg.width) : 16;

    this.data.forEach((point, index) => {
      const p = point as any;
      const fromLL = this.resolveEndpoint(p.from, idMap);
      const toLL = this.resolveEndpoint(p.to, idMap);
      if (!fromLL || !toLL) return;
      if (p.name == null && typeof p.from === 'string' && typeof p.to === 'string') {
        p.name = `${p.from} → ${p.to}`;
      }

      const S = projection(fromLL as XY);
      const T = projection(toLL as XY);
      if (!S || !T || !isFinite(S[0]) || !isFinite(T[0])) return;

      const weight = p.weight ?? p.y ?? p.value ?? 1;
      const endWidth = Math.max(2, baseWidth * (weight / maxWeight));
      const pColor = p.color || seriesColor;

      const { d, mid, tip, tipAngle } = this.buildFlowPath(S as XY, T as XY, endWidth, curveFactor);

      const path = layer.append('path')
        .attr('class', 'katucharts-flowmap-link')
        .attr('d', d)
        .attr('fill', pColor)
        .attr('fill-opacity', animate ? 0 : fillOpacity)
        .attr('stroke', 'none')
        .style('cursor', cfg.cursor || 'pointer');

      if (animate) {
        path.transition().duration(ENTRY_DURATION).delay(index * 30).ease(EASE_ENTRY).attr('fill-opacity', fillOpacity);
      }

      if (drawArrow) {
        const ah = endWidth * 1.1 + 3;
        const arrow = layer.append('path')
          .attr('class', 'katucharts-flowmap-arrow')
          .attr('d', this.arrowHead(tip, tipAngle, ah))
          .attr('fill', pColor)
          .attr('fill-opacity', animate ? 0 : fillOpacity)
          .style('pointer-events', 'none');
        if (animate) {
          arrow.transition().duration(ENTRY_DURATION).delay(index * 30).ease(EASE_ENTRY).attr('fill-opacity', fillOpacity);
        }
      }

      path
        .on('mouseover', (event: MouseEvent) => {
          select(event.currentTarget as SVGPathElement)
            .transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER).attr('fill-opacity', Math.min(1, fillOpacity + 0.3));
          this.context.events.emit('point:mouseover', {
            point, index, series: this, event, plotX: mid[0], plotY: mid[1],
          });
          p.events?.mouseOver?.call(point, event);
        })
        .on('mouseout', (event: MouseEvent) => {
          select(event.currentTarget as SVGPathElement)
            .transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER).attr('fill-opacity', fillOpacity);
          this.context.events.emit('point:mouseout', { point, index, series: this, event });
          p.events?.mouseOut?.call(point, event);
        })
        .on('click', (event: MouseEvent) => {
          this.context.events.emit('point:click', { point, index, series: this, event });
          p.events?.click?.call(point, event);
          cfg.point?.events?.click?.call(point, event);
          cfg.events?.click?.call(this, event);
        });
    });
  }

  /**
   * Builds a tapered, curved band from `S` (narrow origin) to `T` (full width
   * at the destination). The centerline is a quadratic Bézier bowed sideways by
   * `curveFactor`; the band outline samples that curve and offsets each sample
   * along its normal by a half-width that grows from origin to destination.
   */
  private buildFlowPath(S: XY, T: XY, endWidth: number, curveFactor: number) {
    const dx = T[0] - S[0];
    const dy = T[1] - S[1];
    const dist = Math.hypot(dx, dy) || 1;
    const nx = -dy / dist;
    const ny = dx / dist;
    const C: XY = [(S[0] + T[0]) / 2 + nx * curveFactor * dist, (S[1] + T[1]) / 2 + ny * curveFactor * dist];

    const N = 24;
    const startHalf = Math.max(0.6, endWidth * 0.12);
    const endHalf = endWidth / 2;
    const left: XY[] = [];
    const right: XY[] = [];
    let prev: XY = S;

    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const mt = 1 - t;
      const bx = mt * mt * S[0] + 2 * mt * t * C[0] + t * t * T[0];
      const by = mt * mt * S[1] + 2 * mt * t * C[1] + t * t * T[1];
      const tx = bx - prev[0];
      const ty = by - prev[1];
      const tl = Math.hypot(tx, ty) || 1;
      const pnx = -ty / tl;
      const pny = tx / tl;
      const half = startHalf + (endHalf - startHalf) * t;
      left.push([bx + pnx * half, by + pny * half]);
      right.push([bx - pnx * half, by - pny * half]);
      prev = [bx, by];
    }

    const midX = 0.25 * S[0] + 0.5 * C[0] + 0.25 * T[0];
    const midY = 0.25 * S[1] + 0.5 * C[1] + 0.25 * T[1];
    const tipAngle = Math.atan2(T[1] - C[1], T[0] - C[0]);

    const d = 'M' + left.map(pt => `${pt[0].toFixed(2)},${pt[1].toFixed(2)}`).join('L')
      + 'L' + right.reverse().map(pt => `${pt[0].toFixed(2)},${pt[1].toFixed(2)}`).join('L') + 'Z';

    return { d, mid: [midX, midY] as XY, tip: T, tipAngle };
  }

  private arrowHead(tip: XY, angle: number, size: number): string {
    const a = angle;
    const back = a + Math.PI;
    const spread = 0.5;
    const p1: XY = [tip[0] + Math.cos(a) * size * 0.6, tip[1] + Math.sin(a) * size * 0.6];
    const p2: XY = [tip[0] + Math.cos(back + spread) * size, tip[1] + Math.sin(back + spread) * size];
    const p3: XY = [tip[0] + Math.cos(back - spread) * size, tip[1] + Math.sin(back - spread) * size];
    return `M${p1[0].toFixed(2)},${p1[1].toFixed(2)}L${p2[0].toFixed(2)},${p2[1].toFixed(2)}L${p3[0].toFixed(2)},${p3[1].toFixed(2)}Z`;
  }

  getDataExtents() {
    return { xMin: 0, xMax: 0, yMin: 0, yMax: 0 };
  }
}

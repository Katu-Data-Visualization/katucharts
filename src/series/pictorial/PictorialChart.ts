/**
 * Pictorial series — a stacked column whose fill is masked to a custom SVG
 * silhouette. Each category supplies one or more path definitions; the stacked
 * segments fill the silhouette from the baseline upward, so the shape reads as a
 * proportional gauge. Works with `stacking: 'percent'` (fill by share of total)
 * or `stacking: 'normal'` (fill by value against the axis range).
 */

import { select } from 'd3-selection';
import 'd3-transition';
import { ColumnChart } from '../cartesian/ColumnChart';
import type { PointOptions } from '../../types/options';

interface PictorialPath {
  definition: string;
}

export class PictorialChart extends ColumnChart {
  render(): void {
    this.group.selectAll('*').remove();

    const paths = this.getPaths();
    if (!paths.length) {
      super.render();
      return;
    }

    const { xAxis, yAxis } = this.context;
    const data = this.data;
    const color = this.getColor();
    const animate = this.context.animate;

    const stacking = this.config.stacking;
    const isPercent = stacking === 'percent';
    const stackOffsetsPos = this.context.stackOffsetsPos;
    const stackOffsetsNeg = this.context.stackOffsetsNeg;
    const offsetFor = (d: PointOptions): number =>
      (((d.y ?? 0) < 0 ? stackOffsetsNeg?.get(d.x ?? 0) : stackOffsetsPos?.get(d.x ?? 0)) || 0);
    const totals = this.context.stackTotals;
    const percentTotals = isPercent ? totals : undefined;

    if (stacking) {
      for (const d of data) {
        const xKey = d.x ?? 0;
        if (totals) {
          (d as any).total = totals.get(xKey) || 0;
          (d as any).stackTotal = totals.get(xKey) || 0;
        }
        if (isPercent && totals) {
          const t = totals.get(xKey) || 1;
          (d as any).percentage = ((d.y ?? 0) / t) * 100;
        }
      }
    }

    const getStackedY = (d: PointOptions): number => {
      const xKey = d.x ?? 0;
      const offset = offsetFor(d);
      const val = d.y ?? 0;
      if (isPercent && percentTotals) {
        const total = percentTotals.get(xKey) || 1;
        return ((offset + val) / total) * 100;
      }
      return offset + val;
    };

    const getStackedBase = (d: PointOptions): number => {
      const xKey = d.x ?? 0;
      const offset = offsetFor(d);
      if (isPercent && percentTotals) {
        const total = percentTotals.get(xKey) || 1;
        return (offset / total) * 100;
      }
      return offset;
    };

    const { barWidth, barOffset } = this.computeBarGeometry();

    const topValue = this.getAxisTopValue(isPercent);
    const bandBottom = yAxis.getPixelForValue(0);
    const bandHeight = Math.abs(yAxis.getPixelForValue(topValue) - bandBottom);

    const defs = this.group.append('defs');
    const shadowEnabled = !!(yAxis as any).config?.stackShadow?.enabled;
    const isBottomSeries = (this.context.indexInType ?? 0) === 0;

    const segments = this.group.selectAll<SVGRectElement, PointOptions>('.katucharts-pictorial-segment')
      .data(data)
      .join('rect')
      .attr('class', 'katucharts-pictorial-segment katucharts-column')
      .attr('fill', (d: PointOptions, i: number) => this.getPointColor(d, i, color))
      .attr('stroke', (d: any) => d.borderColor || this.config.borderColor || 'none')
      .attr('stroke-width', (d: any) => d.borderWidth ?? this.config.borderWidth ?? 0)
      .attr('display', (d: PointOptions) => (d.y == null ? 'none' : null));

    const dur = this.getEntryDuration();

    segments.each((d: PointOptions, i: number, nodes: ArrayLike<SVGRectElement>) => {
      const el = select(nodes[i]);
      if (d.y == null) return;

      const slotX = xAxis.getPixelForValue(d.x ?? i) + barOffset;
      const def = paths[i % paths.length]?.definition;
      if (!def) {
        el.attr('display', 'none');
        return;
      }

      const sil = this.computeSilhouette(def, slotX, barWidth, bandBottom, bandHeight, topValue);
      const clipId = `katucharts-pictorial-${this.config.index}-${i}`;
      defs.append('clipPath')
        .attr('id', clipId)
        .attr('clipPathUnits', 'userSpaceOnUse')
        .append('path')
        .attr('d', def)
        .attr('transform', sil.transform);

      if (shadowEnabled && isBottomSeries) {
        this.group.insert('path', ':first-child')
          .attr('class', 'katucharts-pictorial-shadow')
          .attr('d', def)
          .attr('transform', sil.transform)
          .attr('fill', this.shadowFill())
          .attr('pointer-events', 'none');
      }

      const yTop = sil.pixelFor(getStackedY(d));
      const yBase = sil.pixelFor(getStackedBase(d));
      const segTop = Math.min(yTop, yBase);
      const segH = Math.abs(yTop - yBase);
      (d as any)._labelX = sil.left + sil.width / 2;
      (d as any)._labelY = (yTop + yBase) / 2;

      el.attr('x', sil.left)
        .attr('width', sil.width)
        .attr('clip-path', `url(#${clipId})`);

      if (animate) {
        el.attr('y', bandBottom).attr('height', 0)
          .transition().duration(dur)
          .attr('y', segTop)
          .attr('height', segH);
      } else {
        el.attr('y', segTop).attr('height', segH);
      }
    });

    this.attachHoverEffects(segments, data);
    this.renderPictorialLabels(data);
  }

  /**
   * Draws the value labels centered within each stacked segment so they read on
   * top of the filled silhouette instead of piling up at the segment edges.
   */
  private renderPictorialLabels(data: PointOptions[]): void {
    if (!this.config.dataLabels?.enabled) return;
    this.renderDataLabels(
      data,
      (d) => (d as any)._labelX ?? 0,
      (d) => (d as any)._labelY ?? 0
    );
  }

  animateUpdate(): void {
    this.render();
  }

  private getPaths(): PictorialPath[] {
    const raw = (this.config as any).paths;
    if (Array.isArray(raw)) return raw.filter((p: any) => p && typeof p.definition === 'string');
    return [];
  }

  /** The value the silhouette's top edge maps to (100 for percent stacks, else the axis max). */
  private getAxisTopValue(isPercent: boolean): number {
    const dom = (this.context.yAxis as any).scale?.domain?.();
    const top = Array.isArray(dom) && dom.length ? Number(dom[dom.length - 1]) : NaN;
    if (Number.isFinite(top) && top !== 0) return top;
    return isPercent ? 100 : 1;
  }

  /**
   * Places a silhouette inside the column slot preserving its aspect ratio. The
   * path is scaled to fill the full value-axis band height — so a vertical gauge
   * uses all the available height with no top/bottom gap — and centered
   * horizontally within the slot. The natural width that results is not clipped
   * (pictorial opts out of the plot clip), so the shape keeps its proportions.
   * The returned value→pixel mapper is anchored to the band, so a stacked share
   * of X% fills X% of the shape's height.
   */
  private computeSilhouette(
    def: string,
    slotX: number,
    slotWidth: number,
    bandBottom: number,
    bandHeight: number,
    topValue: number
  ): { transform: string; pixelFor: (v: number) => number; left: number; width: number } {
    const probe = this.group.append('path').attr('d', def).attr('visibility', 'hidden');
    const node = probe.node() as SVGPathElement | null;
    const bb = node?.getBBox?.();
    probe.remove();
    const bandTop = bandBottom - bandHeight;
    const pixelFor = (v: number) => bandBottom - (v / topValue) * bandHeight;
    if (!bb || bb.width === 0 || bb.height === 0) {
      return { transform: `translate(${slotX},${bandTop})`, pixelFor, left: slotX, width: slotWidth };
    }
    const scale = bandHeight / bb.height;
    const drawnWidth = bb.width * scale;
    const offsetX = slotX + (slotWidth - drawnWidth) / 2;
    return {
      transform: `translate(${offsetX},${bandTop}) scale(${scale}) translate(${-bb.x},${-bb.y})`,
      pixelFor,
      left: offsetX,
      width: drawnWidth,
    };
  }

  private shadowFill(): string {
    return this.autoBorderColor() === '#ffffff' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.10)';
  }
}

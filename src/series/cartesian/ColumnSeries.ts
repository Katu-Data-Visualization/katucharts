/**
 * Column and Bar series with features: grouping,
 * stacking (normal/percent), negativeColor, maxPointWidth, minPointLength,
 * pointWidth, crisp pixel snapping, data labels, shadow, and animated updates.
 */

import { select } from 'd3-selection';
import 'd3-transition';
import { interpolate } from 'd3-interpolate';
import { BaseSeries, brightenColor, staggerDelay } from '../BaseSeries';
import type { InternalSeriesConfig, PointOptions, BorderRadiusOptions } from '../../types/options';
import { CategoryAxis } from '../../axis/Axis';
import {
  ENTRY_DURATION,
  ENTRY_STAGGER_PER_ITEM,
  HOVER_DURATION,
  HOVER_INACTIVE_DURATION,
  EASE_ENTRY,
  EASE_HOVER,
} from '../../core/animationConstants';

interface RectParams { x: number; y: number; w: number; h: number; }

function resolveBorderRadius(val: number | BorderRadiusOptions | undefined): number {
  if (val === undefined) return 4;
  if (typeof val === 'number') return val;
  return val.radius ?? 4;
}

function roundedRectPath(
  x: number, y: number, w: number, h: number, r: number,
  top: boolean, bottom: boolean,
): string {
  if (w <= 0 || h <= 0) return `M${x},${y}H${x}V${y}Z`;
  const rt = top ? Math.min(r, w / 2, h / 2) : 0;
  const rb = bottom ? Math.min(r, w / 2, h / 2) : 0;
  return `M${x + rt},${y}`
    + `H${x + w - rt}`
    + (rt ? `A${rt},${rt},0,0,1,${x + w},${y + rt}` : `L${x + w},${y}`)
    + `V${y + h - rb}`
    + (rb ? `A${rb},${rb},0,0,1,${x + w - rb},${y + h}` : `L${x + w},${y + h}`)
    + `H${x + rb}`
    + (rb ? `A${rb},${rb},0,0,1,${x},${y + h - rb}` : `L${x},${y + h}`)
    + `V${y + rt}`
    + (rt ? `A${rt},${rt},0,0,1,${x + rt},${y}` : `L${x},${y}`)
    + 'Z';
}

function roundedRectPathH(
  x: number, y: number, w: number, h: number, r: number,
  right: boolean, left: boolean,
): string {
  if (w <= 0 || h <= 0) return `M${x},${y}H${x}V${y}Z`;
  const rr = right ? Math.min(r, w / 2, h / 2) : 0;
  const rl = left ? Math.min(r, w / 2, h / 2) : 0;
  return `M${x + rl},${y}`
    + `H${x + w - rr}`
    + (rr ? `A${rr},${rr},0,0,1,${x + w},${y + rr}` : `L${x + w},${y}`)
    + `V${y + h - rr}`
    + (rr ? `A${rr},${rr},0,0,1,${x + w - rr},${y + h}` : `L${x + w},${y + h}`)
    + `H${x + rl}`
    + (rl ? `A${rl},${rl},0,0,1,${x},${y + h - rl}` : `L${x},${y + h}`)
    + `V${y + rl}`
    + (rl ? `A${rl},${rl},0,0,1,${x + rl},${y}` : `L${x},${y}`)
    + 'Z';
}

export class ColumnSeries extends BaseSeries {
  protected isHorizontal = false;

  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  private getEntryDuration(): number {
    const animOpts = typeof this.config.animation === 'object' ? this.config.animation : {};
    return animOpts.duration ?? ENTRY_DURATION;
  }

  render(): void {
    this.group.selectAll('.katucharts-data-labels').remove();

    const { xAxis, yAxis, plotArea } = this.context;
    const color = this.getColor();
    const data = this.data;
    const animate = this.context.animate;

    const { barWidth, barOffset, baseline } = this.computeBarGeometry();
    const stacking = this.config.stacking;
    const stackOffsets = this.context.stackOffsets;
    const isPercent = stacking === 'percent';

    const percentTotals = isPercent ? this.context.stackTotals : undefined;

    const getStackedY = (d: PointOptions): number => {
      const xKey = d.x ?? 0;
      const offset = stackOffsets?.get(xKey) || 0;
      const val = d.y ?? 0;
      if (isPercent && percentTotals) {
        const total = percentTotals.get(xKey) || 1;
        return ((offset + val) / total) * 100;
      }
      return offset + val;
    };

    const getStackedBase = (d: PointOptions): number => {
      const xKey = d.x ?? 0;
      const offset = stackOffsets?.get(xKey) || 0;
      if (isPercent && percentTotals) {
        const total = percentTotals.get(xKey) || 1;
        return (offset / total) * 100;
      }
      return offset;
    };

    if (stacking) {
      const totals = this.context.stackTotals;
      for (const d of data) {
        const xKey = d.x ?? 0;
        if (totals) {
          (d as any).total = totals.get(xKey) || 0;
        }
        if (isPercent && totals) {
          const t = totals.get(xKey) || 1;
          (d as any).percentage = ((d.y ?? 0) / t) * 100;
        }
      }
    }

    const minPointLength = this.config.minPointLength ?? 0;
    const crisp = this.config.crisp !== false;

    const borderRadius = resolveBorderRadius(this.config.borderRadius);

    if (stacking) {
      const bars = this.group.selectAll('.katucharts-column')
        .data(data)
        .join('path')
        .attr('class', 'katucharts-column')
        .attr('stroke', this.config.borderColor || 'none')
        .attr('stroke-width', this.config.borderWidth ?? 0);
      this.renderStackedBars(bars, data, barWidth, barOffset, getStackedY, getStackedBase, color, minPointLength, crisp, !!animate, borderRadius);
      this.attachHoverEffects(bars, data);
      this.renderColumnDataLabels(data, barWidth, barOffset, baseline, getStackedY, getStackedBase);
      if (animate) this.emitAfterAnimate(ENTRY_DURATION + data.length * ENTRY_STAGGER_PER_ITEM);
      return;
    }

    const bars = this.group.selectAll('.katucharts-column')
      .data(data)
      .join('rect')
      .attr('class', 'katucharts-column')
      .attr('rx', borderRadius)
      .attr('stroke', (d: any) => (d as any).borderColor || this.config.borderColor || 'none')
      .attr('stroke-width', (d: any) => (d as any).borderWidth ?? this.config.borderWidth ?? 0);

    if (this.isHorizontal) {
      this.renderHorizontalBars(bars, data, barWidth, barOffset, baseline, color, minPointLength, crisp, !!animate);
    } else {
      this.renderVerticalBars(bars, data, barWidth, barOffset, baseline, color, minPointLength, crisp, !!animate);
    }

    this.attachHoverEffects(bars, data);
    this.renderColumnDataLabels(data, barWidth, barOffset, baseline, stacking ? getStackedY : undefined, stacking ? getStackedBase : undefined);

    if (animate) {
      this.emitAfterAnimate(ENTRY_DURATION + data.length * ENTRY_STAGGER_PER_ITEM);
    }
  }

  private renderVerticalBars(
    bars: any, data: PointOptions[], barWidth: number, barOffset: number,
    baseline: number, color: string, minPointLength: number, crisp: boolean, animate: boolean
  ): void {
    const { xAxis, yAxis } = this.context;
    const threshold = this.config.threshold ?? 0;
    const negColor = this.config.negativeColor;

    bars
      .attr('x', (d: PointOptions) => this.crispCoord(xAxis.getPixelForValue(d.x ?? 0) + barOffset, crisp))
      .attr('width', crisp ? Math.round(barWidth) : barWidth)
      .attr('fill', (d: PointOptions, i: number) => this.getPointColor(d, i, color, negColor, threshold))
      .attr('display', (d: PointOptions) => d.y == null ? 'none' : null);

    if (animate) {
      const dur = this.getEntryDuration();
      bars
        .attr('y', baseline)
        .attr('height', 0)
        .transition().duration(dur).ease(EASE_ENTRY)
        .delay((_: any, i: number) => staggerDelay(i, 0, ENTRY_STAGGER_PER_ITEM, data.length))
        .attr('y', (d: PointOptions) => this.getBarY(d, yAxis, baseline, minPointLength))
        .attr('height', (d: PointOptions) => this.getBarHeight(d, yAxis, baseline, minPointLength));
    } else {
      bars
        .attr('y', (d: PointOptions) => this.getBarY(d, yAxis, baseline, minPointLength))
        .attr('height', (d: PointOptions) => this.getBarHeight(d, yAxis, baseline, minPointLength));
    }
  }

  private renderHorizontalBars(
    bars: any, data: PointOptions[], barWidth: number, barOffset: number,
    baseline: number, color: string, minPointLength: number, crisp: boolean, animate: boolean
  ): void {
    const { xAxis, yAxis } = this.context;
    const threshold = this.config.threshold ?? 0;
    const negColor = this.config.negativeColor;

    bars
      .attr('y', (d: PointOptions) =>
        this.crispCoord(xAxis.getPixelForValue(d.x ?? 0) + barOffset, crisp))
      .attr('height', crisp ? Math.round(barWidth) : barWidth)
      .attr('fill', (d: PointOptions, i: number) => this.getPointColor(d, i, color, negColor, threshold))
      .attr('display', (d: PointOptions) => d.y == null ? 'none' : null);

    if (animate) {
      const dur = this.getEntryDuration();
      bars
        .attr('x', baseline)
        .attr('width', 0)
        .transition().duration(dur).ease(EASE_ENTRY)
        .delay((_: any, i: number) => staggerDelay(i, 0, ENTRY_STAGGER_PER_ITEM, data.length))
        .attr('x', (d: PointOptions) => {
          const py = yAxis.getPixelForValue(d.y ?? 0);
          return Math.min(baseline, py);
        })
        .attr('width', (d: PointOptions) => {
          const h = Math.abs(yAxis.getPixelForValue(d.y ?? 0) - baseline);
          return Math.max(h, minPointLength);
        });
    } else {
      bars
        .attr('x', (d: PointOptions) => Math.min(baseline, yAxis.getPixelForValue(d.y ?? 0)))
        .attr('width', (d: PointOptions) => Math.max(Math.abs(yAxis.getPixelForValue(d.y ?? 0) - baseline), minPointLength));
    }
  }

  private renderStackedBars(
    bars: any, data: PointOptions[], barWidth: number, barOffset: number,
    getStackedY: (d: PointOptions) => number, getStackedBase: (d: PointOptions) => number,
    color: string, minPointLength: number, crisp: boolean, animate: boolean,
    borderRadius?: number
  ): void {
    const totalSeries = this.context.totalSeriesOfType || 1;
    const seriesIdx = this.context.indexInType || 0;
    const isTop = seriesIdx === totalSeries - 1;
    const isBottom = seriesIdx === 0;
    const r = borderRadius ?? 0;

    bars.attr('fill', (d: PointOptions, i: number) => this.getPointColor(d, i, color));

    if (animate) {
      const dur = this.getEntryDuration();
      bars.each((d: PointOptions, i: number, nodes: ArrayLike<SVGPathElement>) => {
        const el = select(nodes[i]);
        const startP = this.computeStackedStartParams(d, data, barWidth, barOffset, getStackedBase, crisp);
        const endP = this.computeStackedRectParams(d, data, barWidth, barOffset, getStackedY, getStackedBase, crisp, minPointLength);
        (d as any)._rectParams = endP;

        el.attr('d', this.rectParamsToPath(startP, r, isTop, isBottom))
          .transition().duration(dur).ease(EASE_ENTRY)
          .delay(staggerDelay(i, 0, ENTRY_STAGGER_PER_ITEM, data.length))
          .attrTween('d', () => {
            const iX = interpolate(startP.x, endP.x);
            const iY = interpolate(startP.y, endP.y);
            const iW = interpolate(startP.w, endP.w);
            const iH = interpolate(startP.h, endP.h);
            return (t: number) => this.rectParamsToPath(
              { x: iX(t), y: iY(t), w: iW(t), h: iH(t) }, r, isTop, isBottom
            );
          });
      });
    } else {
      bars.each((d: PointOptions, i: number, nodes: ArrayLike<SVGPathElement>) => {
        const endP = this.computeStackedRectParams(d, data, barWidth, barOffset, getStackedY, getStackedBase, crisp, minPointLength);
        (d as any)._rectParams = endP;
        select(nodes[i]).attr('d', this.rectParamsToPath(endP, r, isTop, isBottom));
      });
    }
  }

  private getBarY(d: PointOptions, yAxis: any, baseline: number, minPointLength: number): number {
    const py = yAxis.getPixelForValue(d.y ?? 0);
    const top = Math.min(py, baseline);
    const h = Math.abs(py - baseline);
    if (h < minPointLength && (d.y ?? 0) >= (this.config.threshold ?? 0)) {
      return top - (minPointLength - h);
    }
    return top;
  }

  private getBarHeight(d: PointOptions, yAxis: any, baseline: number, minPointLength: number): number {
    return Math.max(Math.abs(yAxis.getPixelForValue(d.y ?? 0) - baseline), minPointLength);
  }

  private crispCoord(v: number, crisp: boolean): number {
    return crisp ? Math.round(v) : v;
  }

  private computeStackedRectParams(
    d: PointOptions, data: PointOptions[],
    barWidth: number, barOffset: number,
    getStackedY: (d: PointOptions) => number,
    getStackedBase: (d: PointOptions) => number,
    crisp: boolean, minPointLength: number
  ): RectParams {
    const { xAxis, yAxis } = this.context;
    if (this.isHorizontal) {
      const y = this.crispCoord(xAxis.getPixelForValue(d.x ?? data.indexOf(d)) + barOffset, crisp);
      const h = crisp ? Math.round(barWidth) : barWidth;
      const xPos = Math.min(yAxis.getPixelForValue(getStackedY(d)), yAxis.getPixelForValue(getStackedBase(d)));
      const w = Math.max(Math.abs(yAxis.getPixelForValue(getStackedY(d)) - yAxis.getPixelForValue(getStackedBase(d))), minPointLength);
      return { x: xPos, y, w, h };
    } else {
      const x = this.crispCoord(xAxis.getPixelForValue(d.x ?? 0) + barOffset, crisp);
      const w = crisp ? Math.round(barWidth) : barWidth;
      const yPos = Math.min(yAxis.getPixelForValue(getStackedY(d)), yAxis.getPixelForValue(getStackedBase(d)));
      const h = Math.max(Math.abs(yAxis.getPixelForValue(getStackedY(d)) - yAxis.getPixelForValue(getStackedBase(d))), minPointLength);
      return { x, y: yPos, w, h };
    }
  }

  private computeStackedStartParams(
    d: PointOptions, data: PointOptions[],
    barWidth: number, barOffset: number,
    getStackedBase: (d: PointOptions) => number,
    crisp: boolean
  ): RectParams {
    const { xAxis, yAxis } = this.context;
    if (this.isHorizontal) {
      const y = this.crispCoord(xAxis.getPixelForValue(d.x ?? data.indexOf(d)) + barOffset, crisp);
      const h = crisp ? Math.round(barWidth) : barWidth;
      const xBase = yAxis.getPixelForValue(getStackedBase(d));
      return { x: xBase, y, w: 0.1, h };
    } else {
      const x = this.crispCoord(xAxis.getPixelForValue(d.x ?? 0) + barOffset, crisp);
      const w = crisp ? Math.round(barWidth) : barWidth;
      const yBase = yAxis.getPixelForValue(getStackedBase(d));
      return { x, y: yBase, w, h: 0.1 };
    }
  }

  private rectParamsToPath(p: RectParams, r: number, isTop: boolean, isBottom: boolean): string {
    return this.isHorizontal
      ? roundedRectPathH(p.x, p.y, p.w, p.h, r, isTop, isBottom)
      : roundedRectPath(p.x, p.y, p.w, p.h, r, isTop, isBottom);
  }

  animateUpdate(duration: number): void {
    const stacking = this.config.stacking;
    if (stacking) {
      this.updateStackedBars(duration);
      return;
    }

    const { xAxis, yAxis, plotArea } = this.context;
    const color = this.getColor();
    const data = this.data;
    const { barWidth, barOffset, baseline } = this.computeBarGeometry();
    const minPointLength = this.config.minPointLength ?? 0;
    const crisp = this.config.crisp !== false;
    const threshold = this.config.threshold ?? 0;
    const negColor = this.config.negativeColor;

    const bars = this.group.selectAll<SVGRectElement, PointOptions>('.katucharts-column')
      .data(data);

    const enter = bars.enter().append('rect')
      .attr('class', 'katucharts-column')
      .attr('rx', resolveBorderRadius(this.config.borderRadius))
      .attr('fill', (d, i) => this.getPointColor(d, i, color, negColor, threshold))
      .attr('display', (d: PointOptions) => d.y == null ? 'none' : null)
      .attr('stroke', this.config.borderColor || 'none')
      .attr('stroke-width', this.config.borderWidth ?? 0);

    if (!this.isHorizontal) {
      enter
        .attr('x', d => this.crispCoord(xAxis.getPixelForValue(d.x ?? 0) + barOffset, crisp))
        .attr('width', crisp ? Math.round(barWidth) : barWidth)
        .attr('y', baseline)
        .attr('height', 0);
    }

    const merged = enter.merge(bars);
    merged.attr('display', (d: PointOptions) => d.y == null ? 'none' : null);

    if (this.isHorizontal) {
      merged.transition().duration(duration)
        .attr('y', (d) => this.crispCoord(xAxis.getPixelForValue(d.x ?? 0) + barOffset, crisp))
        .attr('height', crisp ? Math.round(barWidth) : barWidth)
        .attr('x', d => Math.min(baseline, yAxis.getPixelForValue(d.y ?? 0)))
        .attr('width', d => Math.max(Math.abs(yAxis.getPixelForValue(d.y ?? 0) - baseline), minPointLength))
        .attr('fill', (d, i) => this.getPointColor(d, i, color, negColor, threshold));
    } else {
      merged.transition().duration(duration)
        .attr('x', d => this.crispCoord(xAxis.getPixelForValue(d.x ?? 0) + barOffset, crisp))
        .attr('width', crisp ? Math.round(barWidth) : barWidth)
        .attr('y', d => this.getBarY(d, yAxis, baseline, minPointLength))
        .attr('height', d => this.getBarHeight(d, yAxis, baseline, minPointLength))
        .attr('fill', (d, i) => this.getPointColor(d, i, color, negColor, threshold));
    }

    bars.exit().transition().duration(duration).attr('opacity', 0).remove();

    this.group.selectAll('.katucharts-data-labels').remove();
    this.attachHoverEffects(this.group.selectAll('.katucharts-column'), data);
    this.renderColumnDataLabels(data, barWidth, barOffset, baseline);
  }

  private updateStackedBars(duration: number): void {
    const { xAxis, yAxis, plotArea } = this.context;
    const color = this.getColor();
    const data = this.data;
    const { barWidth, barOffset, baseline } = this.computeBarGeometry();
    const stacking = this.config.stacking;
    const stackOffsets = this.context.stackOffsets;
    const isPercent = stacking === 'percent';
    const crisp = this.config.crisp !== false;
    const borderRadius = resolveBorderRadius(this.config.borderRadius);
    const minPointLength = this.config.minPointLength ?? 0;

    const percentTotals = isPercent ? this.context.stackTotals : undefined;

    const getStackedY = (d: PointOptions): number => {
      const xKey = d.x ?? 0;
      const offset = stackOffsets?.get(xKey) || 0;
      const val = d.y ?? 0;
      if (isPercent && percentTotals) {
        const total = percentTotals.get(xKey) || 1;
        return ((offset + val) / total) * 100;
      }
      return offset + val;
    };

    const getStackedBase = (d: PointOptions): number => {
      const xKey = d.x ?? 0;
      const offset = stackOffsets?.get(xKey) || 0;
      if (isPercent && percentTotals) {
        const total = percentTotals.get(xKey) || 1;
        return (offset / total) * 100;
      }
      return offset;
    };

    if (stacking) {
      const totals = this.context.stackTotals;
      for (const d of data) {
        const xKey = d.x ?? 0;
        if (totals) {
          (d as any).total = totals.get(xKey) || 0;
        }
        if (isPercent && totals) {
          const t = totals.get(xKey) || 1;
          (d as any).percentage = ((d.y ?? 0) / t) * 100;
        }
      }
    }

    const totalSeries = this.context.totalSeriesOfType || 1;
    const seriesIdx = this.context.indexInType || 0;
    const isTop = seriesIdx === totalSeries - 1;
    const isBottom = seriesIdx === 0;
    const r = borderRadius;

    const bars = this.group.selectAll<SVGPathElement, PointOptions>('.katucharts-column')
      .data(data);

    bars.each((d: PointOptions, i: number, nodes: ArrayLike<SVGPathElement>) => {
      const el = select(nodes[i]);
      const newP = this.computeStackedRectParams(d, data, barWidth, barOffset, getStackedY, getStackedBase, crisp, minPointLength);
      const oldP: RectParams = (d as any)._rectParams || newP;
      (d as any)._rectParams = newP;

      el.transition().duration(duration)
        .attrTween('d', () => {
          const iX = interpolate(oldP.x, newP.x);
          const iY = interpolate(oldP.y, newP.y);
          const iW = interpolate(oldP.w, newP.w);
          const iH = interpolate(oldP.h, newP.h);
          return (t: number) => this.rectParamsToPath(
            { x: iX(t), y: iY(t), w: iW(t), h: iH(t) }, r, isTop, isBottom
          );
        })
        .attr('fill', this.getPointColor(d, i, color));
    });

    bars.enter().append('path')
      .attr('class', 'katucharts-column')
      .attr('stroke', this.config.borderColor || 'none')
      .attr('stroke-width', this.config.borderWidth ?? 0)
      .attr('fill', (d: PointOptions, i: number) => this.getPointColor(d, i, color))
      .each((d: PointOptions, i: number, nodes: ArrayLike<SVGPathElement>) => {
        const endP = this.computeStackedRectParams(d, data, barWidth, barOffset, getStackedY, getStackedBase, crisp, minPointLength);
        (d as any)._rectParams = endP;
        select(nodes[i]).attr('d', this.rectParamsToPath(endP, r, isTop, isBottom));
      });

    bars.exit().transition().duration(duration).attr('opacity', 0).remove();

    this.group.selectAll('.katucharts-data-labels').remove();
    this.attachHoverEffects(this.group.selectAll('.katucharts-column'), data);
    this.renderColumnDataLabels(data, barWidth, barOffset, baseline, getStackedY, getStackedBase);
  }

  protected computeBarGeometry() {
    const { xAxis, yAxis, plotArea } = this.context;
    const stacked = !!this.config.stacking;
    const totalInGroup = stacked ? 1 : (this.config.grouping !== false) ? (this.context.totalSeriesOfType || 1) : 1;
    const indexInGroup = stacked ? 0 : (this.config.grouping !== false) ? (this.context.indexInType || 0) : 0;
    const groupPadding = this.config.groupPadding ?? 0.2;
    const pointPadding = this.config.pointPadding ?? 0.1;

    let groupWidth: number;
    if (xAxis instanceof CategoryAxis) {
      groupWidth = (xAxis as any).getBandwidth();
    } else if (this.isHorizontal) {
      groupWidth = plotArea.height / Math.max(this.data.length, 1);
    } else if (this.config.pointRange !== undefined && this.config.pointRange > 0) {
      groupWidth = Math.abs(
        xAxis.getPixelForValue(this.config.pointRange) - xAxis.getPixelForValue(0)
      );
    } else {
      const data = this.data;
      groupWidth = data.length > 1
        ? Math.abs(xAxis.getPixelForValue((data[1]?.x ?? 1)) - xAxis.getPixelForValue((data[0]?.x ?? 0))) * (1 - groupPadding * 2)
        : plotArea.width / Math.max(data.length, 1) * (1 - groupPadding * 2);
    }

    const effectiveGroupPadding = stacked ? 0 : groupPadding;
    const effectivePointPadding = stacked ? 0 : pointPadding;

    let barWidth: number;
    if (this.config.pointWidth !== undefined) {
      barWidth = this.config.pointWidth;
    } else {
      barWidth = (groupWidth * (1 - effectiveGroupPadding * 2)) / totalInGroup * (1 - effectivePointPadding * 2);
    }

    if (this.config.maxPointWidth !== undefined) {
      barWidth = Math.min(barWidth, this.config.maxPointWidth);
    }

    let barOffset: number;
    if (this.config.centerInCategory) {
      barOffset = -barWidth / 2;
    } else {
      const groupStart = -groupWidth * (1 - effectiveGroupPadding * 2) / 2;
      barOffset = groupStart + (barWidth + barWidth * effectivePointPadding * 2) * indexInGroup + barWidth * effectivePointPadding;
    }
    const baseline = yAxis.getPixelForValue(this.config.threshold ?? 0);

    return { barWidth, barOffset, baseline, groupWidth };
  }

  private getPointColor(
    d: PointOptions, i: number, seriesColor: string,
    negativeColor?: string, threshold?: number
  ): string {
    if (d.color) return d.color;
    if (this.config.colorByPoint) {
      const palette = this.config.colors || this.context.colors;
      return palette[i % palette.length];
    }
    if (negativeColor && (d.y ?? 0) < (threshold ?? 0)) {
      return negativeColor;
    }
    return seriesColor;
  }

  private renderColumnDataLabels(
    data: PointOptions[], barWidth: number, barOffset: number, baseline: number,
    getStackedY?: (d: PointOptions) => number, getStackedBase?: (d: PointOptions) => number
  ): void {
    const dlConfig = this.config.dataLabels;
    if (!dlConfig?.enabled) return;

    const { xAxis, yAxis } = this.context;
    const inside = dlConfig.inside ?? false;

    this.renderDataLabels(
      data,
      (d) => {
        if (this.isHorizontal) {
          const py = yAxis.getPixelForValue(d.y ?? 0);
          return inside ? (py + baseline) / 2 : py - 5;
        }
        return xAxis.getPixelForValue(d.x ?? 0) + barOffset + barWidth / 2;
      },
      (d) => {
        if (this.isHorizontal) {
          return xAxis.getPixelForValue(d.x ?? 0) + barOffset + barWidth / 2;
        }
        const py = getStackedY
          ? yAxis.getPixelForValue(getStackedY(d))
          : yAxis.getPixelForValue(d.y ?? 0);
        return inside ? (py + baseline) / 2 : py;
      }
    );
  }

  private attachHoverEffects(bars: any, data: PointOptions[]): void {
    if (this.config.enableMouseTracking === false) return;

    const { xAxis, yAxis } = this.context;
    const isStacked = !!this.config.stacking;
    const brightness = this.config.states?.hover?.brightness ?? (isStacked ? 0.2 : 0.1);
    const hoverColor = this.config.states?.hover?.color;
    const hoverBorderColor = this.config.states?.hover?.borderColor;
    const hoverBorderWidth = this.config.states?.hover?.borderWidth;

    bars
      .style('cursor', this.config.cursor || 'pointer')
      .on('mouseover', (event: MouseEvent, d: PointOptions) => {
        const target = event.currentTarget as SVGRectElement;
        const origFill = target.getAttribute('fill') || '';

        target.setAttribute('data-orig-fill', origFill);
        const targetSel = select(target).interrupt('hover');
        const tween = targetSel.transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER);
        if (hoverColor) {
          tween.style('fill', hoverColor);
        } else {
          tween.style('fill', brightenColor(origFill, brightness));
        }
        if (hoverBorderColor) tween.style('stroke', hoverBorderColor);
        if (hoverBorderWidth !== undefined) tween.style('stroke-width', String(hoverBorderWidth));
        target.style.filter = 'drop-shadow(0 1px 3px rgba(0,0,0,0.2))';

        if (isStacked) {
          const allSeries = this.context.allSeries;
          if (allSeries) {
            for (const other of allSeries) {
              if (other.visible && (other as any).config?.stacking) {
                (other as any).group?.selectAll('.katucharts-column')
                  .filter(function(this: SVGElement) { return this !== target; })
                  .interrupt('stackDim')
                  .transition('stackDim').duration(HOVER_INACTIVE_DURATION).ease(EASE_HOVER)
                  .attr('opacity', 0.3);
              }
            }
          }
          target.setAttribute('data-orig-stroke', target.getAttribute('stroke') || '');
          target.setAttribute('data-orig-stroke-width', target.getAttribute('stroke-width') || '');
          tween.style('stroke', '#ffffff').style('stroke-width', '2');
        }

        const i = data.indexOf(d);
        const cx = xAxis.getPixelForValue(d.x ?? 0);
        const cy = yAxis.getPixelForValue(d.y ?? 0);
        const inv = this.context.inverted;
        this.context.events.emit('point:mouseover', {
          point: d, index: i, series: this, event,
          plotX: inv ? cy : cx, plotY: inv ? cx : cy,
        });
        d.events?.mouseOver?.call(d, event);
        this.config.point?.events?.mouseOver?.call(d, event);
      })
      .on('mouseout', (event: MouseEvent, d: PointOptions) => {
        const target = event.currentTarget as SVGRectElement;
        const origFill = target.getAttribute('data-orig-fill') || '';
        const targetSel = select(target).interrupt('hover');
        const tween = targetSel.transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER);
        tween.style('fill', origFill);
        target.style.filter = '';

        if (isStacked) {
          const allSeries = this.context.allSeries;
          if (allSeries) {
            for (const other of allSeries) {
              if (other.visible && (other as any).config?.stacking) {
                (other as any).group?.selectAll('.katucharts-column')
                  .interrupt('stackDim')
                  .transition('stackDim').duration(HOVER_INACTIVE_DURATION).ease(EASE_HOVER)
                  .attr('opacity', 1);
              }
            }
          }
          tween
            .style('stroke', target.getAttribute('data-orig-stroke') || '')
            .style('stroke-width', target.getAttribute('data-orig-stroke-width') || '');
        } else {
          tween.style('stroke', '').style('stroke-width', '');
        }

        tween.on('end', () => {
          if (!target.matches(':hover')) {
            target.style.fill = '';
          }
        });

        const i = data.indexOf(d);
        this.context.events.emit('point:mouseout', { point: d, index: i, series: this, event });
        d.events?.mouseOut?.call(d, event);
        this.config.point?.events?.mouseOut?.call(d, event);
      })
      .on('click', (event: MouseEvent, d: PointOptions) => {
        const i = data.indexOf(d);
        this.context.events.emit('point:click', { point: d, index: i, series: this, event });
        d.events?.click?.call(d, event);
        this.config.point?.events?.click?.call(d, event);
        this.config.events?.click?.call(this, event);

        const target = event.currentTarget as SVGRectElement;
        const sel = select(target);
        this.handlePointSelect(sel, d, i, event);
      });
  }
}

export class BarSeries extends ColumnSeries {
  protected isHorizontal = true;
}

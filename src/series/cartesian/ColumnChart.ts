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

export class ColumnChart extends BaseSeries {
  protected isHorizontal = false;

  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  protected getEntryDuration(): number {
    const animOpts = typeof this.config.animation === 'object' ? this.config.animation : {};
    return animOpts.duration ?? ENTRY_DURATION;
  }

  render(): void {
    this.group.selectAll('.katucharts-data-labels').remove();

    const { xAxis, yAxis, plotArea } = this.context;
    const color = this.getColor();
    const data = this.data;
    const animate = this.context.animate && this.config.animation !== false;

    const { barWidth, barOffset, baseline } = this.computeBarGeometry();
    const stacking = this.config.stacking;
    const stackOffsetsPos = this.context.stackOffsetsPos;
    const stackOffsetsNeg = this.context.stackOffsetsNeg;
    const offsetFor = (d: PointOptions): number =>
      (((d.y ?? 0) < 0 ? stackOffsetsNeg?.get(d.x ?? 0) : stackOffsetsPos?.get(d.x ?? 0)) || 0);
    const isPercent = stacking === 'percent';

    const percentTotals = isPercent ? this.context.stackTotals : undefined;

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

    if (stacking) {
      const totals = this.context.stackTotals;
      for (const d of data) {
        const xKey = d.x ?? 0;
        if (totals) {
          (d as any).total = totals.get(xKey) || 0;
          (d as any).stackTotal = totals.get(xKey) || 0;
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
        .attr('stroke', (d: any) => d.borderColor || this.config.borderColor || this.autoBorderColor())
        .attr('stroke-width', (d: any) => d.borderWidth ?? this.config.borderWidth ?? 1);
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
      const y = this.crispCoord(xAxis.getPixelForValue(d.x ?? 0) + barOffset, crisp);
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
      const y = this.crispCoord(xAxis.getPixelForValue(d.x ?? 0) + barOffset, crisp);
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

    /**
     * Ranked updates (dataSorting.matchByName) key the join by point name so a
     * bar keeps its element across rank changes and visibly slides to its new
     * slot; otherwise the join stays positional (by index), the conventional
     * update behaviour.
     */
    const sorting = this.config.dataSorting;
    const keyFn = sorting?.enabled && sorting.matchByName
      ? (d: PointOptions, i: number) => String(d.name ?? i)
      : undefined;

    const bars = keyFn
      ? this.group.selectAll<SVGRectElement, PointOptions>('.katucharts-column').data(data, keyFn)
      : this.group.selectAll<SVGRectElement, PointOptions>('.katucharts-column').data(data);

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
    } else {
      enter
        .attr('y', d => this.crispCoord(xAxis.getPixelForValue(d.x ?? 0) + barOffset, crisp))
        .attr('height', crisp ? Math.round(barWidth) : barWidth)
        .attr('x', baseline)
        .attr('width', 0);
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

    this.attachHoverEffects(this.group.selectAll('.katucharts-column'), data);
    if (sorting?.enabled) {
      this.animateSortedDataLabels(data, barWidth, barOffset, duration);
    } else {
      this.group.selectAll('.katucharts-data-labels').remove();
      this.renderColumnDataLabels(data, barWidth, barOffset, baseline);
    }
  }

  /**
   * Animated data-label pass for ranked (dataSorting) updates. Labels are
   * keyed by point name so each one slides with its bar to its new rank, and
   * plain numeric labels tween through intermediate values while moving — the
   * classic bar-race treatment. Labels produced by a formatter/format string
   * still slide but swap their text at once, since arbitrary formatters can't
   * be interpolated safely.
   */
  private animateSortedDataLabels(
    data: PointOptions[], barWidth: number, barOffset: number, duration: number
  ): void {
    const dlConfig = this.config.dataLabels;
    if (!dlConfig?.enabled) {
      this.group.selectAll('.katucharts-data-labels').remove();
      return;
    }

    const { xAxis, yAxis, plotArea } = this.context;
    const horizontal = this.isHorizontal;
    const plotW = plotArea.width;
    const hasFormatter = !!(dlConfig.formatter || dlConfig.format);

    let labelsGroup = this.group.selectAll<SVGGElement, unknown>('.katucharts-data-labels');
    if (labelsGroup.empty()) {
      labelsGroup = this.group.append('g').attr('class', 'katucharts-data-labels katucharts-data-label') as any;
    }

    /**
     * Labels drawn by the static pass (initial render) carry no bound data, so
     * they can't participate in a keyed join — the key accessor would read
     * `undefined`. They are cleared once here; from this update on, every label
     * is data-bound and animates with its bar.
     */
    labelsGroup.selectAll<SVGTextElement, PointOptions>('text')
      .filter(function () { return (this as any).__data__ === undefined; })
      .remove();

    const visible = data.filter(d => d.y != null);
    const labelX = (d: PointOptions): number => {
      if (horizontal) {
        const end = yAxis.getPixelForValue(d.y ?? 0);
        return Math.min(end + 6, plotW - 4) + (dlConfig.x ?? 0);
      }
      return xAxis.getPixelForValue(d.x ?? 0) + barOffset + barWidth / 2 + (dlConfig.x ?? 0);
    };
    const labelY = (d: PointOptions): number => {
      if (horizontal) {
        return xAxis.getPixelForValue(d.x ?? 0) + barOffset + barWidth / 2 + (dlConfig.y ?? 0);
      }
      return yAxis.getPixelForValue(d.y ?? 0) + (dlConfig.y ?? -10);
    };

    const labels = labelsGroup
      .selectAll<SVGTextElement, PointOptions>('text')
      .data(visible, ((d: PointOptions | undefined, i: number) => String(d?.name ?? i)) as any);

    const self = this;
    const entering = labels.enter().append('text')
      .attr('x', d => labelX(d))
      .attr('y', d => labelY(d))
      .attr('text-anchor', horizontal ? 'start' : 'middle')
      .attr('dominant-baseline', 'central')
      .attr('opacity', 0)
      .each(function (d, i) {
        const { text, htmlColor } = self.resolveDataLabelText(d, i, dlConfig);
        const node = select(this);
        node.text(text).attr('data-value', d.y ?? 0);
        self.applyDataLabelStyle(node as any, dlConfig, htmlColor);
      });

    entering.transition().duration(duration).attr('opacity', 1);

    labels.transition().duration(duration)
      .attr('x', d => labelX(d))
      .attr('y', d => labelY(d))
      .attr('opacity', 1)
      .tween('text', function (d) {
        const node = this;
        const i = visible.indexOf(d);
        if (hasFormatter) {
          const { text } = self.resolveDataLabelText(d, i, dlConfig);
          node.textContent = text;
          node.setAttribute('data-value', String(d.y ?? 0));
          return () => undefined;
        }
        const prev = parseFloat(node.getAttribute('data-value') || '0');
        const next = d.y ?? 0;
        const decimals = (String(next).split('.')[1] || '').length;
        return (t: number) => {
          const current = prev + (next - prev) * t;
          node.textContent = current.toFixed(decimals);
          node.setAttribute('data-value', String(t === 1 ? next : current));
        };
      });

    labels.exit().transition().duration(duration).attr('opacity', 0).remove();
  }

  private updateStackedBars(duration: number): void {
    const { xAxis, yAxis, plotArea } = this.context;
    const color = this.getColor();
    const data = this.data;
    const { barWidth, barOffset, baseline } = this.computeBarGeometry();
    const stacking = this.config.stacking;
    const stackOffsetsPos = this.context.stackOffsetsPos;
    const stackOffsetsNeg = this.context.stackOffsetsNeg;
    const offsetFor = (d: PointOptions): number =>
      (((d.y ?? 0) < 0 ? stackOffsetsNeg?.get(d.x ?? 0) : stackOffsetsPos?.get(d.x ?? 0)) || 0);
    const isPercent = stacking === 'percent';
    const crisp = this.config.crisp !== false;
    const borderRadius = resolveBorderRadius(this.config.borderRadius);
    const minPointLength = this.config.minPointLength ?? 0;

    const percentTotals = isPercent ? this.context.stackTotals : undefined;

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

    if (stacking) {
      const totals = this.context.stackTotals;
      for (const d of data) {
        const xKey = d.x ?? 0;
        if (totals) {
          (d as any).total = totals.get(xKey) || 0;
          (d as any).stackTotal = totals.get(xKey) || 0;
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
      .attr('stroke', (d: any) => d.borderColor || this.config.borderColor || this.autoBorderColor())
      .attr('stroke-width', (d: any) => d.borderWidth ?? this.config.borderWidth ?? 1)
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
      const evenFallback = plotArea.width / Math.max(data.length, 1) * (1 - groupPadding * 2);
      if (data.length > 1) {
        /**
         * Derive the band from the gap between the first two x values, but fall
         * back to an even split when that gap is ~0 — otherwise identical or
         * duplicate leading x values collapse every bar to zero width.
         */
        const step = Math.abs(xAxis.getPixelForValue(data[1]?.x ?? 1) - xAxis.getPixelForValue(data[0]?.x ?? 0)) * (1 - groupPadding * 2);
        groupWidth = step > 0.5 ? step : evenFallback;
      } else {
        groupWidth = evenFallback;
      }
    }

    const effectiveGroupPadding = stacked ? 0 : groupPadding;
    const effectivePointPadding = stacked ? 0 : pointPadding;

    /**
     * The group's usable span (band minus group padding), and the per-series
     * slot carved from it. The auto width fills that slot minus point padding.
     */
    const usableGroup = groupWidth * (1 - effectiveGroupPadding * 2);
    let seriesSpacing = usableGroup / totalInGroup;
    const autoBarWidth = seriesSpacing * (1 - effectivePointPadding * 2);
    let barWidth: number;
    if (this.config.pointWidth !== undefined) {
      /**
       * Honor an explicit `pointWidth` literally — the bar keeps its configured
       * thickness even when many categories pack the axis tighter than that
       * width. Shrinking it to fit the band collapses dense charts into
       * unreadable slivers, which defeats the point of a fixed width. Only an
       * axis-length bound guards against a runaway value exceeding the plot.
       */
      const axisExtent = this.isHorizontal ? plotArea.height : plotArea.width;
      barWidth = Math.min(this.config.pointWidth, axisExtent);
    } else {
      barWidth = autoBarWidth;
    }

    if (this.config.maxPointWidth !== undefined) {
      barWidth = Math.min(barWidth, this.config.maxPointWidth);
    }

    /**
     * Keep a gap between adjacent category bands even when an explicit pointWidth
     * makes the whole group (bars + inter-series spacing) wider than the band —
     * otherwise dense charts pack the rows edge to edge with no breathing room.
     * The bar and the spacing are scaled down together so the grouped layout is
     * preserved, just tightened to leave ~the band's GROUP_FILL fraction filled.
     */
    if (!this.config.centerInCategory) {
      const GROUP_FILL = 0.82;
      const maxExtent = groupWidth * GROUP_FILL;
      const groupExtent = seriesSpacing * (totalInGroup - 1) + barWidth;
      if (groupExtent > maxExtent) {
        const f = maxExtent / groupExtent;
        barWidth *= f;
        seriesSpacing *= f;
      }
    }

    let barOffset: number;
    if (this.config.centerInCategory) {
      barOffset = -barWidth / 2;
    } else {
      /**
       * Centre the group of series in the band, then centre each bar on its own
       * slot. Keeps the group balanced around the category tick at any width.
       */
      const center = -seriesSpacing * (totalInGroup - 1) / 2 + seriesSpacing * indexInGroup;
      barOffset = center - barWidth / 2;
    }
    const baseline = yAxis.getPixelForValue(this.config.threshold ?? 0);

    return { barWidth, barOffset, baseline, groupWidth };
  }

  protected getPointColor(
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

  protected renderColumnDataLabels(
    data: PointOptions[], barWidth: number, barOffset: number, baseline: number,
    getStackedY?: (d: PointOptions) => number, getStackedBase?: (d: PointOptions) => number
  ): void {
    const dlConfig = this.config.dataLabels;
    if (!dlConfig?.enabled) return;

    const { xAxis, yAxis } = this.context;
    const stacked = !!getStackedY;
    /**
     * Stacked columns place their value inside each segment (centred) by default,
     * matching the conventional behaviour; unstacked columns label above the bar.
     */
    const inside = dlConfig.inside ?? stacked;

    const plotW = this.context.plotArea.width;
    const segEnd = (d: PointOptions): number =>
      getStackedY ? yAxis.getPixelForValue(getStackedY(d)) : yAxis.getPixelForValue(d.y ?? 0);
    const segStart = (d: PointOptions): number =>
      getStackedBase ? yAxis.getPixelForValue(getStackedBase(d)) : baseline;

    /**
     * Horizontal-bar value labels sit just outside the bar's end, and flip to
     * the inside (right-aligned) when there's no room left before the plot edge
     * — so a near-100% bar's label stays readable instead of overflowing/clipping.
     */
    const horizontalPlacement = (this.isHorizontal && !inside)
      ? (d: PointOptions, _i: number, textWidth: number) => {
          const end = segEnd(d);
          const outsidePad = 6;
          const insidePad = 10;
          if (end + outsidePad + textWidth <= plotW) {
            return { x: end + outsidePad, anchor: 'start' as const };
          }
          const x = Math.max(end - insidePad, textWidth + 2);
          return { x, anchor: 'end' as const };
        }
      : undefined;

    this.renderDataLabels(
      data,
      (d) => {
        if (this.isHorizontal) {
          return inside ? (segEnd(d) + segStart(d)) / 2 : segEnd(d) - 5;
        }
        return xAxis.getPixelForValue(d.x ?? 0) + barOffset + barWidth / 2;
      },
      (d) => {
        if (this.isHorizontal) {
          return xAxis.getPixelForValue(d.x ?? 0) + barOffset + barWidth / 2;
        }
        return inside ? (segEnd(d) + segStart(d)) / 2 : segEnd(d);
      },
      horizontalPlacement,
      (this.isHorizontal || inside) ? 0 : -10
    );
  }

  protected attachHoverEffects(bars: any, data: PointOptions[]): void {
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

export class BarChart extends ColumnChart {
  protected isHorizontal = true;
}

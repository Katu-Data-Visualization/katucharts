/**
 * Column and Bar series with features: grouping,
 * stacking (normal/percent), negativeColor, maxPointWidth, minPointLength,
 * pointWidth, crisp pixel snapping, data labels, shadow, and animated updates.
 */

import { select } from 'd3-selection';
import 'd3-transition';
import { BaseSeries, brightenColor, staggerDelay } from '../BaseSeries';
import type { InternalSeriesConfig, PointOptions, BorderRadiusOptions } from '../../types/options';
import { CategoryAxis } from '../../axis/Axis';

function resolveBorderRadius(val: number | BorderRadiusOptions | undefined): number {
  if (val === undefined) return 4;
  if (typeof val === 'number') return val;
  return val.radius ?? 4;
}

function roundedRectPath(
  x: number, y: number, w: number, h: number, r: number,
  top: boolean, bottom: boolean,
): string {
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
    return animOpts.duration ?? 800;
  }

  render(): void {
    const { xAxis, yAxis, plotArea } = this.context;
    const color = this.getColor();
    const data = this.data;
    const animate = this.context.animate;

    const { barWidth, barOffset, baseline } = this.computeBarGeometry();
    const stacking = this.config.stacking;
    const stackOffsets = this.context.stackOffsets;
    const isPercent = stacking === 'percent';

    let percentTotals: Map<number | string, number> | undefined;
    if (isPercent && stackOffsets) {
      percentTotals = new Map<number | string, number>();
      for (const d of data) {
        const xKey = d.x ?? 0;
        const offset = stackOffsets.get(xKey) || 0;
        percentTotals.set(xKey, offset + (d.y ?? 0));
      }
    }

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

    if (stacking && stackOffsets) {
      for (const d of data) {
        const xKey = d.x ?? 0;
        const offset = stackOffsets.get(xKey) || 0;
        (d as any).total = offset + (d.y ?? 0);
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
      if (animate) this.emitAfterAnimate(800 + data.length * 30);
      return;
    }

    const bars = this.group.selectAll('.katucharts-column')
      .data(data)
      .join('rect')
      .attr('class', 'katucharts-column')
      .attr('rx', borderRadius)
      .attr('stroke', this.config.borderColor || 'none')
      .attr('stroke-width', this.config.borderWidth ?? 0);

    if (this.isHorizontal) {
      this.renderHorizontalBars(bars, data, barWidth, barOffset, baseline, color, minPointLength, crisp, !!animate);
    } else {
      this.renderVerticalBars(bars, data, barWidth, barOffset, baseline, color, minPointLength, crisp, !!animate);
    }

    this.attachHoverEffects(bars, data);
    this.renderColumnDataLabels(data, barWidth, barOffset, baseline, stacking ? getStackedY : undefined, stacking ? getStackedBase : undefined);

    if (animate) {
      this.emitAfterAnimate(800 + data.length * 30);
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
      .attr('fill', (d: PointOptions, i: number) => this.getPointColor(d, i, color, negColor, threshold));

    if (animate) {
      const dur = this.getEntryDuration();
      bars
        .attr('y', baseline)
        .attr('height', 0)
        .transition().duration(dur).delay((_: any, i: number) => staggerDelay(i, 0, 30, data.length))
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
    const { yAxis, plotArea } = this.context;
    const groupWidth = plotArea.height / Math.max(data.length, 1);
    const threshold = this.config.threshold ?? 0;
    const negColor = this.config.negativeColor;

    bars
      .attr('y', (d: PointOptions, i: number) =>
        this.crispCoord((d.x ?? i) * groupWidth + groupWidth / 2 + barOffset, crisp))
      .attr('height', crisp ? Math.round(barWidth) : barWidth)
      .attr('fill', (d: PointOptions, i: number) => this.getPointColor(d, i, color, negColor, threshold));

    if (animate) {
      const dur = this.getEntryDuration();
      bars
        .attr('x', baseline)
        .attr('width', 0)
        .transition().duration(dur).delay((_: any, i: number) => staggerDelay(i, 0, 30, data.length))
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
    const { xAxis, yAxis, plotArea } = this.context;
    const totalSeries = this.context.totalSeriesOfType || 1;
    const seriesIdx = this.context.indexInType || 0;
    const isTop = seriesIdx === totalSeries - 1;
    const isBottom = seriesIdx === 0;
    const r = borderRadius ?? 0;

    bars.attr('fill', (d: PointOptions, i: number) => this.getPointColor(d, i, color));

    const computePath = (d: PointOptions) => {
      if (this.isHorizontal) {
        const groupWidth = plotArea.height / Math.max(data.length, 1);
        const y = this.crispCoord((d.x ?? data.indexOf(d)) * groupWidth + groupWidth / 2 + barOffset, crisp);
        const h = crisp ? Math.round(barWidth) : barWidth;
        const xPos = Math.min(yAxis.getPixelForValue(getStackedY(d)), yAxis.getPixelForValue(getStackedBase(d)));
        const w = Math.max(Math.abs(yAxis.getPixelForValue(getStackedY(d)) - yAxis.getPixelForValue(getStackedBase(d))), minPointLength);
        return roundedRectPathH(xPos, y, w, h, r, isTop, isBottom);
      } else {
        const x = this.crispCoord(xAxis.getPixelForValue(d.x ?? 0) + barOffset, crisp);
        const w = crisp ? Math.round(barWidth) : barWidth;
        const yPos = Math.min(yAxis.getPixelForValue(getStackedY(d)), yAxis.getPixelForValue(getStackedBase(d)));
        const h = Math.max(Math.abs(yAxis.getPixelForValue(getStackedY(d)) - yAxis.getPixelForValue(getStackedBase(d))), minPointLength);
        return roundedRectPath(x, yPos, w, h, r, isTop, isBottom);
      }
    };

    if (animate) {
      const dur = this.getEntryDuration();
      const computeStartPath = (d: PointOptions) => {
        if (this.isHorizontal) {
          const groupWidth = plotArea.height / Math.max(data.length, 1);
          const y = this.crispCoord((d.x ?? data.indexOf(d)) * groupWidth + groupWidth / 2 + barOffset, crisp);
          const h = crisp ? Math.round(barWidth) : barWidth;
          const xBase = yAxis.getPixelForValue(getStackedBase(d));
          return roundedRectPath(xBase, y, 0.1, h, 0, false, false);
        } else {
          const x = this.crispCoord(xAxis.getPixelForValue(d.x ?? 0) + barOffset, crisp);
          const w = crisp ? Math.round(barWidth) : barWidth;
          const yBase = yAxis.getPixelForValue(getStackedBase(d));
          return roundedRectPath(x, yBase, w, 0.1, 0, false, false);
        }
      };
      bars
        .attr('d', (d: PointOptions) => computeStartPath(d))
        .transition().duration(dur).delay((_: any, i: number) => staggerDelay(i, 0, 30, data.length))
        .attr('d', (d: PointOptions) => computePath(d));
    } else {
      bars.attr('d', (d: PointOptions) => computePath(d));
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

    if (this.isHorizontal) {
      const gw = plotArea.height / Math.max(data.length, 1);
      merged.transition().duration(duration)
        .attr('y', (d, i) => this.crispCoord((d.x ?? i) * gw + gw / 2 + barOffset, crisp))
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

    let percentTotals: Map<number | string, number> | undefined;
    if (isPercent && stackOffsets) {
      percentTotals = new Map<number | string, number>();
      for (const d of data) {
        const xKey = d.x ?? 0;
        const offset = stackOffsets.get(xKey) || 0;
        percentTotals.set(xKey, offset + (d.y ?? 0));
      }
    }

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

    const totalSeries = this.context.totalSeriesOfType || 1;
    const seriesIdx = this.context.indexInType || 0;
    const isTop = seriesIdx === totalSeries - 1;
    const isBottom = seriesIdx === 0;
    const r = borderRadius;

    const computePath = (d: PointOptions) => {
      if (this.isHorizontal) {
        const groupWidth = plotArea.height / Math.max(data.length, 1);
        const y = this.crispCoord((d.x ?? data.indexOf(d)) * groupWidth + groupWidth / 2 + barOffset, crisp);
        const h = crisp ? Math.round(barWidth) : barWidth;
        const xPos = Math.min(yAxis.getPixelForValue(getStackedY(d)), yAxis.getPixelForValue(getStackedBase(d)));
        const w = Math.max(Math.abs(yAxis.getPixelForValue(getStackedY(d)) - yAxis.getPixelForValue(getStackedBase(d))), minPointLength);
        return roundedRectPathH(xPos, y, w, h, r, isTop, isBottom);
      } else {
        const x = this.crispCoord(xAxis.getPixelForValue(d.x ?? 0) + barOffset, crisp);
        const w = crisp ? Math.round(barWidth) : barWidth;
        const yPos = Math.min(yAxis.getPixelForValue(getStackedY(d)), yAxis.getPixelForValue(getStackedBase(d)));
        const h = Math.max(Math.abs(yAxis.getPixelForValue(getStackedY(d)) - yAxis.getPixelForValue(getStackedBase(d))), minPointLength);
        return roundedRectPath(x, yPos, w, h, r, isTop, isBottom);
      }
    };

    const bars = this.group.selectAll<SVGPathElement, PointOptions>('.katucharts-column')
      .data(data);

    bars.transition().duration(duration)
      .attr('d', (d: PointOptions) => computePath(d))
      .attr('fill', (d: PointOptions, i: number) => this.getPointColor(d, i, color));

    bars.enter().append('path')
      .attr('class', 'katucharts-column')
      .attr('stroke', this.config.borderColor || 'none')
      .attr('stroke-width', this.config.borderWidth ?? 0)
      .attr('fill', (d: PointOptions, i: number) => this.getPointColor(d, i, color))
      .attr('d', (d: PointOptions) => computePath(d));

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
    if (this.isHorizontal) {
      groupWidth = plotArea.height / Math.max(this.data.length, 1);
    } else if (xAxis instanceof CategoryAxis) {
      groupWidth = (xAxis as any).getBandwidth();
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

    let barWidth: number;
    if (this.config.pointWidth !== undefined) {
      barWidth = this.config.pointWidth;
    } else {
      barWidth = (groupWidth * (1 - groupPadding * 2)) / totalInGroup * (1 - pointPadding * 2);
    }

    if (this.config.maxPointWidth !== undefined) {
      barWidth = Math.min(barWidth, this.config.maxPointWidth);
    }

    let barOffset: number;
    if (this.config.centerInCategory) {
      barOffset = -barWidth / 2;
    } else {
      const groupStart = -groupWidth * (1 - groupPadding * 2) / 2;
      barOffset = groupStart + (barWidth + barWidth * pointPadding * 2) * indexInGroup + barWidth * pointPadding;
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
          return yAxis.getPixelForValue(d.y ?? 0);
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
    const brightness = this.config.states?.hover?.brightness ?? 0.1;
    const hoverColor = this.config.states?.hover?.color;
    const hoverBorderColor = this.config.states?.hover?.borderColor;
    const hoverBorderWidth = this.config.states?.hover?.borderWidth;

    bars
      .style('cursor', this.config.cursor || 'pointer')
      .on('mouseover', (event: MouseEvent, d: PointOptions) => {
        const target = event.currentTarget as SVGRectElement;
        const origFill = target.getAttribute('fill') || '';

        target.setAttribute('data-orig-fill', origFill);
        if (hoverColor) {
          target.style.fill = hoverColor;
        } else {
          target.style.fill = brightenColor(origFill, brightness);
        }
        if (hoverBorderColor) target.style.stroke = hoverBorderColor;
        if (hoverBorderWidth !== undefined) target.style.strokeWidth = String(hoverBorderWidth);
        target.style.filter = 'drop-shadow(0 1px 3px rgba(0,0,0,0.2))';

        const i = data.indexOf(d);
        const cx = xAxis.getPixelForValue(d.x ?? 0);
        const cy = yAxis.getPixelForValue(d.y ?? 0);
        this.context.events.emit('point:mouseover', {
          point: d, index: i, series: this, event, plotX: cx, plotY: cy,
        });
        d.events?.mouseOver?.call(d, event);
        this.config.point?.events?.mouseOver?.call(d, event);
      })
      .on('mouseout', (event: MouseEvent, d: PointOptions) => {
        const target = event.currentTarget as SVGRectElement;
        target.style.fill = '';
        target.style.filter = '';
        target.style.stroke = '';
        target.style.strokeWidth = '';

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

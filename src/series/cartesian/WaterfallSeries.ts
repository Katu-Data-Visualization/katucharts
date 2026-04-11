/**
 * Waterfall series with features: upColor, negativeColor,
 * borderRadius, lineColor/dashStyle for connectors, isSum/isIntermediateSum,
 * data labels, grouping, and animated updates.
 */

import { select } from 'd3-selection';
import 'd3-transition';
import { BaseSeries, brightenColor, resolveDashArray, staggerDelay } from '../BaseSeries';
import type { InternalSeriesConfig, PointOptions, BorderRadiusOptions } from '../../types/options';
import {
  ENTRY_DURATION,
  ENTRY_STAGGER_PER_ITEM,
  HOVER_DURATION,
  EASE_ENTRY,
  EASE_HOVER,
} from '../../core/animationConstants';

function resolveBorderRadius(val: number | BorderRadiusOptions | undefined): number {
  if (val === undefined) return 4;
  if (typeof val === 'number') return val;
  return val.radius ?? 4;
}

interface ProcessedWaterfallPoint extends PointOptions {
  _start: number;
  _end: number;
  _isTotal: boolean;
  _isIntermediate: boolean;
}

export class WaterfallSeries extends BaseSeries {
  private processed: ProcessedWaterfallPoint[] = [];

  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  render(): void {
    const { xAxis, yAxis, plotArea } = this.context;
    const color = this.getColor();
    const data = this.data;
    const animate = this.context.animate;

    const { barWidth, barOffset } = this.computeBarGeometry();

    this.processed = this.processWaterfallData(data);

    const bars = this.group.selectAll('.katucharts-waterfall-bar')
      .data(this.processed)
      .join('rect')
      .attr('class', 'katucharts-waterfall-bar')
      .attr('x', d => xAxis.getPixelForValue(d.x ?? 0) + barOffset)
      .attr('width', barWidth)
      .attr('rx', resolveBorderRadius(this.config.borderRadius))
      .attr('fill', (d, i) => this.getBarColor(d, i, color))
      .attr('stroke', this.config.borderColor || 'none')
      .attr('stroke-width', this.config.borderWidth ?? 0)
      .style('cursor', this.config.cursor || 'pointer');

    const baseline = yAxis.getPixelForValue(0);

    const animOpts = typeof this.config.animation === 'object' ? this.config.animation : {};
    const entryDuration = animOpts.duration ?? ENTRY_DURATION;

    if (animate) {
      bars
        .attr('y', baseline)
        .attr('height', 0)
        .transition().duration(entryDuration).ease(EASE_ENTRY)
        .delay((_: any, i: number) => staggerDelay(i, 0, ENTRY_STAGGER_PER_ITEM, this.processed.length))
        .attr('y', (d: ProcessedWaterfallPoint) => Math.min(yAxis.getPixelForValue(d._start), yAxis.getPixelForValue(d._end)))
        .attr('height', (d: ProcessedWaterfallPoint) => Math.max(Math.abs(yAxis.getPixelForValue(d._start) - yAxis.getPixelForValue(d._end)), this.config.minPointLength ?? 0));
    } else {
      bars
        .attr('y', (d: ProcessedWaterfallPoint) => Math.min(yAxis.getPixelForValue(d._start), yAxis.getPixelForValue(d._end)))
        .attr('height', (d: ProcessedWaterfallPoint) => Math.max(Math.abs(yAxis.getPixelForValue(d._start) - yAxis.getPixelForValue(d._end)), this.config.minPointLength ?? 0));
    }

    this.attachBarEvents(bars);
    this.renderConnectors(barWidth, barOffset, !!animate);

    this.renderDataLabels(
      this.processed,
      (d) => xAxis.getPixelForValue(d.x ?? 0) + barOffset + barWidth / 2,
      (d: any) => yAxis.getPixelForValue(d._end)
    );

    if (animate) {
      this.emitAfterAnimate(entryDuration + data.length * ENTRY_STAGGER_PER_ITEM);
    }
  }

  animateUpdate(duration: number): void {
    const { xAxis, yAxis } = this.context;
    const color = this.getColor();
    const { barWidth, barOffset } = this.computeBarGeometry();

    this.processed = this.processWaterfallData(this.data);

    const bars = this.group.selectAll<SVGRectElement, ProcessedWaterfallPoint>('.katucharts-waterfall-bar')
      .data(this.processed);

    bars.exit().transition().duration(duration).attr('opacity', 0).remove();

    const enter = bars.enter().append('rect')
      .attr('class', 'katucharts-waterfall-bar')
      .attr('rx', resolveBorderRadius(this.config.borderRadius))
      .attr('stroke', this.config.borderColor || 'none')
      .attr('stroke-width', this.config.borderWidth ?? 0)
      .attr('y', yAxis.getPixelForValue(0))
      .attr('height', 0);

    enter.merge(bars)
      .transition().duration(duration)
      .attr('x', d => xAxis.getPixelForValue(d.x ?? 0) + barOffset)
      .attr('width', barWidth)
      .attr('fill', (d, i) => this.getBarColor(d, i, color))
      .attr('y', d => Math.min(yAxis.getPixelForValue(d._start), yAxis.getPixelForValue(d._end)))
      .attr('height', d => Math.max(Math.abs(yAxis.getPixelForValue(d._start) - yAxis.getPixelForValue(d._end)), this.config.minPointLength ?? 0));

    this.group.selectAll('.katucharts-waterfall-connector').remove();
    this.group.selectAll('.katucharts-data-labels').remove();

    this.renderConnectors(barWidth, barOffset, false);
    this.attachBarEvents(this.group.selectAll('.katucharts-waterfall-bar'));

    this.renderDataLabels(
      this.processed,
      (d) => xAxis.getPixelForValue(d.x ?? 0) + barOffset + barWidth / 2,
      (d: any) => yAxis.getPixelForValue(d._end)
    );
  }

  private processWaterfallData(data: PointOptions[]): ProcessedWaterfallPoint[] {
    let cumulative = 0;
    let lastIntermediateSum = 0;
    return data.map((d, i) => {
      const isSum = !!(d as any).isSum;
      const isIntermediate = !!(d as any).isIntermediateSum;
      const isTotal = isSum || isIntermediate;
      const value = d.y ?? 0;

      let start: number;
      let end: number;

      if (isSum) {
        start = 0;
        end = cumulative;
      } else if (isIntermediate) {
        start = lastIntermediateSum;
        end = cumulative;
        lastIntermediateSum = cumulative;
      } else {
        start = cumulative;
        end = cumulative + value;
        cumulative += value;
      }

      return { ...d, _start: start, _end: end, _isTotal: isTotal, _isIntermediate: isIntermediate };
    });
  }

  private getBarColor(d: ProcessedWaterfallPoint, i: number, seriesColor: string): string {
    if (d.color) return d.color;
    if (this.config.colorByPoint) {
      const palette = this.config.colors || this.context.colors;
      return palette[i % palette.length];
    }
    if (d._isIntermediate) return this.config.intermediateSumColor || this.config.sumColor || '#434348';
    if (d._isTotal) return this.config.sumColor || '#434348';
    const value = d.y ?? 0;
    if (value >= 0) {
      return this.config.upColor || seriesColor;
    }
    return this.config.negativeColor || '#f15c80';
  }

  private computeBarGeometry() {
    const { xAxis, plotArea } = this.context;
    const data = this.data;
    const totalInGroup = (this.config.grouping !== false) ? (this.context.totalSeriesOfType || 1) : 1;
    const indexInGroup = (this.config.grouping !== false) ? (this.context.indexInType || 0) : 0;
    const groupPadding = this.config.groupPadding ?? 0.2;
    const pointPadding = this.config.pointPadding ?? 0.1;

    let groupWidth: number;
    if (this.config.pointWidth !== undefined) {
      groupWidth = this.config.pointWidth * totalInGroup * 1.5;
    } else {
      groupWidth = plotArea.width / Math.max(data.length, 1);
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

    const groupStart = -groupWidth * (1 - groupPadding * 2) / 2;
    const barOffset = groupStart + (barWidth + barWidth * pointPadding * 2) * indexInGroup + barWidth * pointPadding;

    return { barWidth, barOffset };
  }

  private renderConnectors(barWidth: number, barOffset: number, animate: boolean): void {
    const { xAxis, yAxis } = this.context;
    const connectorColor = this.config.lineColor || '#999';
    const connectorWidth = this.config.lineWidth ?? 1;
    const connectorDash = resolveDashArray(this.config.dashStyle || 'Dot');

    const connectors = this.group.selectAll('.katucharts-waterfall-connector')
      .data(this.processed.slice(0, -1))
      .join('line')
      .attr('class', 'katucharts-waterfall-connector')
      .attr('x1', (d: ProcessedWaterfallPoint) => xAxis.getPixelForValue(d.x ?? 0) + barOffset + barWidth)
      .attr('x2', (d: ProcessedWaterfallPoint, i: number) => xAxis.getPixelForValue(this.processed[i + 1].x ?? 0) + barOffset)
      .attr('y1', (d: ProcessedWaterfallPoint) => yAxis.getPixelForValue(d._end))
      .attr('y2', (d: ProcessedWaterfallPoint) => yAxis.getPixelForValue(d._end))
      .attr('stroke', connectorColor)
      .attr('stroke-width', connectorWidth)
      .attr('stroke-dasharray', connectorDash);

    if (animate) {
      connectors.attr('opacity', 0)
        .transition().duration(ENTRY_DURATION).ease(EASE_ENTRY)
        .delay((_: any, i: number) => ENTRY_DURATION + i * ENTRY_STAGGER_PER_ITEM)
        .attr('opacity', 1);
    }
  }

  private attachBarEvents(bars: any): void {
    if (this.config.enableMouseTracking === false) return;

    const { xAxis, yAxis } = this.context;
    const processed = this.processed;

    bars
      .style('cursor', this.config.cursor || 'pointer')
      .on('mouseover', (event: MouseEvent, d: ProcessedWaterfallPoint) => {
        const target = event.currentTarget as SVGRectElement;
        const origFill = target.getAttribute('fill') || '';
        target.setAttribute('data-orig-fill', origFill);
        target.style.filter = 'drop-shadow(0 2px 4px rgba(0,0,0,0.25))';
        select(target).interrupt('hover')
          .transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER)
          .style('fill', brightenColor(origFill, 0.15));

        const idx = processed.indexOf(d);
        this.context.events.emit('point:mouseover', {
          point: d, index: idx, series: this, event,
          plotX: xAxis.getPixelForValue(d.x ?? 0),
          plotY: yAxis.getPixelForValue(d._end),
        });
        d.events?.mouseOver?.call(d, event);
        this.config.point?.events?.mouseOver?.call(d, event);
      })
      .on('mouseout', (event: MouseEvent, d: ProcessedWaterfallPoint) => {
        const target = event.currentTarget as SVGRectElement;
        target.style.filter = '';
        select(target).interrupt('hover')
          .transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER)
          .style('fill', null);

        const idx = processed.indexOf(d);
        this.context.events.emit('point:mouseout', { point: d, index: idx, series: this, event });
        d.events?.mouseOut?.call(d, event);
        this.config.point?.events?.mouseOut?.call(d, event);
      })
      .on('click', (event: MouseEvent, d: ProcessedWaterfallPoint) => {
        const idx = processed.indexOf(d);
        this.context.events.emit('point:click', { point: d, index: idx, series: this, event });
        d.events?.click?.call(d, event);
        this.config.point?.events?.click?.call(d, event);
        this.config.events?.click?.call(this, event);
        this.handlePointSelect(select(event.currentTarget as Element), d, idx, event);
      });
  }

  getDataExtents() {
    let xMin = Infinity, xMax = -Infinity;
    let yMin = 0, yMax = 0;
    let cumulative = 0;
    for (let i = 0; i < this.data.length; i++) {
      const d = this.data[i] as any;
      const x = d.x ?? i;
      xMin = Math.min(xMin, x);
      xMax = Math.max(xMax, x);
      const isTotal = d.isSum || d.isIntermediateSum;
      const value = d.y ?? 0;
      if (!isTotal) cumulative += value;
      yMin = Math.min(yMin, isTotal ? 0 : Math.min(cumulative - value, cumulative), 0);
      yMax = Math.max(yMax, cumulative);
    }
    return { xMin, xMax, yMin, yMax };
  }
}

/**
 * Bubble series with features: displayNegative, zThreshold,
 * sizeBy (area/width), sizeByAbsoluteValue, zMin/zMax overrides, jitter,
 * negativeColor, data labels, and animated updates.
 */

import { scaleSqrt, scaleLinear } from 'd3-scale';
import { select } from 'd3-selection';
import 'd3-transition';
import { BaseSeries, staggerDelay } from '../BaseSeries';
import type { InternalSeriesConfig, PointOptions } from '../../types/options';
import {
  ENTRY_DURATION,
  ENTRY_STAGGER_PER_ITEM,
  HOVER_DURATION,
  EASE_ENTRY,
  EASE_HOVER,
} from '../../core/animationConstants';

export class BubbleChart extends BaseSeries {
  private sizeScale!: (v: number) => number;

  constructor(config: InternalSeriesConfig) {
    config.clip = false;
    super(config);
  }

  render(): void {
    const { xAxis, yAxis, plotArea } = this.context;
    const color = this.getColor();
    const rawData = this.data.filter(d => d.y !== null && d.y !== undefined);
    const animate = this.context.animate;
    const jitter = this.config.jitter;

    const data = this.filterByZThreshold(rawData);
    this.buildSizeScale(data);

    const positions = data.map(d => ({
      cx: this.applyJitter(xAxis.getPixelForValue(d.x ?? 0), plotArea.width, jitter?.x),
      cy: this.applyJitter(yAxis.getPixelForValue(d.y ?? 0), plotArea.height, jitter?.y),
    }));

    const bubbles = this.group.selectAll('.katucharts-bubble')
      .data(data)
      .join('circle')
      .attr('class', 'katucharts-bubble')
      .attr('cx', (_, i) => positions[i].cx)
      .attr('cy', (_, i) => positions[i].cy)
      .attr('fill', (d, i) => this.getBubbleFill(d, i, color))
      .attr('fill-opacity', this.config.fillOpacity ?? 0.5)
      .attr('stroke', (d: any, i: number) => this.config.lineColor || this.getBubbleFill(d, i, color))
      .attr('stroke-width', this.config.lineWidth ?? 1)
      .style('cursor', this.config.cursor || 'pointer');

    if (animate) {
      const animOpts = typeof this.config.animation === 'object' ? this.config.animation : {};
      const entryDur = animOpts.duration ?? ENTRY_DURATION;
      bubbles.attr('r', 0)
        .transition().duration(entryDur).ease(EASE_ENTRY)
        .delay((_: any, i: number) => staggerDelay(i, 0, ENTRY_STAGGER_PER_ITEM, data.length))
        .attr('r', (d: PointOptions) => this.sizeScale(this.getZValue(d)));
    } else {
      bubbles.attr('r', (d: PointOptions) => this.sizeScale(this.getZValue(d)));
    }

    this.attachBubbleEvents(bubbles, data, positions, color);

    this.renderDataLabels(
      data,
      (_, i) => positions[i].cx,
      (_, i) => positions[i].cy
    );

    if (animate) {
      this.emitAfterAnimate(ENTRY_DURATION + data.length * ENTRY_STAGGER_PER_ITEM);
    }
  }

  animateUpdate(duration: number): void {
    const { xAxis, yAxis, plotArea } = this.context;
    const color = this.getColor();
    const rawData = this.data.filter(d => d.y !== null && d.y !== undefined);
    const data = this.filterByZThreshold(rawData);
    const jitter = this.config.jitter;

    this.buildSizeScale(data);

    const positions = data.map(d => ({
      cx: this.applyJitter(xAxis.getPixelForValue(d.x ?? 0), plotArea.width, jitter?.x),
      cy: this.applyJitter(yAxis.getPixelForValue(d.y ?? 0), plotArea.height, jitter?.y),
    }));

    const bubbles = this.group.selectAll<SVGCircleElement, PointOptions>('.katucharts-bubble')
      .data(data);

    bubbles.exit().transition().duration(duration).attr('r', 0).remove();

    const enter = bubbles.enter().append('circle')
      .attr('class', 'katucharts-bubble')
      .attr('r', 0)
      .attr('fill', (d, i) => this.getBubbleFill(d, i, color))
      .attr('fill-opacity', this.config.fillOpacity ?? 0.5)
      .attr('stroke', (d: any, i: number) => this.config.lineColor || this.getBubbleFill(d, i, color))
      .attr('stroke-width', this.config.lineWidth ?? 1);

    enter.merge(bubbles)
      .transition().duration(duration)
      .attr('cx', (_, i) => positions[i]?.cx ?? 0)
      .attr('cy', (_, i) => positions[i]?.cy ?? 0)
      .attr('r', (d: PointOptions) => this.sizeScale(this.getZValue(d)))
      .attr('fill', (d: PointOptions, i: number) => this.getBubbleFill(d, i, color));

    this.group.selectAll('.katucharts-data-labels').remove();
    this.renderDataLabels(
      data,
      (_, i) => positions[i]?.cx ?? 0,
      (_, i) => positions[i]?.cy ?? 0
    );
  }

  private filterByZThreshold(data: PointOptions[]): PointOptions[] {
    const displayNegative = this.config.displayNegative !== false;
    const zThreshold = this.config.zThreshold ?? 0;

    if (displayNegative) return data;

    return data.filter(d => (d.z ?? 0) >= zThreshold);
  }

  private getZValue(d: PointOptions): number {
    const z = d.z ?? 1;
    return this.config.sizeByAbsoluteValue ? Math.abs(z) : z;
  }

  private buildSizeScale(data: PointOptions[]): void {
    const zValues = data.map(d => this.getZValue(d));
    const zMin = this.config.zMin ?? Math.min(...zValues, 0);
    const zMax = this.config.zMax ?? Math.max(...zValues, 1);

    const minSize = this.parseSize(this.config.minSize, 8);
    const maxSize = this.parseSize(this.config.maxSize, 30);

    const sizeBy = this.config.sizeBy || 'area';
    if (sizeBy === 'width') {
      this.sizeScale = scaleLinear()
        .domain([zMin, zMax])
        .range([minSize, maxSize])
        .clamp(true) as any;
    } else {
      this.sizeScale = scaleSqrt()
        .domain([zMin, zMax])
        .range([minSize, maxSize])
        .clamp(true) as any;
    }
  }

  private parseSize(value: string | number | undefined, fallback: number): number {
    if (value === undefined) return fallback;
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.endsWith('%')) {
      const pct = parseFloat(value) / 100;
      return Math.min(this.context.plotArea.width, this.context.plotArea.height) * pct / 2;
    }
    return parseFloat(value) || fallback;
  }

  private getBubbleFill(d: PointOptions, i: number, seriesColor: string): string {
    if (d.color) return d.color;
    if (this.config.negativeColor && (d.z ?? 0) < (this.config.zThreshold ?? 0)) {
      return this.config.negativeColor;
    }
    if (this.config.colorByPoint) {
      const palette = this.config.colors || this.context.colors;
      return palette[i % palette.length];
    }
    return seriesColor;
  }

  private attachBubbleEvents(
    bubbles: any, data: PointOptions[],
    positions: { cx: number; cy: number }[], color: string
  ): void {
    if (this.config.enableMouseTracking === false) return;

    const hoverBrightness = this.config.states?.hover?.brightness ?? 0.1;

    const baseFillOpacity = this.config.fillOpacity ?? 0.5;

    bubbles
      .on('mouseover', (event: MouseEvent, d: PointOptions) => {
        const target = event.currentTarget as SVGCircleElement;
        const baseR = this.sizeScale(this.getZValue(d));
        select(target).interrupt('hover')
          .transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER)
          .attr('r', baseR + 4)
          .attr('fill-opacity', Math.min(baseFillOpacity + 0.3, 1));
        target.style.filter = 'drop-shadow(0 2px 6px rgba(0,0,0,0.3))';
        const i = data.indexOf(d);
        this.context.events.emit('point:mouseover', {
          point: d, index: i, series: this, event,
          plotX: positions[i]?.cx ?? 0,
          plotY: positions[i]?.cy ?? 0,
        });
        d.events?.mouseOver?.call(d, event);
        this.config.point?.events?.mouseOver?.call(d, event);
      })
      .on('mouseout', (event: MouseEvent, d: PointOptions) => {
        const target = event.currentTarget as SVGCircleElement;
        select(target).interrupt('hover')
          .transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER)
          .attr('r', this.sizeScale(this.getZValue(d)))
          .attr('fill-opacity', baseFillOpacity);
        target.style.filter = '';
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
        this.handlePointSelect(select(event.currentTarget as Element), d, i, event);
      });
  }

  getDataExtents() {
    let xMin = Infinity, xMax = -Infinity;
    let yMin = Infinity, yMax = -Infinity;

    for (const point of this.data) {
      if (point.x !== undefined && point.x !== null) {
        xMin = Math.min(xMin, point.x);
        xMax = Math.max(xMax, point.x);
      }
      if (point.y !== undefined && point.y !== null) {
        yMin = Math.min(yMin, point.y);
        yMax = Math.max(yMax, point.y);
      }
    }

    const xRange = xMax - xMin || 1;
    const yRange = yMax - yMin || 1;
    const pad = 0.08;
    xMin -= xRange * pad;
    xMax += xRange * pad;
    yMin -= yRange * pad;
    yMax += yRange * pad;

    return { xMin, xMax, yMin, yMax };
  }
}

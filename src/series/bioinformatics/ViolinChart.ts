/**
 * Violin plot with kernel density estimation for distribution visualization.
 * Supports optional inner boxplot, jittered points, and split violins.
 */

import { area as d3Area, curveMonotoneY } from 'd3-shape';
import { scaleLinear } from 'd3-scale';
import 'd3-transition';
import { select } from 'd3-selection';
import { BaseSeries, staggerDelay } from '../BaseSeries';
import type { InternalSeriesConfig, PointOptions } from '../../types/options';
import {
  ENTRY_DURATION,
  ENTRY_STAGGER_PER_ITEM,
  HOVER_DURATION,
  EASE_ENTRY,
  EASE_HOVER,
} from '../../core/animationConstants';

function gaussianKernel(u: number): number {
  return (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * u * u);
}

function computeKDE(values: number[], bandwidth: number, nPoints: number): { value: number; density: number }[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = range / (nPoints - 1);
  const result: { value: number; density: number }[] = [];

  for (let i = 0; i < nPoints; i++) {
    const x = min + step * i;
    let sum = 0;
    for (const v of values) {
      sum += gaussianKernel((x - v) / bandwidth);
    }
    result.push({ value: x, density: sum / (values.length * bandwidth) });
  }
  return result;
}

function silvermanBandwidth(values: number[]): number {
  const n = values.length;
  if (n < 2) return 1;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  const stddev = Math.sqrt(variance);
  return 1.06 * stddev * Math.pow(n, -0.2);
}

export class ViolinChart extends BaseSeries {
  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  render(): void {
    const { xAxis, yAxis, plotArea } = this.context;
    const animate = this.context.animate;
    const data = this.data;

    const resolution = this.config.resolution ?? 50;
    const showBoxplot = this.config.showBoxplot ?? false;
    const showPoints = this.config.showPoints ?? false;
    const pointRadius = this.config.pointRadius ?? 2;
    const fillOpacity = this.config.fillOpacity ?? 0.3;
    const side = this.config.side ?? 'both';
    const color = this.getColor();

    const { violinWidth, violinOffset } = this.computeViolinGeometry();

    const animOpts = typeof this.config.animation === 'object' ? this.config.animation : {};
    const entryDur = animOpts.duration ?? ENTRY_DURATION;

    for (let i = 0; i < data.length; i++) {
      const d = data[i] as any;
      const values: number[] = d.custom?.values || d.values || [];
      if (values.length === 0) continue;

      const precomputedKde = d.custom?.kde;
      const bandwidth = this.config.bandwidth ?? silvermanBandwidth(values);
      const kde = precomputedKde || computeKDE(values, bandwidth, resolution);

      const cx = xAxis.getPixelForValue(d.x ?? i) + violinOffset + violinWidth / 2;
      const fillColor = d.color || color;

      const maxDensity = Math.max(...kde.map((k: any) => k.density));
      const halfWidth = violinWidth / 2;

      const densityScale = scaleLinear()
        .domain([0, maxDensity])
        .range([0, halfWidth]);

      const g = this.group.append('g')
        .attr('class', 'katucharts-violin-point')
        .style('cursor', this.config.cursor || 'default');

      if (side === 'both' || side === 'left') {
        const leftArea = d3Area<{ value: number; density: number }>()
          .y(k => yAxis.getPixelForValue(k.value))
          .x0(cx)
          .x1(k => cx - densityScale(k.density))
          .curve(curveMonotoneY);

        const leftPath = g.append('path')
          .attr('d', leftArea(kde))
          .attr('fill', fillColor)
          .attr('fill-opacity', fillOpacity)
          .attr('stroke', fillColor)
          .attr('stroke-width', 1);

        if (animate) {
          leftPath.attr('opacity', 0)
            .transition().duration(entryDur).ease(EASE_ENTRY).delay(staggerDelay(i, 0, ENTRY_STAGGER_PER_ITEM, data.length))
            .attr('opacity', 1);
        }
      }

      if (side === 'both' || side === 'right') {
        const rightArea = d3Area<{ value: number; density: number }>()
          .y(k => yAxis.getPixelForValue(k.value))
          .x0(cx)
          .x1(k => cx + densityScale(k.density))
          .curve(curveMonotoneY);

        const rightPath = g.append('path')
          .attr('d', rightArea(kde))
          .attr('fill', fillColor)
          .attr('fill-opacity', fillOpacity)
          .attr('stroke', fillColor)
          .attr('stroke-width', 1);

        if (animate) {
          rightPath.attr('opacity', 0)
            .transition().duration(entryDur).ease(EASE_ENTRY).delay(staggerDelay(i, 0, ENTRY_STAGGER_PER_ITEM, data.length))
            .attr('opacity', 1);
        }
      }

      if (showBoxplot && values.length >= 5) {
        this.renderInnerBoxplot(g, values, cx, yAxis, fillColor, !!animate, entryDur, i);
      }

      if (showPoints) {
        this.renderInnerPoints(g, values, cx, yAxis, fillColor, pointRadius, halfWidth, showPoints === 'jitter');
      }

      this.attachViolinEvents(g, d, i, cx, yAxis.getPixelForValue(this.median(values)));
    }

    if (animate) {
      this.emitAfterAnimate(entryDur + data.length * ENTRY_STAGGER_PER_ITEM);
    }
  }

  private renderInnerBoxplot(
    g: any, values: number[], cx: number, yAxis: any,
    color: string, animate: boolean, dur: number, idx: number
  ): void {
    const sorted = [...values].sort((a, b) => a - b);
    const q1 = this.quantile(sorted, 0.25);
    const median = this.median(values);
    const q3 = this.quantile(sorted, 0.75);
    const iqr = q3 - q1;
    const whiskerLow = Math.max(sorted[0], q1 - 1.5 * iqr);
    const whiskerHigh = Math.min(sorted[sorted.length - 1], q3 + 1.5 * iqr);

    const boxWidth = 8;

    const box = g.append('rect')
      .attr('x', cx - boxWidth / 2)
      .attr('width', boxWidth)
      .attr('fill', '#fff')
      .attr('stroke', color)
      .attr('stroke-width', 1.5)
      .attr('opacity', 0.9)
      .attr('rx', 4);

    const medLine = g.append('line')
      .attr('x1', cx - boxWidth / 2).attr('x2', cx + boxWidth / 2)
      .attr('stroke', color).attr('stroke-width', 2);

    const stem = g.append('line')
      .attr('x1', cx).attr('x2', cx)
      .attr('stroke', color).attr('stroke-width', 1);

    if (animate) {
      const midY = yAxis.getPixelForValue(median);
      box.attr('y', midY).attr('height', 0)
        .transition().duration(dur).ease(EASE_ENTRY).delay(idx * ENTRY_STAGGER_PER_ITEM)
        .attr('y', yAxis.getPixelForValue(q3))
        .attr('height', Math.abs(yAxis.getPixelForValue(q1) - yAxis.getPixelForValue(q3)));

      medLine.attr('y1', midY).attr('y2', midY)
        .transition().duration(dur).ease(EASE_ENTRY).delay(idx * ENTRY_STAGGER_PER_ITEM)
        .attr('y1', yAxis.getPixelForValue(median))
        .attr('y2', yAxis.getPixelForValue(median));

      stem.attr('y1', midY).attr('y2', midY)
        .transition().duration(dur).ease(EASE_ENTRY).delay(idx * ENTRY_STAGGER_PER_ITEM)
        .attr('y1', yAxis.getPixelForValue(whiskerLow))
        .attr('y2', yAxis.getPixelForValue(whiskerHigh));
    } else {
      box.attr('y', yAxis.getPixelForValue(q3))
        .attr('height', Math.abs(yAxis.getPixelForValue(q1) - yAxis.getPixelForValue(q3)));
      medLine.attr('y1', yAxis.getPixelForValue(median))
        .attr('y2', yAxis.getPixelForValue(median));
      stem.attr('y1', yAxis.getPixelForValue(whiskerLow))
        .attr('y2', yAxis.getPixelForValue(whiskerHigh));
    }
  }

  private renderInnerPoints(
    g: any, values: number[], cx: number, yAxis: any,
    color: string, radius: number, halfWidth: number, jitter: boolean
  ): void {
    for (const v of values) {
      const py = yAxis.getPixelForValue(v);
      const px = jitter ? cx + (Math.random() - 0.5) * halfWidth * 0.8 : cx;

      g.append('circle')
        .attr('cx', px)
        .attr('cy', py)
        .attr('r', radius)
        .attr('fill', color)
        .attr('opacity', 0.5);
    }
  }

  private quantile(sorted: number[], p: number): number {
    const idx = p * (sorted.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    const frac = idx - lo;
    return sorted[lo] * (1 - frac) + sorted[hi] * frac;
  }

  private median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    return this.quantile(sorted, 0.5);
  }

  private computeViolinGeometry() {
    const { plotArea } = this.context;
    const data = this.data;
    const totalInGroup = (this.config.grouping !== false) ? (this.context.totalSeriesOfType || 1) : 1;
    const indexInGroup = (this.config.grouping !== false) ? (this.context.indexInType || 0) : 0;
    const groupPadding = this.config.groupPadding ?? 0.2;
    const pointPadding = this.config.pointPadding ?? 0.1;

    let groupWidth: number;
    if (this.config.pointWidth !== undefined) {
      groupWidth = this.config.pointWidth * totalInGroup * 1.5;
    } else {
      groupWidth = Math.min(80 * totalInGroup, (plotArea.width / Math.max(data.length, 1)));
    }

    let violinWidth: number;
    if (this.config.pointWidth !== undefined) {
      violinWidth = this.config.pointWidth;
    } else {
      violinWidth = (groupWidth * (1 - groupPadding * 2)) / totalInGroup * (1 - pointPadding * 2);
      if (this.config.maxPointWidth !== undefined) {
        violinWidth = Math.min(violinWidth, this.config.maxPointWidth);
      }
      violinWidth = Math.min(violinWidth, 80);
    }

    const groupStart = -groupWidth * (1 - groupPadding * 2) / 2;
    const violinOffset = groupStart + (violinWidth + violinWidth * pointPadding * 2) * indexInGroup + violinWidth * pointPadding;

    return { violinWidth, violinOffset };
  }

  private attachViolinEvents(g: any, d: any, i: number, cx: number, medianPx: number): void {
    if (this.config.enableMouseTracking === false) return;

    g.on('mouseover', (event: MouseEvent) => {
      g.selectAll('path').interrupt('hover')
        .transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER)
        .attr('fill-opacity', (this.config.fillOpacity ?? 0.3) + 0.2);
      g.style('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))');
      this.context.events.emit('point:mouseover', {
        point: d, index: i, series: this, event,
        plotX: cx, plotY: medianPx,
      });
      d.events?.mouseOver?.call(d, event);
      this.config.point?.events?.mouseOver?.call(d, event);
    })
    .on('mouseout', (event: MouseEvent) => {
      g.selectAll('path').interrupt('hover')
        .transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER)
        .attr('fill-opacity', this.config.fillOpacity ?? 0.3);
      g.style('filter', '');
      this.context.events.emit('point:mouseout', { point: d, index: i, series: this, event });
      d.events?.mouseOut?.call(d, event);
      this.config.point?.events?.mouseOut?.call(d, event);
    })
    .on('click', (event: MouseEvent) => {
      this.context.events.emit('point:click', { point: d, index: i, series: this, event });
      d.events?.click?.call(d, event);
      this.config.point?.events?.click?.call(d, event);
      this.config.events?.click?.call(this, event);
    });
  }

  getDataExtents() {
    let xMin = Infinity, xMax = -Infinity;
    let yMin = Infinity, yMax = -Infinity;

    for (let i = 0; i < this.data.length; i++) {
      const d = this.data[i] as any;
      const x = d.x ?? i;
      xMin = Math.min(xMin, x);
      xMax = Math.max(xMax, x);

      const values: number[] = d.custom?.values || d.values || [];
      for (const v of values) {
        yMin = Math.min(yMin, v);
        yMax = Math.max(yMax, v);
      }
    }

    return { xMin, xMax, yMin, yMax };
  }
}

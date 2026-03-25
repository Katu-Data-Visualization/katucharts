/**
 * Volcano plot for differential expression analysis.
 * x = log2(fold change), y = -log10(p-value).
 * Auto-colors points by significance and renders threshold lines.
 */

import { symbol as d3Symbol, symbolCircle, symbolSquare, symbolDiamond, symbolTriangle } from 'd3-shape';
import { select } from 'd3-selection';
import 'd3-transition';
import { BaseSeries } from '../BaseSeries';
import type { InternalSeriesConfig, PointOptions } from '../../types/options';

const symbolMap: Record<string, any> = {
  circle: symbolCircle,
  square: symbolSquare,
  diamond: symbolDiamond,
  triangle: symbolTriangle,
};

export class VolcanoSeries extends BaseSeries {
  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  render(): void {
    const { xAxis, yAxis, plotArea } = this.context;
    const animate = this.context.animate;
    const data = this.data.filter(d => d.y !== null && d.y !== undefined);

    const pThreshold = this.config.pValueThreshold ?? 0.05;
    const fcThreshold = this.config.foldChangeThreshold ?? 1.0;
    const upColor = this.config.upColor ?? this.context.colors[0] ?? '#e74c3c';
    const downColor = this.config.downColor ?? this.context.colors[1] ?? '#3498db';
    const nsColor = this.config.nsColor ?? '#cccccc';
    const labelTopN = this.config.labelTopN ?? 0;
    const radius = this.config.marker?.radius ?? 3;
    const hoverRadius = this.config.marker?.states?.hover?.radius ?? (radius + 2);

    const negLog10Threshold = -Math.log10(pThreshold);

    this.renderThresholdLines(negLog10Threshold, fcThreshold);
    this.renderPoints(data, negLog10Threshold, fcThreshold, upColor, downColor, nsColor, radius, hoverRadius, !!animate);

    if (labelTopN > 0) {
      this.renderTopLabels(data, negLog10Threshold, fcThreshold, labelTopN);
    }

    if (animate) {
      this.emitAfterAnimate(600 + data.length * 5);
    }
  }

  private classifyPoint(d: PointOptions, negLog10Threshold: number, fcThreshold: number): 'up' | 'down' | 'ns' {
    if (d.custom?.direction) return d.custom.direction;
    const x = d.x ?? 0;
    const y = d.y ?? 0;
    if (y >= negLog10Threshold && x >= fcThreshold) return 'up';
    if (y >= negLog10Threshold && x <= -fcThreshold) return 'down';
    return 'ns';
  }

  private getPointColor(d: PointOptions, negLog10Threshold: number, fcThreshold: number,
    upColor: string, downColor: string, nsColor: string): string {
    if (d.color) return d.color;
    const cls = this.classifyPoint(d, negLog10Threshold, fcThreshold);
    if (cls === 'up') return upColor;
    if (cls === 'down') return downColor;
    return nsColor;
  }

  private renderThresholdLines(negLog10Threshold: number, fcThreshold: number): void {
    const { xAxis, yAxis, plotArea } = this.context;
    const lineColor = this.config.thresholdLineColor ?? '#999999';
    const lineWidth = this.config.thresholdLineWidth ?? 1;
    const dashArray = '6,4';

    const thresholdGroup = this.group.append('g').attr('class', 'katucharts-volcano-thresholds');

    const hLineY = yAxis.getPixelForValue(negLog10Threshold);
    if (hLineY >= 0 && hLineY <= plotArea.height) {
      thresholdGroup.append('line')
        .attr('x1', 0).attr('x2', plotArea.width)
        .attr('y1', hLineY).attr('y2', hLineY)
        .attr('stroke', lineColor).attr('stroke-width', lineWidth)
        .attr('stroke-dasharray', dashArray)
        .attr('opacity', 0.7);
    }

    const leftX = xAxis.getPixelForValue(-fcThreshold);
    if (leftX >= 0 && leftX <= plotArea.width) {
      thresholdGroup.append('line')
        .attr('x1', leftX).attr('x2', leftX)
        .attr('y1', 0).attr('y2', plotArea.height)
        .attr('stroke', lineColor).attr('stroke-width', lineWidth)
        .attr('stroke-dasharray', dashArray)
        .attr('opacity', 0.7);
    }

    const rightX = xAxis.getPixelForValue(fcThreshold);
    if (rightX >= 0 && rightX <= plotArea.width) {
      thresholdGroup.append('line')
        .attr('x1', rightX).attr('x2', rightX)
        .attr('y1', 0).attr('y2', plotArea.height)
        .attr('stroke', lineColor).attr('stroke-width', lineWidth)
        .attr('stroke-dasharray', dashArray)
        .attr('opacity', 0.7);
    }
  }

  private renderPoints(
    data: PointOptions[], negLog10Threshold: number, fcThreshold: number,
    upColor: string, downColor: string, nsColor: string,
    radius: number, hoverRadius: number, animate: boolean
  ): void {
    const { xAxis, yAxis } = this.context;
    const markerSymbol = this.config.marker?.symbol || 'circle';
    const lineColor = this.config.marker?.lineColor;
    const lineWidth = this.config.marker?.lineWidth ?? 0;
    const animOpts = typeof this.config.animation === 'object' ? this.config.animation : {};
    const entryDur = animOpts.duration ?? 600;

    const positions = data.map(d => ({
      cx: xAxis.getPixelForValue(d.x ?? 0),
      cy: yAxis.getPixelForValue(d.y ?? 0),
    }));

    if (markerSymbol === 'circle') {
      const circles = this.group.selectAll('.katucharts-volcano-point')
        .data(data)
        .join('circle')
        .attr('class', 'katucharts-volcano-point')
        .attr('cx', (_, i) => positions[i].cx)
        .attr('cy', (_, i) => positions[i].cy)
        .attr('fill', d => this.getPointColor(d, negLog10Threshold, fcThreshold, upColor, downColor, nsColor))
        .attr('stroke', d => lineColor || this.getPointColor(d, negLog10Threshold, fcThreshold, upColor, downColor, nsColor))
        .attr('stroke-width', lineWidth)
        .attr('opacity', this.config.opacity ?? 0.7)
        .style('cursor', this.config.cursor || 'pointer');

      if (animate) {
        circles.attr('r', 0)
          .transition().duration(entryDur).delay((_, i) => Math.min(i * 2, 500))
          .attr('r', radius);
      } else {
        circles.attr('r', radius);
      }

      this.attachVolcanoEvents(circles, data, positions, radius, hoverRadius);
    } else {
      const symbolType = symbolMap[markerSymbol] || symbolCircle;
      const symbolSize = Math.PI * radius * radius;
      const gen = d3Symbol().type(symbolType).size(symbolSize);

      const symbols = this.group.selectAll('.katucharts-volcano-point')
        .data(data)
        .join('path')
        .attr('class', 'katucharts-volcano-point')
        .attr('transform', (_, i) => `translate(${positions[i].cx},${positions[i].cy})`)
        .attr('fill', d => this.getPointColor(d, negLog10Threshold, fcThreshold, upColor, downColor, nsColor))
        .attr('stroke', d => lineColor || this.getPointColor(d, negLog10Threshold, fcThreshold, upColor, downColor, nsColor))
        .attr('stroke-width', lineWidth)
        .attr('opacity', this.config.opacity ?? 0.7)
        .style('cursor', this.config.cursor || 'pointer');

      if (animate) {
        const zeroGen = d3Symbol().type(symbolType).size(0);
        symbols.attr('d', zeroGen as any)
          .transition().duration(entryDur).delay((_, i) => Math.min(i * 2, 500))
          .attr('d', gen as any);
      } else {
        symbols.attr('d', gen as any);
      }

      const hoverSize = Math.PI * hoverRadius * hoverRadius;
      const hoverGen = d3Symbol().type(symbolType).size(hoverSize);
      this.attachVolcanoEvents(symbols, data, positions, radius, hoverRadius, gen, hoverGen);
    }
  }

  private renderTopLabels(
    data: PointOptions[], negLog10Threshold: number, fcThreshold: number, topN: number
  ): void {
    const { xAxis, yAxis } = this.context;
    const significant = data
      .filter(d => this.classifyPoint(d, negLog10Threshold, fcThreshold) !== 'ns')
      .sort((a, b) => (b.y ?? 0) - (a.y ?? 0))
      .slice(0, topN);

    const labelGroup = this.group.append('g').attr('class', 'katucharts-volcano-labels');
    const placed: { x: number; y: number; w: number; h: number }[] = [];

    for (const d of significant) {
      const label = d.name || d.custom?.label || '';
      if (!label) continue;

      const px = xAxis.getPixelForValue(d.x ?? 0);
      const py = yAxis.getPixelForValue(d.y ?? 0) - 8;

      const approxW = label.length * 6;
      const approxH = 12;
      const overlaps = placed.some(p =>
        Math.abs(p.x - px) < (p.w + approxW) / 2 && Math.abs(p.y - py) < (p.h + approxH) / 2
      );
      if (overlaps) continue;

      placed.push({ x: px, y: py, w: approxW, h: approxH });

      labelGroup.append('text')
        .attr('x', px)
        .attr('y', py)
        .attr('text-anchor', 'middle')
        .attr('font-size', '10px')
        .attr('font-style', 'italic')
        .attr('fill', '#333')
        .text(label);
    }
  }

  private attachVolcanoEvents(
    elements: any, data: PointOptions[],
    positions: { cx: number; cy: number }[],
    radius: number, hoverRadius: number,
    gen?: any, hoverGen?: any
  ): void {
    if (this.config.enableMouseTracking === false) return;

    const isCircle = !gen;

    elements
      .on('mouseover', (event: MouseEvent, d: PointOptions) => {
        const target = event.currentTarget as SVGElement;
        const i = data.indexOf(d);

        if (isCircle) {
          (target as SVGCircleElement).setAttribute('r', String(hoverRadius));
        } else if (hoverGen) {
          (target as SVGPathElement).setAttribute('d', hoverGen() as string);
        }
        target.style.filter = 'drop-shadow(0 1px 3px rgba(0,0,0,0.3))';
        target.style.opacity = '1';

        this.context.events.emit('point:mouseover', {
          point: d, index: i, series: this, event,
          plotX: positions[i]?.cx ?? 0,
          plotY: positions[i]?.cy ?? 0,
        });
        d.events?.mouseOver?.call(d, event);
        this.config.point?.events?.mouseOver?.call(d, event);
      })
      .on('mouseout', (event: MouseEvent, d: PointOptions) => {
        const target = event.currentTarget as SVGElement;
        const i = data.indexOf(d);

        if (isCircle) {
          (target as SVGCircleElement).setAttribute('r', String(radius));
        } else if (gen) {
          (target as SVGPathElement).setAttribute('d', gen() as string);
        }
        target.style.filter = '';
        target.style.opacity = String(this.config.opacity ?? 0.7);

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
    let yMin = 0, yMax = -Infinity;

    for (const d of this.data) {
      if (d.x !== undefined && d.x !== null) {
        xMin = Math.min(xMin, d.x);
        xMax = Math.max(xMax, d.x);
      }
      if (d.y !== undefined && d.y !== null) {
        yMax = Math.max(yMax, d.y);
      }
    }

    const fcThreshold = this.config.foldChangeThreshold ?? 1.0;
    xMin = Math.min(xMin, -fcThreshold - 0.5);
    xMax = Math.max(xMax, fcThreshold + 0.5);

    const pThreshold = this.config.pValueThreshold ?? 0.05;
    const negLog10Threshold = -Math.log10(pThreshold);
    yMax = Math.max(yMax, negLog10Threshold + 1);

    return { xMin, xMax, yMin, yMax };
  }
}

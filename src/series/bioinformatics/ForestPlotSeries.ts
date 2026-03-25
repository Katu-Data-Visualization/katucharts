/**
 * Forest plot for meta-analysis visualization.
 * Horizontal effect sizes with confidence intervals, weight-proportional markers,
 * and diamond shapes for summary estimates.
 */

import { select } from 'd3-selection';
import 'd3-transition';
import { BaseSeries } from '../BaseSeries';
import type { InternalSeriesConfig, PointOptions } from '../../types/options';

export class ForestPlotSeries extends BaseSeries {
  constructor(config: InternalSeriesConfig) {
    super(config);
    this.config.clip = false;
  }

  render(): void {
    const { xAxis, yAxis, plotArea } = this.context;
    const animate = this.context.animate;
    const data = this.data.filter(d => d.x !== null && d.x !== undefined);
    const color = this.getColor();

    const nullEffect = this.config.nullEffectValue ?? 1;
    const nullColor = this.config.nullEffectColor ?? '#999';
    const nullDash = this.config.nullEffectDashStyle ?? 'Dash';
    const markerSizeByWeight = this.config.markerSizeByWeight !== false;
    const maxMarkerSize = this.config.maxMarkerSize ?? 15;
    const minMarkerSize = this.config.minMarkerSize ?? 4;
    const showLabels = this.config.showStudyLabels !== false;
    const showEstimates = this.config.showEstimates !== false;
    const summaryColor = this.config.summaryDiamondColor ?? color;
    const lineWidth = this.config.lineWidth ?? 1.5;

    const animOpts = typeof this.config.animation === 'object' ? this.config.animation : {};
    const entryDur = animOpts.duration ?? 600;

    const maxWeight = Math.max(...data.map(d => d.custom?.weight ?? 1));

    this.renderNullEffectLine(nullEffect, nullColor);

    for (let i = 0; i < data.length; i++) {
      const d = data[i] as any;
      const effectX = xAxis.getPixelForValue(d.x ?? 0);
      const rowY = yAxis.getPixelForValue(d.y ?? i);
      const ciLower = d.custom?.ciLower ?? d.x;
      const ciUpper = d.custom?.ciUpper ?? d.x;
      const ciLowerX = xAxis.getPixelForValue(ciLower);
      const ciUpperX = xAxis.getPixelForValue(ciUpper);
      const isSummary = d.custom?.isSummary ?? false;
      const weight = d.custom?.weight ?? 1;
      const pointColor = d.color || color;

      const g = this.group.append('g')
        .attr('class', 'katucharts-forest-row')
        .style('cursor', this.config.cursor || 'pointer');

      if (isSummary) {
        this.renderDiamond(g, effectX, rowY, ciLowerX, ciUpperX, summaryColor, !!animate, entryDur, i);
      } else {
        const ciLine = g.append('line')
          .attr('y1', rowY).attr('y2', rowY)
          .attr('stroke', pointColor).attr('stroke-width', lineWidth);

        const markerSize = markerSizeByWeight
          ? minMarkerSize + (maxMarkerSize - minMarkerSize) * (weight / maxWeight)
          : (maxMarkerSize + minMarkerSize) / 2;

        const marker = g.append('rect')
          .attr('y', rowY - markerSize / 2)
          .attr('width', markerSize).attr('height', markerSize)
          .attr('fill', pointColor);

        if (animate) {
          ciLine.attr('x1', effectX).attr('x2', effectX)
            .transition().duration(entryDur).delay(i * 60)
            .attr('x1', ciLowerX).attr('x2', ciUpperX);

          marker.attr('x', effectX - markerSize / 2).attr('opacity', 0)
            .transition().duration(entryDur).delay(i * 60)
            .attr('x', effectX - markerSize / 2).attr('opacity', 1);
        } else {
          ciLine.attr('x1', ciLowerX).attr('x2', ciUpperX);
          marker.attr('x', effectX - markerSize / 2);
        }

        const capHeight = 6;
        g.append('line')
          .attr('x1', ciLowerX).attr('x2', ciLowerX)
          .attr('y1', rowY - capHeight / 2).attr('y2', rowY + capHeight / 2)
          .attr('stroke', pointColor).attr('stroke-width', lineWidth);
        g.append('line')
          .attr('x1', ciUpperX).attr('x2', ciUpperX)
          .attr('y1', rowY - capHeight / 2).attr('y2', rowY + capHeight / 2)
          .attr('stroke', pointColor).attr('stroke-width', lineWidth);
      }

      if (showLabels && d.name) {
        g.append('text')
          .attr('x', -10)
          .attr('y', rowY)
          .attr('text-anchor', 'end')
          .attr('dominant-baseline', 'central')
          .attr('font-size', isSummary ? '11px' : '10px')
          .attr('font-weight', isSummary ? 'bold' : 'normal')
          .attr('fill', '#333')
          .text(d.name);
      }

      if (showEstimates) {
        const ciText = `${(d.x ?? 0).toFixed(2)} [${ciLower.toFixed(2)}, ${ciUpper.toFixed(2)}]`;
        g.append('text')
          .attr('x', plotArea.width + 10)
          .attr('y', rowY)
          .attr('text-anchor', 'start')
          .attr('dominant-baseline', 'central')
          .attr('font-size', '10px')
          .attr('font-family', 'monospace')
          .attr('fill', '#333')
          .text(ciText);
      }

      this.attachRowEvents(g, d, i, effectX, rowY);
    }

    if (animate) {
      this.emitAfterAnimate(entryDur + data.length * 60);
    }
  }

  private renderNullEffectLine(nullEffect: number, color: string): void {
    const { xAxis, plotArea } = this.context;
    const nullX = xAxis.getPixelForValue(nullEffect);

    if (nullX >= 0 && nullX <= plotArea.width) {
      this.group.append('line')
        .attr('class', 'katucharts-forest-null')
        .attr('x1', nullX).attr('x2', nullX)
        .attr('y1', 0).attr('y2', plotArea.height)
        .attr('stroke', color).attr('stroke-width', 1)
        .attr('stroke-dasharray', '6,4')
        .attr('opacity', 0.7);
    }
  }

  private renderDiamond(
    g: any, cx: number, cy: number,
    leftX: number, rightX: number, color: string,
    animate: boolean, duration: number, idx: number
  ): void {
    const halfH = 8;
    const diamondPath = `M${leftX},${cy} L${cx},${cy - halfH} L${rightX},${cy} L${cx},${cy + halfH} Z`;

    const diamond = g.append('path')
      .attr('d', diamondPath)
      .attr('fill', color)
      .attr('stroke', color)
      .attr('stroke-width', 1);

    if (animate) {
      diamond.attr('opacity', 0)
        .transition().duration(duration).delay(idx * 60)
        .attr('opacity', 1);
    }
  }

  private attachRowEvents(g: any, d: any, i: number, cx: number, cy: number): void {
    if (this.config.enableMouseTracking === false) return;

    g.on('mouseover', (event: MouseEvent) => {
      g.style('filter', 'drop-shadow(0 1px 3px rgba(0,0,0,0.2))');
      this.context.events.emit('point:mouseover', {
        point: d, index: i, series: this, event,
        plotX: cx, plotY: cy,
      });
      d.events?.mouseOver?.call(d, event);
      this.config.point?.events?.mouseOver?.call(d, event);
    })
    .on('mouseout', (event: MouseEvent) => {
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
      const ciLower = d.custom?.ciLower ?? d.x ?? 0;
      const ciUpper = d.custom?.ciUpper ?? d.x ?? 0;
      xMin = Math.min(xMin, ciLower);
      xMax = Math.max(xMax, ciUpper);

      const y = d.y ?? i;
      yMin = Math.min(yMin, y);
      yMax = Math.max(yMax, y);
    }

    const nullEffect = this.config.nullEffectValue ?? 1;
    xMin = Math.min(xMin, nullEffect);
    xMax = Math.max(xMax, nullEffect);

    const padding = (xMax - xMin) * 0.1;
    xMin -= padding;
    xMax += padding;

    return { xMin, xMax, yMin: yMin - 0.5, yMax: yMax + 0.5 };
  }
}

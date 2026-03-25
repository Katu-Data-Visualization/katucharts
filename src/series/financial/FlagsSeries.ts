/**
 * Event marker/flag series for annotating price charts.
 * Renders flags at specific x positions with configurable shapes
 * (flag, circlepin, squarepin) that can optionally attach to another series.
 */

import { BaseSeries, staggerDelay } from '../BaseSeries';
import type { SeriesContext } from '../BaseSeries';
import type { InternalSeriesConfig, PointOptions } from '../../types/options';

type FlagShape = 'flag' | 'circlepin' | 'squarepin';

const FLAG_WIDTH = 30;
const FLAG_HEIGHT = 20;
const POLE_LENGTH = 25;
const CIRCLE_RADIUS = 8;
const SQUARE_SIZE = 12;
const FONT_SIZE = '9px';

export class FlagsSeries extends BaseSeries {
  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  render(): void {
    const { xAxis, yAxis, plotArea } = this.context;
    const animate = this.context.animate;
    const data = this.data;
    const defaultShape: FlagShape = this.config.shape || 'flag';
    const defaultColor = this.getColor();
    const targetSeries = this.resolveOnSeries();

    for (let i = 0; i < data.length; i++) {
      const d = data[i] as any;
      if (d.x === undefined || d.x === null) continue;

      const px = xAxis.getPixelForValue(d.x ?? i);
      const anchorY = this.resolveAnchorY(d, i, targetSeries, yAxis, plotArea);
      const shape: FlagShape = d.shape || defaultShape;
      const fillColor = d.color || this.config.color || defaultColor;
      const title: string = d.title ?? '';

      const g = this.group.append('g')
        .attr('class', 'katucharts-flag')
        .style('cursor', this.config.cursor || 'pointer');

      const poleTop = anchorY - POLE_LENGTH;

      g.append('line')
        .attr('x1', px)
        .attr('x2', px)
        .attr('y1', anchorY)
        .attr('y2', poleTop)
        .attr('stroke', fillColor)
        .attr('stroke-width', 1);

      this.renderShape(g, shape, px, poleTop, fillColor, title);

      if (animate) {
        const delay = staggerDelay(i, 100, 30, data.length);
        g.attr('opacity', 0)
          .transition().duration(400).delay(delay)
          .attr('opacity', 1);
      }

      this.attachFlagEvents(g, d, i, px, poleTop);
    }
  }

  /**
   * Flags are decorative markers and should not influence the y-axis range.
   * Only x extents are contributed.
   */
  getDataExtents(): { xMin: number; xMax: number; yMin: number; yMax: number } {
    let xMin = Infinity, xMax = -Infinity;

    for (const d of this.data) {
      if (d.x !== undefined && d.x !== null) {
        if (d.x < xMin) xMin = d.x;
        if (d.x > xMax) xMax = d.x;
      }
    }

    return { xMin, xMax, yMin: Infinity, yMax: -Infinity };
  }

  /**
   * Find the series referenced by the onSeries config option.
   * When found, flags will attach at the y-value of that series at each flag's x position.
   */
  private resolveOnSeries(): BaseSeries | null {
    const onSeriesId = this.config.onSeries;
    if (!this.context.allSeries) return null;

    if (onSeriesId) {
      return this.context.allSeries.find(s => s.config.id === onSeriesId) ?? null;
    }

    return this.context.allSeries.find(
      s => s !== this && s.config._internalType !== 'flags'
    ) ?? null;
  }

  /**
   * Determine the vertical anchor point for a flag. If onSeries is set,
   * interpolate the target series y-value at the flag's x position.
   * Otherwise anchor at the top of the plot area.
   */
  private resolveAnchorY(
    d: PointOptions,
    index: number,
    targetSeries: BaseSeries | null,
    yAxis: SeriesContext['yAxis'],
    plotArea: SeriesContext['plotArea']
  ): number {
    if (!targetSeries) return POLE_LENGTH + FLAG_HEIGHT;

    const x = d.x ?? index;
    const targetData = targetSeries.data;

    let closestPoint: PointOptions | null = null;
    let closestDist = Infinity;

    for (const tp of targetData) {
      const tx = tp.x ?? 0;
      const dist = Math.abs(tx - x);
      if (dist < closestDist) {
        closestDist = dist;
        closestPoint = tp;
      }
    }

    if (closestPoint) {
      const high = (closestPoint as any).high ?? closestPoint.y;
      if (high !== undefined && high !== null) {
        return yAxis.getPixelForValue(high);
      }
    }

    return POLE_LENGTH + FLAG_HEIGHT;
  }

  private renderShape(
    g: any,
    shape: FlagShape,
    x: number,
    y: number,
    fill: string,
    title: string
  ): void {
    switch (shape) {
      case 'circlepin':
        g.append('circle')
          .attr('cx', x)
          .attr('cy', y - CIRCLE_RADIUS)
          .attr('r', CIRCLE_RADIUS)
          .attr('fill', fill)
          .attr('stroke', fill)
          .attr('stroke-width', 1);

        if (title) {
          g.append('text')
            .attr('x', x)
            .attr('y', y - CIRCLE_RADIUS)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'central')
            .attr('fill', '#ffffff')
            .attr('font-size', FONT_SIZE)
            .style('pointer-events', 'none')
            .text(title);
        }
        break;

      case 'squarepin':
        g.append('rect')
          .attr('x', x - SQUARE_SIZE / 2)
          .attr('y', y - SQUARE_SIZE - SQUARE_SIZE / 2)
          .attr('width', SQUARE_SIZE)
          .attr('height', SQUARE_SIZE)
          .attr('fill', fill)
          .attr('stroke', fill)
          .attr('stroke-width', 1)
          .attr('transform', `rotate(45,${x},${y - SQUARE_SIZE})`);

        if (title) {
          g.append('text')
            .attr('x', x)
            .attr('y', y - SQUARE_SIZE)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'central')
            .attr('fill', '#ffffff')
            .attr('font-size', FONT_SIZE)
            .style('pointer-events', 'none')
            .text(title);
        }
        break;

      case 'flag':
      default:
        g.append('rect')
          .attr('x', x)
          .attr('y', y - FLAG_HEIGHT)
          .attr('width', FLAG_WIDTH)
          .attr('height', FLAG_HEIGHT)
          .attr('fill', fill)
          .attr('stroke', fill)
          .attr('stroke-width', 1)
          .attr('rx', 2);

        if (title) {
          g.append('text')
            .attr('x', x + FLAG_WIDTH / 2)
            .attr('y', y - FLAG_HEIGHT / 2)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'central')
            .attr('fill', '#ffffff')
            .attr('font-size', FONT_SIZE)
            .style('pointer-events', 'none')
            .text(title);
        }
        break;
    }
  }

  private attachFlagEvents(
    g: any,
    point: PointOptions,
    index: number,
    plotX: number,
    plotY: number
  ): void {
    if (this.config.enableMouseTracking === false) return;

    const pointEvents = point.events || {};
    const seriesPointEvents = this.config.point?.events || {};

    g.on('mouseover', (event: MouseEvent) => {
      g.style('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))');

      this.context.events.emit('point:mouseover', {
        point, index, series: this, event,
        plotX, plotY,
      });
      pointEvents.mouseOver?.call(point, event);
      seriesPointEvents.mouseOver?.call(point, event);
    })
    .on('mouseout', (event: MouseEvent) => {
      g.style('filter', '');

      this.context.events.emit('point:mouseout', {
        point, index, series: this, event,
      });
      pointEvents.mouseOut?.call(point, event);
      seriesPointEvents.mouseOut?.call(point, event);
    })
    .on('click', (event: MouseEvent) => {
      this.context.events.emit('point:click', {
        point, index, series: this, event,
      });
      pointEvents.click?.call(point, event);
      seriesPointEvents.click?.call(point, event);
      this.config.events?.click?.call(this, event);
    });
  }
}

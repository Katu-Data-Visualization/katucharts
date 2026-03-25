/**
 * Renko brick chart series. Price-only chart that filters out time,
 * drawing uniform bricks only when price moves by a fixed amount.
 */

import { BaseSeries, staggerDelay } from '../BaseSeries';
import type { InternalSeriesConfig } from '../../types/options';

interface RenkoBrick {
  index: number;
  direction: 'up' | 'down';
  bottom: number;
  top: number;
}

export class RenkoSeries extends BaseSeries {
  private bricks: RenkoBrick[] = [];

  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  /**
   * Convert raw close prices into Renko bricks. A new brick is created
   * each time the close price moves brickSize away from the last brick's edge.
   */
  processData(): void {
    super.processData();

    const brickSize = (this.config as any).brickSize ?? 1;
    const closes = this.data
      .map(d => (d as any).close ?? d.y)
      .filter((v): v is number => v !== null && v !== undefined);

    this.bricks = [];
    if (closes.length < 2) return;

    let lastPrice = Math.floor(closes[0] / brickSize) * brickSize;
    let brickIndex = 0;

    for (let i = 1; i < closes.length; i++) {
      const price = closes[i];
      const diff = price - lastPrice;
      const numBricks = Math.floor(Math.abs(diff) / brickSize);

      if (numBricks >= 1) {
        const direction: 'up' | 'down' = diff > 0 ? 'up' : 'down';
        for (let b = 0; b < numBricks; b++) {
          const bottom = direction === 'up'
            ? lastPrice + b * brickSize
            : lastPrice - (b + 1) * brickSize;
          this.bricks.push({
            index: brickIndex++,
            direction,
            bottom,
            top: bottom + brickSize,
          });
        }
        lastPrice += (direction === 'up' ? 1 : -1) * numBricks * brickSize;
      }
    }
  }

  render(): void {
    const { xAxis, yAxis, plotArea } = this.context;
    const animate = this.context.animate;
    const bricks = this.bricks;

    if (bricks.length === 0) return;

    const upColor = (this.config as any).upColor || '#2f7ed8';
    const downColor = (this.config as any).downColor || this.config.color || '#f45b5b';
    const inactiveOpacity = this.config.states?.inactive?.opacity ?? 0.4;
    const brickWidth = Math.max(1, plotArea.width / Math.max(1, bricks.length) * 0.8);
    const groups: any[] = [];

    for (let i = 0; i < bricks.length; i++) {
      const brick = bricks[i];
      const cx = xAxis.getPixelForValue(brick.index);
      const yTop = yAxis.getPixelForValue(brick.top);
      const yBottom = yAxis.getPixelForValue(brick.bottom);
      const height = Math.max(1, Math.abs(yBottom - yTop));
      const color = brick.direction === 'up' ? upColor : downColor;

      const rect = this.group.append('rect')
        .attr('class', 'katucharts-renko-brick')
        .attr('x', cx - brickWidth / 2)
        .attr('y', Math.min(yTop, yBottom))
        .attr('width', brickWidth)
        .attr('height', height)
        .attr('fill', color)
        .attr('stroke', color)
        .attr('stroke-width', 0.5)
        .style('cursor', this.config.cursor || 'pointer');

      groups.push(rect);

      if (animate) {
        rect.attr('opacity', 0)
          .transition()
          .duration(400)
          .delay(staggerDelay(i, 100, 20, bricks.length))
          .attr('opacity', 1);
      }

      if (this.config.enableMouseTracking !== false) {
        rect
          .on('mouseover', (event: MouseEvent) => {
            rect.style('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.25))');
            groups.forEach((g, j) => {
              if (j !== i) g.transition('highlight').duration(150).attr('opacity', inactiveOpacity);
            });
            this.context.events.emit('point:mouseover', {
              point: { x: brick.index, y: brick.top, low: brick.bottom, high: brick.top, direction: brick.direction },
              index: i, series: this, event,
              plotX: cx, plotY: yTop,
            });
          })
          .on('mouseout', (event: MouseEvent) => {
            rect.style('filter', '');
            groups.forEach(g => g.interrupt('highlight'));
            groups.forEach(g => g.transition('highlight').duration(150).attr('opacity', 1));
            this.context.events.emit('point:mouseout', {
              point: { x: brick.index, y: brick.top },
              index: i, series: this, event,
            });
          })
          .on('click', (event: MouseEvent) => {
            this.context.events.emit('point:click', {
              point: { x: brick.index, y: brick.top, direction: brick.direction },
              index: i, series: this, event,
            });
            this.config.events?.click?.call(this, event);
          });
      }
    }

    if (animate) {
      this.emitAfterAnimate(100 + bricks.length * 20 + 400);
    }
  }

  getDataExtents() {
    if (this.bricks.length === 0) {
      this.processData();
    }
    if (this.bricks.length === 0) {
      return { xMin: 0, xMax: 0, yMin: 0, yMax: 0 };
    }

    let yMin = Infinity;
    let yMax = -Infinity;

    for (const brick of this.bricks) {
      if (brick.bottom < yMin) yMin = brick.bottom;
      if (brick.top > yMax) yMax = brick.top;
    }

    return {
      xMin: 0,
      xMax: this.bricks.length - 1,
      yMin,
      yMax,
    };
  }
}

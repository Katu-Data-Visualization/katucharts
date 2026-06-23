/**
 * Column range series: a vertical bar spanning from a low to a high value at
 * each x (e.g. daily temperature min/max).
 */

import { BaseSeries, staggerDelay } from '../BaseSeries';
import type { InternalSeriesConfig } from '../../types/options';
import {
  ENTRY_DURATION,
  ENTRY_STAGGER_PER_ITEM,
  HOVER_DURATION,
  EASE_ENTRY,
  EASE_HOVER,
} from '../../core/animationConstants';

export class ColumnRangeChart extends BaseSeries {
  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  render(): void {
    const { xAxis, yAxis, plotArea } = this.context;
    const animate = this.context.animate;
    const data = this.data;

    const groupPadding = this.config.groupPadding ?? 0.2;
    const pointPadding = this.config.pointPadding ?? 0.1;
    const totalPadding = groupPadding + pointPadding;
    const maxPointWidth = this.config.maxPointWidth ?? Infinity;
    const computedWidth = Math.max(
      1,
      Math.min(maxPointWidth, (plotArea.width / Math.max(1, data.length)) * (1 - totalPadding))
    );
    const barWidth = this.config.pointWidth ?? computedWidth;

    const color = this.getColor();
    const borderRadius = (this.config as any).borderRadius ?? 0;
    const inactiveOpacity = this.config.states?.inactive?.opacity ?? 0.4;

    const bars: any[] = [];

    for (let i = 0; i < data.length; i++) {
      const d = data[i] as any;
      const low = d.low;
      const high = d.high ?? d.y;
      if (low === undefined || low === null || high === undefined || high === null) continue;

      const cx = xAxis.getPixelForValue(d.x ?? i);
      const yHigh = yAxis.getPixelForValue(high);
      const yLow = yAxis.getPixelForValue(low);
      const barTop = Math.min(yHigh, yLow);
      const barHeight = Math.max(1, Math.abs(yLow - yHigh));
      const fill = d.color || color;

      const rect = this.group.append('rect')
        .attr('class', 'katucharts-columnrange-bar')
        .attr('x', cx - barWidth / 2)
        .attr('width', barWidth)
        .attr('fill', fill)
        .attr('rx', borderRadius)
        .style('cursor', this.config.cursor || 'pointer');

      if (animate) {
        const mid = (barTop + barHeight / 2);
        rect.attr('y', mid).attr('height', 0)
          .transition().duration(ENTRY_DURATION).ease(EASE_ENTRY)
          .delay(staggerDelay(i, 0, ENTRY_STAGGER_PER_ITEM, data.length))
          .attr('y', barTop).attr('height', barHeight);
      } else {
        rect.attr('y', barTop).attr('height', barHeight);
      }

      bars.push(rect);

      if (this.config.enableMouseTracking !== false) {
        rect
          .on('mouseover', (event: MouseEvent) => {
            rect.transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER).attr('opacity', 0.85);
            bars.forEach((b, j) => {
              if (j !== i) b.interrupt('highlight');
              if (j !== i) b.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER).attr('opacity', inactiveOpacity);
            });
            this.context.events.emit('point:mouseover', {
              point: d, index: i, series: this, event, plotX: cx, plotY: yHigh,
            });
            d.events?.mouseOver?.call(d, event);
          })
          .on('mouseout', (event: MouseEvent) => {
            rect.transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER).attr('opacity', 1);
            bars.forEach(b => { b.interrupt('highlight'); b.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER).attr('opacity', 1); });
            this.context.events.emit('point:mouseout', { point: d, index: i, series: this, event });
            d.events?.mouseOut?.call(d, event);
          })
          .on('click', (event: MouseEvent) => {
            this.context.events.emit('point:click', { point: d, index: i, series: this, event });
            d.events?.click?.call(d, event);
            this.config.events?.click?.call(this, event);
          });
      }
    }

    if (animate) {
      this.emitAfterAnimate(ENTRY_DURATION + data.length * ENTRY_STAGGER_PER_ITEM);
    }
  }

  getDataExtents(): { xMin: number; xMax: number; yMin: number; yMax: number } {
    let xMin = Infinity, xMax = -Infinity;
    let yMin = Infinity, yMax = -Infinity;

    for (const d of this.data) {
      const x = d.x ?? 0;
      if (x < xMin) xMin = x;
      if (x > xMax) xMax = x;
      const low = (d as any).low;
      const high = (d as any).high ?? d.y;
      if (low !== undefined && low !== null) {
        if (low < yMin) yMin = low;
        if (low > yMax) yMax = low;
      }
      if (high !== undefined && high !== null) {
        if (high < yMin) yMin = high;
        if (high > yMax) yMax = high;
      }
    }

    return { xMin, xMax, yMin, yMax };
  }
}

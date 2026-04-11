/**
 * Kagi chart series. Direction-change line chart that shows supply/demand
 * through thick (yang) and thin (yin) lines based on shoulder/waist breakouts.
 */

import { BaseSeries, staggerDelay } from '../BaseSeries';
import type { InternalSeriesConfig } from '../../types/options';
import {
  ENTRY_DURATION,
  HOVER_DURATION,
  HOVER_INACTIVE_DURATION,
  EASE_ENTRY,
  EASE_HOVER,
} from '../../core/animationConstants';

interface KagiSegment {
  x: number;
  startPrice: number;
  endPrice: number;
  type: 'yang' | 'yin';
}

export class KagiSeries extends BaseSeries {
  private segments: KagiSegment[] = [];

  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  /**
   * Convert close prices into Kagi segments. Direction reverses when price
   * moves against current trend by reversalAmount. Lines thicken (yang) when
   * price exceeds a previous shoulder, thin (yin) when breaking a waist.
   */
  processData(): void {
    super.processData();

    const closes = this.data
      .map(d => (d as any).close ?? d.y)
      .filter((v): v is number => v !== null && v !== undefined);

    this.segments = [];
    if (closes.length < 2) return;

    const priceRange = Math.max(...closes) - Math.min(...closes);
    const reversalAmount = (this.config as any).reversalAmount ?? priceRange * 0.04;

    let direction: 'up' | 'down' = closes[1] >= closes[0] ? 'up' : 'down';
    let currentStart = closes[0];
    let currentEnd = closes[1];
    let segmentIndex = 0;

    const shoulders: number[] = [];
    const waists: number[] = [];
    let lineType: 'yang' | 'yin' = 'yin';

    const finalizeSegment = (start: number, end: number) => {
      if (direction === 'up') {
        const prevShoulder = shoulders.length > 0 ? shoulders[shoulders.length - 1] : -Infinity;
        if (end > prevShoulder) lineType = 'yang';
        shoulders.push(end);
      } else {
        const prevWaist = waists.length > 0 ? waists[waists.length - 1] : Infinity;
        if (end < prevWaist) lineType = 'yin';
        waists.push(end);
      }

      this.segments.push({
        x: segmentIndex++,
        startPrice: start,
        endPrice: end,
        type: lineType,
      });
    };

    for (let i = 2; i < closes.length; i++) {
      const price = closes[i];

      if (direction === 'up') {
        if (price > currentEnd) {
          currentEnd = price;
        } else if (currentEnd - price >= reversalAmount) {
          finalizeSegment(currentStart, currentEnd);
          currentStart = currentEnd;
          currentEnd = price;
          direction = 'down';
        }
      } else {
        if (price < currentEnd) {
          currentEnd = price;
        } else if (price - currentEnd >= reversalAmount) {
          finalizeSegment(currentStart, currentEnd);
          currentStart = currentEnd;
          currentEnd = price;
          direction = 'up';
        }
      }
    }

    finalizeSegment(currentStart, currentEnd);
  }

  render(): void {
    const { xAxis, yAxis } = this.context;
    const animate = this.context.animate;
    const segments = this.segments;

    if (segments.length === 0) return;

    const upColor = (this.config as any).upColor || '#2f7ed8';
    const downColor = (this.config as any).downColor || this.config.color || '#f45b5b';

    let pathData = '';
    let prevX: number | null = null;
    let prevY: number | null = null;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const px = xAxis.getPixelForValue(seg.x);
      const pyStart = yAxis.getPixelForValue(seg.startPrice);
      const pyEnd = yAxis.getPixelForValue(seg.endPrice);

      if (prevX === null) {
        pathData += `M${px},${pyStart}`;
      } else {
        pathData += `L${px},${prevY}`;
      }

      pathData += `L${px},${pyEnd}`;
      prevX = px;
      prevY = pyEnd;
    }

    const pathGroups: { d: string; type: 'yang' | 'yin' }[] = [];
    let currentPath = '';
    let currentType = segments[0].type;
    let lastPx: number | null = null;
    let lastPy: number | null = null;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const px = xAxis.getPixelForValue(seg.x);
      const pyStart = yAxis.getPixelForValue(seg.startPrice);
      const pyEnd = yAxis.getPixelForValue(seg.endPrice);

      if (seg.type !== currentType && currentPath) {
        pathGroups.push({ d: currentPath, type: currentType });
        currentPath = `M${lastPx},${lastPy}L${px},${lastPy}`;
        currentType = seg.type;
      }

      if (!currentPath) {
        currentPath = `M${px},${pyStart}`;
      } else if (lastPx !== null) {
        currentPath += `L${px},${lastPy}`;
      }

      currentPath += `L${px},${pyEnd}`;
      lastPx = px;
      lastPy = pyEnd;
    }

    if (currentPath) {
      pathGroups.push({ d: currentPath, type: currentType });
    }

    for (const pg of pathGroups) {
      const color = pg.type === 'yang' ? upColor : downColor;
      const strokeWidth = pg.type === 'yang' ? 3 : 1;

      const path = this.group.append('path')
        .attr('class', `katucharts-kagi-${pg.type}`)
        .attr('d', pg.d)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', strokeWidth)
        .attr('stroke-linejoin', 'miter');

      if (animate) {
        const totalLength = (path.node() as SVGPathElement).getTotalLength?.() || 0;
        if (totalLength > 0) {
          path
            .attr('stroke-dasharray', `${totalLength} ${totalLength}`)
            .attr('stroke-dashoffset', totalLength)
            .transition()
            .duration(ENTRY_DURATION).ease(EASE_ENTRY)
            .attr('stroke-dashoffset', 0)
            .on('end', () => {
              path.attr('stroke-dasharray', null);
            });
        }
      }
    }

    if (this.config.enableMouseTracking !== false) {
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const px = xAxis.getPixelForValue(seg.x);
        const pyStart = yAxis.getPixelForValue(seg.startPrice);
        const pyEnd = yAxis.getPixelForValue(seg.endPrice);
        const hitHeight = Math.abs(pyEnd - pyStart);

        this.group.append('rect')
          .attr('class', 'katucharts-kagi-hitarea')
          .attr('x', px - 8)
          .attr('y', Math.min(pyStart, pyEnd))
          .attr('width', 16)
          .attr('height', Math.max(hitHeight, 4))
          .attr('fill', 'transparent')
          .style('cursor', this.config.cursor || 'pointer')
          .on('mouseover', (event: MouseEvent) => {
            const targetClass = `katucharts-kagi-${seg.type}`;
            const baseStrokeWidth = seg.type === 'yang' ? 3 : 1;
            this.group.selectAll(`path.${targetClass}`)
              .interrupt('hover')
              .transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER)
              .attr('stroke-width', baseStrokeWidth + 1.5);
            const otherClass = seg.type === 'yang' ? 'katucharts-kagi-yin' : 'katucharts-kagi-yang';
            this.group.selectAll(`path.${otherClass}`)
              .interrupt('hover')
              .transition('hover').duration(HOVER_INACTIVE_DURATION).ease(EASE_HOVER)
              .attr('opacity', 0.3);
            this.context.events.emit('point:mouseover', {
              point: { x: seg.x, y: seg.endPrice, open: seg.startPrice, close: seg.endPrice, type: seg.type },
              index: i, series: this, event,
              plotX: px, plotY: pyEnd,
            });
          })
          .on('mouseout', (event: MouseEvent) => {
            this.group.selectAll('path.katucharts-kagi-yang')
              .interrupt('hover')
              .transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER)
              .attr('stroke-width', 3)
              .attr('opacity', 1);
            this.group.selectAll('path.katucharts-kagi-yin')
              .interrupt('hover')
              .transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER)
              .attr('stroke-width', 1)
              .attr('opacity', 1);
            this.context.events.emit('point:mouseout', {
              point: { x: seg.x, y: seg.endPrice },
              index: i, series: this, event,
            });
          })
          .on('click', (event: MouseEvent) => {
            this.context.events.emit('point:click', {
              point: { x: seg.x, y: seg.endPrice, type: seg.type },
              index: i, series: this, event,
            });
            this.config.events?.click?.call(this, event);
          });
      }
    }

    if (animate) {
      this.emitAfterAnimate(ENTRY_DURATION);
    }
  }

  getDataExtents() {
    if (this.segments.length === 0) {
      this.processData();
    }
    if (this.segments.length === 0) {
      return { xMin: 0, xMax: 0, yMin: 0, yMax: 0 };
    }

    let yMin = Infinity;
    let yMax = -Infinity;

    for (const seg of this.segments) {
      const lo = Math.min(seg.startPrice, seg.endPrice);
      const hi = Math.max(seg.startPrice, seg.endPrice);
      if (lo < yMin) yMin = lo;
      if (hi > yMax) yMax = hi;
    }

    return {
      xMin: 0,
      xMax: this.segments.length - 1,
      yMin,
      yMax,
    };
  }
}

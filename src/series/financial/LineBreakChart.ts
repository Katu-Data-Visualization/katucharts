/**
 * N-Line Break chart series. Draws blocks only when the close price
 * exceeds the high or low of the previous N blocks, filtering noise.
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

interface LineBreakBlock {
  index: number;
  open: number;
  close: number;
  direction: 'up' | 'down';
}

export class LineBreakChart extends BaseSeries {
  private blocks: LineBreakBlock[] = [];

  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  /**
   * Implement N-line break logic: a new block is drawn only when the close
   * exceeds the high of the last N up-blocks or breaks the low of the last
   * N down-blocks. Otherwise the price point is ignored.
   */
  processData(): void {
    super.processData();

    const lineBreakCount = (this.config as any).lineBreakCount ?? 3;
    const closes = this.data
      .map(d => (d as any).close ?? d.y)
      .filter((v): v is number => v !== null && v !== undefined);

    this.blocks = [];
    if (closes.length < 2) return;

    const firstBlock: LineBreakBlock = {
      index: 0,
      open: closes[0],
      close: closes[1],
      direction: closes[1] >= closes[0] ? 'up' : 'down',
    };
    this.blocks.push(firstBlock);

    for (let i = 2; i < closes.length; i++) {
      const price = closes[i];
      const lookback = this.blocks.slice(-lineBreakCount);
      const lastBlock = this.blocks[this.blocks.length - 1];

      let highOfN = -Infinity;
      let lowOfN = Infinity;
      for (const b of lookback) {
        const bHigh = Math.max(b.open, b.close);
        const bLow = Math.min(b.open, b.close);
        if (bHigh > highOfN) highOfN = bHigh;
        if (bLow < lowOfN) lowOfN = bLow;
      }

      if (price > highOfN) {
        this.blocks.push({
          index: this.blocks.length,
          open: lastBlock.close,
          close: price,
          direction: 'up',
        });
      } else if (price < lowOfN) {
        this.blocks.push({
          index: this.blocks.length,
          open: lastBlock.close,
          close: price,
          direction: 'down',
        });
      }
    }
  }

  render(): void {
    const { xAxis, yAxis, plotArea } = this.context;
    const animate = this.context.animate;
    const blocks = this.blocks;

    if (blocks.length === 0) return;

    const upColor = (this.config as any).upColor || '#2f7ed8';
    const downColor = (this.config as any).downColor || this.config.color || '#f45b5b';
    const inactiveOpacity = this.config.states?.inactive?.opacity ?? 0.4;
    const blockWidth = Math.max(1, plotArea.width / Math.max(1, blocks.length) * 0.8);
    const groups: any[] = [];

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const cx = xAxis.getPixelForValue(block.index);
      const yOpen = yAxis.getPixelForValue(block.open);
      const yClose = yAxis.getPixelForValue(block.close);
      const yTop = Math.min(yOpen, yClose);
      const height = Math.max(1, Math.abs(yOpen - yClose));
      const color = block.direction === 'up' ? upColor : downColor;
      const midY = yTop + height / 2;

      const rect = this.group.append('rect')
        .attr('class', 'katucharts-linebreak-block')
        .attr('x', cx - blockWidth / 2)
        .attr('width', blockWidth)
        .attr('fill', color)
        .attr('stroke', color)
        .attr('stroke-width', 0.5)
        .style('cursor', this.config.cursor || 'pointer');

      groups.push(rect);

      if (animate) {
        rect
          .attr('y', midY)
          .attr('height', 0)
          .transition()
          .duration(ENTRY_DURATION).ease(EASE_ENTRY)
          .delay(staggerDelay(i, 0, ENTRY_STAGGER_PER_ITEM, blocks.length))
          .attr('y', yTop)
          .attr('height', height);
      } else {
        rect.attr('y', yTop).attr('height', height);
      }

      if (this.config.enableMouseTracking !== false) {
        rect
          .on('mouseover', (event: MouseEvent) => {
            rect.style('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.25))');
            groups.forEach((g, j) => {
              if (j !== i) g.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER).attr('opacity', inactiveOpacity);
            });
            this.context.events.emit('point:mouseover', {
              point: { x: block.index, y: block.close, open: block.open, close: block.close, direction: block.direction },
              index: i, series: this, event,
              plotX: cx, plotY: yClose,
            });
          })
          .on('mouseout', (event: MouseEvent) => {
            rect.style('filter', '');
            groups.forEach(g => g.interrupt('highlight'));
            groups.forEach(g => g.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER).attr('opacity', 1));
            this.context.events.emit('point:mouseout', {
              point: { x: block.index, y: block.close },
              index: i, series: this, event,
            });
          })
          .on('click', (event: MouseEvent) => {
            this.context.events.emit('point:click', {
              point: { x: block.index, y: block.close, direction: block.direction },
              index: i, series: this, event,
            });
            this.config.events?.click?.call(this, event);
          });
      }
    }

    if (animate) {
      this.emitAfterAnimate(ENTRY_DURATION + blocks.length * ENTRY_STAGGER_PER_ITEM);
    }
  }

  getDataExtents() {
    if (this.blocks.length === 0) {
      this.processData();
    }
    if (this.blocks.length === 0) {
      return { xMin: 0, xMax: 0, yMin: 0, yMax: 0 };
    }

    let yMin = Infinity;
    let yMax = -Infinity;

    for (const block of this.blocks) {
      const lo = Math.min(block.open, block.close);
      const hi = Math.max(block.open, block.close);
      if (lo < yMin) yMin = lo;
      if (hi > yMax) yMax = hi;
    }

    return {
      xMin: 0,
      xMax: this.blocks.length - 1,
      yMin,
      yMax,
    };
  }
}

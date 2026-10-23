/**
 * Point & Figure chart series. Renders columns of X's (rising prices)
 * and O's (falling prices) based on box-size quantized price movements.
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

/** Above this many unit boxes across the price range, an unset boxSize is derived. */
const MAX_AUTO_BOXES = 10000;

interface PnFColumn {
  index: number;
  direction: 'X' | 'O';
  startPrice: number;
  endPrice: number;
  boxes: number[];
}

export class PointAndFigureChart extends BaseSeries {
  private columns: PnFColumn[] = [];
  private boxSize = 1;

  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  /**
   * Convert close prices into Point & Figure columns. Each column contains
   * boxes quantized to boxSize. A new column starts when price reverses
   * by at least reversalAmount boxes.
   */
  processData(): void {
    super.processData();

    const closes = this.data
      .map(d => (d as any).close ?? d.y)
      .filter((v): v is number => v !== null && v !== undefined);

    const boxSize = this.boxSize = this.resolveBoxSize(closes);
    const reversalBoxes = (this.config as any).reversalAmount ?? 3;
    const reversalAmount = reversalBoxes * boxSize;

    this.columns = [];
    if (closes.length < 2) return;

    const quantize = (price: number) => Math.floor(price / boxSize) * boxSize;

    let direction: 'X' | 'O' = closes[1] >= closes[0] ? 'X' : 'O';
    let currentHigh = quantize(closes[0]) + boxSize;
    let currentLow = quantize(closes[0]);
    let colIndex = 0;

    const buildBoxes = (low: number, high: number): number[] => {
      const boxes: number[] = [];
      for (let p = low; p < high; p += boxSize) {
        boxes.push(p);
      }
      return boxes;
    };

    const finalizeColumn = () => {
      this.columns.push({
        index: colIndex++,
        direction,
        startPrice: direction === 'X' ? currentLow : currentHigh,
        endPrice: direction === 'X' ? currentHigh : currentLow,
        boxes: buildBoxes(currentLow, currentHigh),
      });
    };

    for (let i = 1; i < closes.length; i++) {
      const price = closes[i];
      const qPrice = quantize(price);

      if (direction === 'X') {
        if (qPrice + boxSize > currentHigh) {
          currentHigh = qPrice + boxSize;
        } else if (currentHigh - qPrice >= reversalAmount) {
          finalizeColumn();
          direction = 'O';
          currentHigh = currentHigh - boxSize;
          currentLow = qPrice;
        }
      } else {
        if (qPrice < currentLow) {
          currentLow = qPrice;
        } else if (qPrice - currentLow >= reversalAmount) {
          finalizeColumn();
          direction = 'X';
          currentLow = currentLow + boxSize;
          currentHigh = qPrice + boxSize;
        }
      }
    }

    finalizeColumn();
  }

  /**
   * A configured boxSize is used as given (at least 1). Without one, prices whose
   * range spans more than MAX_AUTO_BOXES unit boxes get a nice step of about
   * 1/100 of the range, since every box becomes an element and a unit box on large
   * prices would build millions of them.
   */
  private resolveBoxSize(closes: number[]): number {
    const configured = (this.config as any).boxSize;
    if (configured != null) return Math.max(1, configured);
    if (closes.length === 0) return 1;
    let lo = Infinity;
    let hi = -Infinity;
    for (const c of closes) { if (c < lo) lo = c; if (c > hi) hi = c; }
    const range = hi - lo;
    if (!(range > MAX_AUTO_BOXES)) return 1;
    const raw = range / 100;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    return [1, 2, 5, 10].find(n => n * mag >= raw)! * mag;
  }

  render(): void {
    const { xAxis, yAxis, plotArea } = this.context;
    const animate = this.context.animate;
    const columns = this.columns;

    if (columns.length === 0) return;

    const boxSize = this.boxSize;
    const upColor = (this.config as any).upColor || '#2f7ed8';
    const downColor = (this.config as any).downColor || this.config.color || '#f45b5b';
    const inactiveOpacity = this.config.states?.inactive?.opacity ?? 0.4;
    const fontSize = Math.max(8, Math.min(16, plotArea.width / Math.max(1, columns.length) * 0.6));

    const columnGroups: any[] = [];
    let totalBoxIndex = 0;

    for (let ci = 0; ci < columns.length; ci++) {
      const col = columns[ci];
      const color = col.direction === 'X' ? upColor : downColor;
      const symbol = col.direction === 'X' ? 'X' : 'O';

      const colGroup = this.group.append('g')
        .attr('class', `katucharts-pnf-column katucharts-pnf-${col.direction}`)
        .style('cursor', this.config.cursor || 'pointer');
      columnGroups.push(colGroup);

      for (const boxPrice of col.boxes) {
        const cx = xAxis.getPixelForValue(col.index);
        const cy = yAxis.getPixelForValue(boxPrice + boxSize / 2);

        const text = colGroup.append('text')
          .attr('x', cx)
          .attr('y', cy)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'central')
          .attr('font-size', `${fontSize}px`)
          .attr('font-weight', 'bold')
          .attr('fill', color)
          .style('pointer-events', 'none')
          .text(symbol);

        if (animate) {
          text.attr('opacity', 0)
            .transition()
            .duration(ENTRY_DURATION).ease(EASE_ENTRY)
            .delay(staggerDelay(totalBoxIndex, 0, ENTRY_STAGGER_PER_ITEM, this.getTotalBoxCount()))
            .attr('opacity', 1);
          totalBoxIndex++;
        }
      }

      if (this.config.enableMouseTracking !== false) {
        const colX = xAxis.getPixelForValue(col.index);
        const colTop = yAxis.getPixelForValue(Math.max(col.startPrice, col.endPrice));
        const colBottom = yAxis.getPixelForValue(Math.min(col.startPrice, col.endPrice));
        const hitWidth = Math.max(fontSize * 1.5, 20);
        const hitHeight = Math.max(Math.abs(colBottom - colTop), 4);

        colGroup.append('rect')
          .attr('x', colX - hitWidth / 2)
          .attr('y', Math.min(colTop, colBottom))
          .attr('width', hitWidth)
          .attr('height', hitHeight)
          .attr('fill', 'transparent')
          .style('cursor', this.config.cursor || 'pointer')
          .on('mouseover', (event: MouseEvent) => {
            colGroup.selectAll('text')
              .interrupt('hover')
              .transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER)
              .attr('font-size', `${fontSize * 1.2}px`);
            columnGroups.forEach((g, j) => {
              if (j !== ci) g.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER).attr('opacity', inactiveOpacity);
            });
            this.context.events.emit('point:mouseover', {
              point: {
                x: col.index, y: col.endPrice,
                direction: col.direction,
                startPrice: col.startPrice, endPrice: col.endPrice,
                boxCount: col.boxes.length,
              },
              index: ci, series: this, event,
              plotX: colX, plotY: colTop,
            });
          })
          .on('mouseout', (event: MouseEvent) => {
            colGroup.selectAll('text')
              .interrupt('hover')
              .transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER)
              .attr('font-size', `${fontSize}px`);
            columnGroups.forEach(g => g.interrupt('highlight'));
            columnGroups.forEach(g => g.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER).attr('opacity', 1));
            this.context.events.emit('point:mouseout', {
              point: { x: col.index, y: col.endPrice },
              index: ci, series: this, event,
            });
          })
          .on('click', (event: MouseEvent) => {
            this.firePointClick({ x: col.index, y: col.endPrice, direction: col.direction } as any, ci, event);
          });
      }
    }

    if (animate) {
      const totalBoxes = this.getTotalBoxCount();
      this.emitAfterAnimate(ENTRY_DURATION + totalBoxes * ENTRY_STAGGER_PER_ITEM);
    }
  }

  private getTotalBoxCount(): number {
    return this.columns.reduce((sum, col) => sum + col.boxes.length, 0);
  }

  getDataExtents() {
    if (this.columns.length === 0) {
      this.processData();
    }
    if (this.columns.length === 0) {
      return { xMin: 0, xMax: 0, yMin: 0, yMax: 0 };
    }

    const boxSize = this.boxSize;
    let yMin = Infinity;
    let yMax = -Infinity;

    for (const col of this.columns) {
      for (const boxPrice of col.boxes) {
        if (boxPrice < yMin) yMin = boxPrice;
        if (boxPrice + boxSize > yMax) yMax = boxPrice + boxSize;
      }
    }

    return {
      xMin: 0,
      xMax: this.columns.length - 1,
      yMin,
      yMax,
    };
  }
}

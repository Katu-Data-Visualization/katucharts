import { CandlestickChart } from './CandlestickChart';
import type { InternalSeriesConfig } from '../../types/options';
import { staggerDelay } from '../BaseSeries';
import {
  ENTRY_DURATION,
  ENTRY_STAGGER_PER_ITEM,
  HOVER_DURATION,
  EASE_ENTRY,
  EASE_HOVER,
} from '../../core/animationConstants';

export class HollowCandlestickChart extends CandlestickChart {
  private hollowSelectedIndices: Set<number> = new Set();

  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  /**
   * Renders hollow candlesticks where fill and stroke depend on the
   * trend direction (close vs previous close) rather than the
   * intra-candle open/close relationship.
   */
  render(): void {
    const { xAxis, yAxis, plotArea } = this.context;
    const animate = this.context.animate;
    const rawData = this.data;
    const data = (this as any).applyDataGrouping(rawData);

    const pointRange = this.config.pointRange;
    const groupPadding = this.config.groupPadding ?? 0.2;
    const pointPadding = this.config.pointPadding ?? 0.1;
    const totalPadding = groupPadding + pointPadding;
    const maxPointWidth = this.config.maxPointWidth ?? Infinity;
    const computedWidth = pointRange
      ? Math.max(1, Math.min(maxPointWidth, (plotArea.width / Math.max(1, (xAxis as any).domain?.[1] - (xAxis as any).domain?.[0] || data.length)) * pointRange * (1 - totalPadding)))
      : Math.max(1, Math.min(maxPointWidth, (plotArea.width / data.length) * (1 - totalPadding)));
    const barWidth = this.config.pointWidth ?? computedWidth;

    const downColor = this.config.color || '#f45b5b';
    const upColor = this.config.upColor || '#2f7ed8';
    const candleLineWidth = this.config.lineWidth ?? 1;
    const inactiveOpacity = this.config.states?.inactive?.opacity ?? 0.4;
    const allowSelect = this.config.allowPointSelect === true;
    const selectColor = this.config.states?.select?.color;
    const selectBorderColor = this.config.states?.select?.borderColor;

    const candles: any[] = [];

    for (let i = 0; i < data.length; i++) {
      const d = data[i] as any;
      if (d.y === null && d.open === undefined) continue;

      const open = d.open ?? d.y ?? 0;
      const high = d.high ?? open;
      const low = d.low ?? open;
      const close = d.close ?? open;
      const cx = xAxis.getPixelForValue(d.x ?? i);

      const prevClose = i > 0
        ? (data[i - 1] as any).close ?? (data[i - 1] as any).y ?? 0
        : open;
      const trendUp = close > prevClose;
      const trendColor = trendUp ? upColor : downColor;

      const bodyFill = trendUp ? 'none' : downColor;
      const bodyStroke = trendColor;
      const wickColor = trendColor;

      const g = this.group.append('g')
        .attr('class', 'katucharts-candlestick katucharts-hollow-candlestick')
        .style('cursor', this.config.cursor || 'pointer');
      candles.push(g);

      const isUp = close >= open;
      const bodyTop = isUp ? close : open;
      const bodyBottom = isUp ? open : close;
      const bodyY = yAxis.getPixelForValue(bodyTop);
      const bodyH = Math.max(1, Math.abs(yAxis.getPixelForValue(bodyBottom) - yAxis.getPixelForValue(bodyTop)));

      const wick = g.append('line')
        .attr('x1', cx).attr('x2', cx)
        .attr('stroke', wickColor)
        .attr('stroke-width', candleLineWidth);

      const rect = g.append('rect')
        .attr('x', cx - barWidth / 2)
        .attr('width', barWidth)
        .attr('stroke', bodyStroke)
        .attr('stroke-width', candleLineWidth)
        .attr('rx', 2);

      if (animate) {
        const midY = yAxis.getPixelForValue((high + low) / 2);
        const delay = staggerDelay(i, 0, ENTRY_STAGGER_PER_ITEM, data.length);
        wick.attr('y1', midY).attr('y2', midY)
          .transition().duration(ENTRY_DURATION).ease(EASE_ENTRY).delay(delay)
          .attr('y1', yAxis.getPixelForValue(high))
          .attr('y2', yAxis.getPixelForValue(low));
        rect.attr('y', midY).attr('height', 0).attr('fill', bodyFill)
          .transition().duration(ENTRY_DURATION).ease(EASE_ENTRY).delay(delay)
          .attr('y', bodyY).attr('height', bodyH);
      } else {
        wick.attr('y1', yAxis.getPixelForValue(high))
          .attr('y2', yAxis.getPixelForValue(low));
        rect.attr('y', bodyY).attr('height', bodyH).attr('fill', bodyFill);
      }

      if (this.config.enableMouseTracking !== false) {
        g.on('mouseover', (event: MouseEvent) => {
          const hoverWidthPlus = this.config.states?.hover?.lineWidthPlus ?? 2;
          g.select('rect').transition('size').duration(HOVER_DURATION).ease(EASE_HOVER)
            .attr('x', cx - barWidth * 0.7)
            .attr('width', barWidth * 1.4);
          g.select('line').transition('size').duration(HOVER_DURATION).ease(EASE_HOVER)
            .attr('stroke-width', candleLineWidth + hoverWidthPlus);
          g.style('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.25))');
          candles.forEach(c => c.interrupt('highlight'));
          candles.forEach(c => c.attr('opacity', 1));
          candles.forEach((c, j) => {
            if (j !== i) c.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER).attr('opacity', inactiveOpacity);
          });

          this.context.events.emit('point:mouseover', {
            point: { ...d, open, high, low, close },
            index: i, series: this, event,
            plotX: cx, plotY: yAxis.getPixelForValue((high + low) / 2),
          });
          d.events?.mouseOver?.call(d, event);
        })
        .on('mouseout', (event: MouseEvent) => {
          g.select('rect').transition('size').duration(HOVER_DURATION).ease(EASE_HOVER)
            .attr('x', cx - barWidth / 2)
            .attr('width', barWidth);
          g.select('line').transition('size').duration(HOVER_DURATION).ease(EASE_HOVER)
            .attr('stroke-width', candleLineWidth);
          g.style('filter', '');
          candles.forEach(c => c.interrupt('highlight'));
          candles.forEach(c => c.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER).attr('opacity', 1));

          this.context.events.emit('point:mouseout', {
            point: d, index: i, series: this, event,
          });
          d.events?.mouseOut?.call(d, event);
        })
        .on('click', (event: MouseEvent) => {
          if (allowSelect) {
            const wasSelected = this.hollowSelectedIndices.has(i);
            if (wasSelected) {
              this.hollowSelectedIndices.delete(i);
              g.select('rect').attr('stroke-width', candleLineWidth);
              d.events?.unselect?.call(d, event);
            } else {
              this.hollowSelectedIndices.add(i);
              g.select('rect')
                .attr('stroke', selectBorderColor || '#000')
                .attr('stroke-width', (selectColor ? 2 : candleLineWidth + 1));
              if (selectColor) g.select('rect').attr('fill', selectColor);
              d.events?.select?.call(d, event);
            }
          }
          this.context.events.emit('point:click', { point: d, index: i, series: this, event });
          d.events?.click?.call(d, event);
          this.config.events?.click?.call(this, event);
        });
      }
    }

    (this as any).renderCandlestickLabels(data, xAxis, yAxis);
  }
}

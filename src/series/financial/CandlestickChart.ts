import { select } from 'd3-selection';
import 'd3-transition';
import { BaseSeries, staggerDelay } from '../BaseSeries';
import type { InternalSeriesConfig } from '../../types/options';
import { templateFormat, stripHtmlTags } from '../../utils/format';
import { DEFAULT_CHART_TEXT_COLOR, DEFAULT_CHART_TEXT_SIZE } from '../../utils/chartText';
import {
  ENTRY_DURATION,
  ENTRY_STAGGER_PER_ITEM,
  HOVER_DURATION,
  EASE_ENTRY,
  EASE_HOVER,
} from '../../core/animationConstants';

export class CandlestickChart extends BaseSeries {
  private selectedIndices: Set<number> = new Set();

  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  render(): void {
    const { xAxis, yAxis, plotArea } = this.context;
    const animate = this.context.animate;
    const rawData = this.data;
    const data = this.applyDataGrouping(rawData);

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
    const downLineColor = this.config.lineColor || downColor;
    const upLineColor = this.config.upLineColor || upColor;
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
      const isUp = close >= open;
      const bodyColor = isUp ? upColor : downColor;
      const lineColor = isUp ? upLineColor : downLineColor;

      const g = this.group.append('g')
        .attr('class', 'katucharts-candlestick')
        .style('cursor', this.config.cursor || 'pointer');
      candles.push(g);

      const wick = g.append('line')
        .attr('x1', cx).attr('x2', cx)
        .attr('stroke', lineColor)
        .attr('stroke-width', candleLineWidth);

      const bodyTop = isUp ? close : open;
      const bodyBottom = isUp ? open : close;
      const bodyY = yAxis.getPixelForValue(bodyTop);
      const bodyH = Math.max(1, Math.abs(yAxis.getPixelForValue(bodyBottom) - yAxis.getPixelForValue(bodyTop)));

      const rect = g.append('rect')
        .attr('x', cx - barWidth / 2)
        .attr('width', barWidth)
        .attr('stroke', lineColor)
        .attr('stroke-width', candleLineWidth)
        .attr('rx', 2);

      if (animate) {
        const midY = yAxis.getPixelForValue((high + low) / 2);
        const delay = staggerDelay(i, 0, ENTRY_STAGGER_PER_ITEM, data.length);
        wick.attr('y1', midY).attr('y2', midY)
          .transition().duration(ENTRY_DURATION).ease(EASE_ENTRY).delay(delay)
          .attr('y1', yAxis.getPixelForValue(high))
          .attr('y2', yAxis.getPixelForValue(low));
        rect.attr('y', midY).attr('height', 0).attr('fill', bodyColor)
          .transition().duration(ENTRY_DURATION).ease(EASE_ENTRY).delay(delay)
          .attr('y', bodyY).attr('height', bodyH);
      } else {
        wick.attr('y1', yAxis.getPixelForValue(high))
          .attr('y2', yAxis.getPixelForValue(low));
        rect.attr('y', bodyY).attr('height', bodyH).attr('fill', bodyColor);
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
            const wasSelected = this.selectedIndices.has(i);
            if (wasSelected) {
              this.selectedIndices.delete(i);
              g.select('rect').attr('stroke-width', candleLineWidth);
              d.events?.unselect?.call(d, event);
            } else {
              this.selectedIndices.add(i);
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

    this.renderCandlestickLabels(data, xAxis, yAxis);
  }

  private renderCandlestickLabels(data: any[], xAxis: any, yAxis: any): void {
    const dlCfg = this.config.dataLabels;
    if (!dlCfg?.enabled) return;

    const fontSize = (dlCfg.style?.fontSize as string) || DEFAULT_CHART_TEXT_SIZE;
    const fontColor = dlCfg.color || (dlCfg.style?.color as string) || DEFAULT_CHART_TEXT_COLOR;

    data.forEach((d: any, i: number) => {
      if (d.y === null && d.open === undefined) return;
      const high = d.high ?? d.open ?? d.y ?? 0;
      const cx = xAxis.getPixelForValue(d.x ?? i);
      const topY = yAxis.getPixelForValue(high);

      let text: string;
      if (dlCfg.formatter) {
        text = dlCfg.formatter.call({
          point: d, series: { name: this.config.name },
          x: d.x, y: d.y,
        });
      } else if (dlCfg.format) {
        text = stripHtmlTags(templateFormat(dlCfg.format, {
          point: d, series: { name: this.config.name }, x: d.x, y: d.y,
        }));
      } else {
        text = String(d.close ?? d.y ?? '');
      }

      this.group.append('text')
        .attr('class', 'katucharts-candlestick-label')
        .attr('x', cx + (dlCfg.x ?? 0))
        .attr('y', topY - 6 + (dlCfg.y ?? 0))
        .attr('text-anchor', 'middle')
        .attr('font-size', fontSize)
        .attr('fill', fontColor)
        .style('pointer-events', 'none')
        .text(text);
    });
  }

  /**
   * Groups OHLC data when dataGrouping is enabled, aggregating open/high/low/close
   * within each group interval using the standard OHLC approximation.
   */
  private applyDataGrouping(data: any[]): any[] {
    const groupCfg = (this.config as any).dataGrouping;
    if (!groupCfg?.enabled || !groupCfg.units || data.length === 0) return data;

    const groupSize = groupCfg.groupPixelWidth ?? 10;
    const { plotArea } = this.context;
    const pixelsPerPoint = plotArea.width / Math.max(1, data.length);

    if (pixelsPerPoint >= groupSize) return data;

    const pointsPerGroup = Math.ceil(groupSize / pixelsPerPoint);
    const grouped: any[] = [];

    for (let i = 0; i < data.length; i += pointsPerGroup) {
      const chunk = data.slice(i, i + pointsPerGroup);
      if (chunk.length === 0) continue;

      const open = chunk[0].open ?? chunk[0].y ?? 0;
      const close = chunk[chunk.length - 1].close ?? chunk[chunk.length - 1].y ?? 0;
      let high = -Infinity, low = Infinity;
      for (const c of chunk) {
        high = Math.max(high, c.high ?? c.y ?? 0);
        low = Math.min(low, c.low ?? c.y ?? 0);
      }

      grouped.push({
        ...chunk[0],
        x: chunk[0].x,
        open, high, low, close,
        y: close,
      });
    }

    return grouped;
  }

  getDataExtents() {
    let xMin = Infinity, xMax = -Infinity;
    let yMin = Infinity, yMax = -Infinity;
    for (const d of this.data) {
      const x = d.x ?? 0;
      xMin = Math.min(xMin, x);
      xMax = Math.max(xMax, x);
      const high = (d as any).high ?? d.y ?? 0;
      const low = (d as any).low ?? d.y ?? 0;
      yMin = Math.min(yMin, low);
      yMax = Math.max(yMax, high);
    }
    return { xMin, xMax, yMin, yMax };
  }
}

export class OHLCChart extends BaseSeries {
  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  render(): void {
    const { xAxis, yAxis, plotArea } = this.context;
    const animate = this.context.animate;
    const data = this.data;
    const tickWidth = Math.max(2, Math.min(10, (plotArea.width / data.length) * 0.3));
    const downColor = this.config.color || '#f45b5b';
    const upColor = this.config.upColor || '#2f7ed8';
    const inactiveOpacity = this.config.states?.inactive?.opacity ?? 0.4;

    const ohlcGroups: any[] = [];

    for (let i = 0; i < data.length; i++) {
      const d = data[i] as any;
      if (d.y === null && d.open === undefined) continue;

      const open = d.open ?? d.y ?? 0;
      const high = d.high ?? open;
      const low = d.low ?? open;
      const close = d.close ?? open;
      const cx = xAxis.getPixelForValue(d.x ?? i);
      const color = close >= open ? upColor : downColor;

      const g = this.group.append('g')
        .attr('class', 'katucharts-ohlc')
        .style('cursor', this.config.cursor || 'pointer');
      ohlcGroups.push(g);

      if (animate) {
        g.attr('opacity', 0)
          .transition().duration(ENTRY_DURATION).ease(EASE_ENTRY)
          .delay(staggerDelay(i, 0, ENTRY_STAGGER_PER_ITEM, data.length))
          .attr('opacity', 1);
      }

      g.append('line')
        .attr('x1', cx).attr('x2', cx)
        .attr('y1', yAxis.getPixelForValue(high))
        .attr('y2', yAxis.getPixelForValue(low))
        .attr('stroke', color).attr('stroke-width', 1.5);

      g.append('line')
        .attr('x1', cx - tickWidth).attr('x2', cx)
        .attr('y1', yAxis.getPixelForValue(open))
        .attr('y2', yAxis.getPixelForValue(open))
        .attr('stroke', color).attr('stroke-width', 1.5);

      g.append('line')
        .attr('x1', cx).attr('x2', cx + tickWidth)
        .attr('y1', yAxis.getPixelForValue(close))
        .attr('y2', yAxis.getPixelForValue(close))
        .attr('stroke', color).attr('stroke-width', 1.5);

      if (this.config.enableMouseTracking !== false) {
        g.on('mouseover', (event: MouseEvent) => {
          g.selectAll('line').interrupt('hover')
            .transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER)
            .attr('stroke-width', 3);
          g.style('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.25))');
          ohlcGroups.forEach(o => o.interrupt('highlight'));
          ohlcGroups.forEach(o => o.attr('opacity', 1));
          ohlcGroups.forEach((o, j) => {
            if (j !== i) o.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER).attr('opacity', inactiveOpacity);
          });
          this.context.events.emit('point:mouseover', {
            point: { ...d, open, high, low, close },
            index: i, series: this, event,
            plotX: cx, plotY: yAxis.getPixelForValue((high + low) / 2),
          });
          d.events?.mouseOver?.call(d, event);
        })
        .on('mouseout', (event: MouseEvent) => {
          g.selectAll('line').interrupt('hover')
            .transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER)
            .attr('stroke-width', 1.5);
          g.style('filter', '');
          ohlcGroups.forEach(o => o.interrupt('highlight'));
          ohlcGroups.forEach(o => o.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER).attr('opacity', 1));
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
  }

  getDataExtents() {
    let xMin = Infinity, xMax = -Infinity;
    let yMin = Infinity, yMax = -Infinity;
    for (const d of this.data) {
      const x = d.x ?? 0;
      xMin = Math.min(xMin, x);
      xMax = Math.max(xMax, x);
      const high = (d as any).high ?? d.y ?? 0;
      const low = (d as any).low ?? d.y ?? 0;
      yMin = Math.min(yMin, low);
      yMax = Math.max(yMax, high);
    }
    return { xMin, xMax, yMin, yMax };
  }
}

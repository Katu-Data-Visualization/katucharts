import { BaseSeries, staggerDelay } from '../BaseSeries';
import type { InternalSeriesConfig } from '../../types/options';

export class VolumeSeries extends BaseSeries {
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

    const upColor = this.config.upColor || '#2f7ed8';
    const downColor = this.config.color || '#f45b5b';
    const inactiveOpacity = this.config.states?.inactive?.opacity ?? 0.4;
    const hoverBrighten = this.config.states?.hover?.brightness ?? 0.1;

    const bars: any[] = [];

    for (let i = 0; i < data.length; i++) {
      const d = data[i] as any;
      if (d.y === null || d.y === undefined) continue;

      const volume = d.y;
      const open = d.open ?? 0;
      const close = d.close ?? 0;
      const isUp = close >= open;
      const color = isUp ? upColor : downColor;

      const cx = xAxis.getPixelForValue(d.x ?? i);
      const yTop = yAxis.getPixelForValue(volume);
      const yBottom = yAxis.getPixelForValue(0);
      const barHeight = Math.max(0, yBottom - yTop);

      const rect = this.group.append('rect')
        .attr('class', 'katucharts-volume-bar')
        .attr('x', cx - barWidth / 2)
        .attr('width', barWidth)
        .attr('fill', color)
        .attr('rx', 1);

      if (animate) {
        rect
          .attr('y', yBottom)
          .attr('height', 0)
          .transition()
          .duration(600)
          .delay(staggerDelay(i, 0, 30, data.length))
          .attr('y', yTop)
          .attr('height', barHeight);
      } else {
        rect.attr('y', yTop).attr('height', barHeight);
      }

      bars.push(rect);

      if (this.config.enableMouseTracking !== false) {
        rect
          .style('cursor', this.config.cursor || 'pointer')
          .on('mouseover', (event: MouseEvent) => {
            rect.transition('hover').duration(150).attr('opacity', 0.8);
            bars.forEach((b, j) => {
              if (j !== i) b.interrupt('highlight');
            });
            bars.forEach((b, j) => {
              if (j !== i) b.transition('highlight').duration(150).attr('opacity', inactiveOpacity);
            });

            this.context.events.emit('point:mouseover', {
              point: d, index: i, series: this, event,
              plotX: cx, plotY: yTop,
            });
            d.events?.mouseOver?.call(d, event);
          })
          .on('mouseout', (event: MouseEvent) => {
            rect.transition('hover').duration(150).attr('opacity', 1);
            bars.forEach(b => {
              b.interrupt('highlight');
              b.transition('highlight').duration(150).attr('opacity', 1);
            });

            this.context.events.emit('point:mouseout', {
              point: d, index: i, series: this, event,
            });
            d.events?.mouseOut?.call(d, event);
          })
          .on('click', (event: MouseEvent) => {
            this.context.events.emit('point:click', {
              point: d, index: i, series: this, event,
            });
            d.events?.click?.call(d, event);
            this.config.events?.click?.call(this, event);
          });
      }
    }

    if (animate) {
      this.emitAfterAnimate(600 + data.length * 30);
    }

    this.renderDataLabels(
      data,
      (d, i) => xAxis.getPixelForValue(d.x ?? i),
      (d, _i) => yAxis.getPixelForValue(d.y ?? 0)
    );
  }

  /**
   * Volume always starts from zero on the y-axis.
   */
  getDataExtents(): { xMin: number; xMax: number; yMin: number; yMax: number } {
    let xMin = Infinity, xMax = -Infinity;
    let yMax = -Infinity;

    for (const d of this.data) {
      const x = d.x ?? 0;
      if (x < xMin) xMin = x;
      if (x > xMax) xMax = x;
      const vol = d.y ?? 0;
      if (vol > yMax) yMax = vol;
    }

    return { xMin, xMax, yMin: 0, yMax };
  }
}

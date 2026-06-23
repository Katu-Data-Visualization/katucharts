/**
 * Volume-by-Price renderer: horizontal bars anchored to the left edge of the
 * plot, one per price bin, with width proportional to the volume traded in that
 * band. Overlays the price chart on the shared price (y) axis and does not
 * affect axis extents.
 */

import { BaseSeries } from '../BaseSeries';
import type { InternalSeriesConfig } from '../../types/options';
import { ENTRY_DURATION, EASE_ENTRY } from '../../core/animationConstants';

export class VBPChart extends BaseSeries {
  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  render(): void {
    const { yAxis, plotArea } = this.context;
    const animate = this.context.animate;
    const data = this.data;
    if (data.length === 0) return;

    const maxVol = Math.max(...data.map(d => (d as any).volume ?? 0)) || 1;
    const widthFraction = (this.config as any).zoneWidth ?? 0.3;
    const maxBarWidth = plotArea.width * widthFraction;
    const baseColor = this.config.color || 'rgba(120,150,200,0.45)';
    const upColor = (this.config as any).upColor;
    const opacity = (this.config as any).fillOpacity ?? 0.5;

    for (const d of data) {
      const low = (d as any).low;
      const high = (d as any).high;
      const vol = (d as any).volume ?? 0;
      if (low === undefined || high === undefined) continue;

      const yTop = yAxis.getPixelForValue(high);
      const yBottom = yAxis.getPixelForValue(low);
      const barTop = Math.min(yTop, yBottom);
      const barHeight = Math.max(1, Math.abs(yBottom - yTop) - 1);
      const w = (vol / maxVol) * maxBarWidth;

      const rect = this.group.append('rect')
        .attr('class', 'katucharts-vbp-bar')
        .attr('x', 0)
        .attr('y', barTop)
        .attr('height', barHeight)
        .attr('fill', upColor || baseColor)
        .attr('opacity', opacity);

      if (animate) {
        rect.attr('width', 0)
          .transition().duration(ENTRY_DURATION).ease(EASE_ENTRY)
          .attr('width', w);
      } else {
        rect.attr('width', w);
      }

      if (this.config.enableMouseTracking !== false) {
        rect.on('mouseover', (event: MouseEvent) => {
          this.context.events.emit('point:mouseover', {
            point: { x: (d as any).x, y: (d as any).y, low, high, volume: vol },
            index: 0, series: this, event, plotX: w, plotY: barTop,
          });
        }).on('mouseout', (event: MouseEvent) => {
          this.context.events.emit('point:mouseout', { point: d, index: 0, series: this, event });
        });
      }
    }
  }

  getDataExtents(): { xMin: number; xMax: number; yMin: number; yMax: number } {
    return { xMin: Infinity, xMax: -Infinity, yMin: Infinity, yMax: -Infinity };
  }
}

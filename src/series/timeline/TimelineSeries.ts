import { select } from 'd3-selection';
import 'd3-transition';
import { BaseSeries } from '../BaseSeries';
import type { InternalSeriesConfig } from '../../types/options';
import { DEFAULT_CHART_TEXT_COLOR, DEFAULT_CHART_TEXT_SIZE } from '../../utils/chartText';
import {
  ENTRY_DURATION,
  ENTRY_STAGGER_PER_ITEM,
  HOVER_DURATION,
  EASE_ENTRY,
  EASE_HOVER,
} from '../../core/animationConstants';

export class TimelineSeries extends BaseSeries {
  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  render(): void {
    const { plotArea, colors } = this.context;
    const animate = this.context.animate;
    const cfg = this.config as any;
    const data = this.data;
    const rowHeight = Math.min(40, plotArea.height / Math.max(data.length, 1));
    const startY = (plotArea.height - data.length * rowHeight) / 2;

    const markerRadius = this.config.marker?.radius ?? 6;
    const markerLineColor = this.config.marker?.lineColor;
    const colorByPoint = cfg.colorByPoint !== false;
    const connectorColor = cfg.connectorColor ?? '#ccc';
    const connectorWidth = cfg.connectorWidth ?? (cfg.lineWidth ?? 4);
    const dlCfg = this.config.dataLabels || {};
    const labelFontSize = (dlCfg.style?.fontSize as string) || DEFAULT_CHART_TEXT_SIZE;
    const labelColor = dlCfg.color || (dlCfg.style?.color as string) || DEFAULT_CHART_TEXT_COLOR;
    const rows: { circle: any; text: any; desc?: any }[] = [];

    data.forEach((d, i) => {
      const y = startY + i * rowHeight;
      const color = d.color || (colorByPoint ? colors[i % colors.length] : (cfg.color || colors[0]));

      const circle = this.group.append('circle')
        .attr('cx', 20)
        .attr('cy', y + rowHeight / 2)
        .attr('fill', color)
        .style('cursor', 'pointer');

      if (markerLineColor) {
        circle.attr('stroke', markerLineColor);
      }

      if (animate) {
        circle.attr('r', 0)
          .transition().duration(ENTRY_DURATION).ease(EASE_ENTRY).delay(i * ENTRY_STAGGER_PER_ITEM)
          .attr('r', markerRadius);
      } else {
        circle.attr('r', markerRadius);
      }

      if (i < data.length - 1) {
        const line = this.group.append('line')
          .attr('x1', 20).attr('x2', 20)
          .attr('y1', y + rowHeight / 2 + markerRadius)
          .attr('y2', y + rowHeight + rowHeight / 2 - markerRadius)
          .attr('stroke', connectorColor)
          .attr('stroke-width', connectorWidth);

        if (animate) {
          line.attr('opacity', 0)
            .transition().duration(ENTRY_DURATION).ease(EASE_ENTRY).delay(i * ENTRY_STAGGER_PER_ITEM)
            .attr('opacity', 1);
        }
      }

      const labelText = (d as any).label || d.name || `Event ${i + 1}`;
      const el = this.group.append('text')
        .attr('x', 36)
        .attr('y', y + rowHeight / 2)
        .attr('dy', '0.35em')
        .attr('font-size', labelFontSize)
        .attr('fill', labelColor)
        .style('cursor', 'pointer')
        .text(labelText);

      if (animate) {
        el.attr('opacity', 0)
          .transition().duration(ENTRY_DURATION).ease(EASE_ENTRY).delay(i * ENTRY_STAGGER_PER_ITEM)
          .attr('opacity', 1);
      }

      let descEl: any = null;
      const description = (d as any).description;
      if (description) {
        descEl = this.group.append('text')
          .attr('x', 36)
          .attr('y', y + rowHeight / 2 + 14)
          .attr('dy', '0.35em')
          .attr('font-size', '10px')
          .attr('fill', '#777')
          .style('pointer-events', 'none')
          .text(description);

        if (animate) {
          descEl.attr('opacity', 0)
            .transition().duration(ENTRY_DURATION).ease(EASE_ENTRY).delay(i * ENTRY_STAGGER_PER_ITEM)
            .attr('opacity', 1);
        }
      }

      rows.push({ circle, text: el, desc: descEl });
      const onOver = (event: MouseEvent) => {
        circle.transition('size').duration(HOVER_DURATION).ease(EASE_HOVER).attr('r', markerRadius + 3);
        circle.style('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))');
        el.attr('font-weight', 'bold');
        rows.forEach(r => {
          r.circle.interrupt('highlight');
          r.text.interrupt('highlight');
          r.circle.attr('opacity', 1);
          r.text.attr('opacity', 1);
          if (r.desc) { r.desc.interrupt('highlight'); r.desc.attr('opacity', 1); }
        });
        rows.forEach((r, j) => {
          if (j !== i) {
            r.circle.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER).attr('opacity', 0.4);
            r.text.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER).attr('opacity', 0.4);
            if (r.desc) r.desc.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER).attr('opacity', 0.4);
          }
        });
        this.context.events.emit('point:mouseover', {
          point: d, index: i, series: this, event,
          plotX: 20, plotY: y + rowHeight / 2,
        });
      };
      const onOut = (event: MouseEvent) => {
        circle.transition('size').duration(HOVER_DURATION).ease(EASE_HOVER).attr('r', markerRadius);
        circle.style('filter', '');
        el.attr('font-weight', 'normal');
        rows.forEach(r => {
          r.circle.interrupt('highlight');
          r.text.interrupt('highlight');
          r.circle.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER).attr('opacity', 1);
          r.text.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER).attr('opacity', 1);
          if (r.desc) { r.desc.interrupt('highlight'); r.desc.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER).attr('opacity', 1); }
        });
        this.context.events.emit('point:mouseout', { point: d, index: i, series: this, event });
      };
      const onClick = (event: MouseEvent) => {
        this.context.events.emit('point:click', { point: d, index: i, series: this, event });
      };

      circle.on('mouseover', onOver).on('mouseout', onOut).on('click', onClick);
      el.on('mouseover', onOver).on('mouseout', onOut).on('click', onClick);
    });
  }

  getDataExtents() {
    return { xMin: 0, xMax: 0, yMin: 0, yMax: 0 };
  }
}

export class GanttSeries extends BaseSeries {
  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  render(): void {
    const { xAxis, plotArea, colors } = this.context;
    const data = this.data;
    const barHeight = Math.min(25, (plotArea.height / Math.max(data.length, 1)) * 0.7);
    const rowHeight = plotArea.height / Math.max(data.length, 1);

    data.forEach((d, i) => {
      const start = (d as any).start ?? d.x ?? 0;
      const end = (d as any).end ?? (start + 1);
      const x1 = xAxis.getPixelForValue(start);
      const x2 = xAxis.getPixelForValue(end);
      const y = i * rowHeight + (rowHeight - barHeight) / 2;
      const color = d.color || colors[i % colors.length];

      const el = this.group.append('rect')
        .attr('class', 'katucharts-gantt-bar')
        .attr('x', x1)
        .attr('y', y)
        .attr('width', Math.max(1, x2 - x1))
        .attr('height', barHeight)
        .attr('rx', 3)
        .attr('fill', color)
        .attr('stroke', 'none');

      this.group.append('text')
        .attr('x', x1 + 4)
        .attr('y', y + barHeight / 2)
        .attr('dy', '0.35em')
        .attr('font-size', '10px')
        .attr('fill', '#fff')
        .text(d.name || '');

      el.style('cursor', 'pointer');
      const allBars = this.group.selectAll('.katucharts-gantt-bar');
      el.on('mouseover', (event: MouseEvent) => {
        el.style('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))');
        el.interrupt('hover')
          .transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER)
          .attr('stroke', '#333').attr('stroke-width', 1.5);
        this.context.events.emit('point:mouseover', {
          point: d, index: i, series: this, event,
          plotX: (x1 + x2) / 2, plotY: y + barHeight / 2,
        });
      })
      .on('mouseout', (event: MouseEvent) => {
        el.style('filter', '');
        el.interrupt('hover')
          .transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER)
          .attr('stroke', 'none').attr('stroke-width', 0);
        this.context.events.emit('point:mouseout', { point: d, index: i, series: this, event });
      })
      .on('click', (event: MouseEvent) => {
        this.context.events.emit('point:click', { point: d, index: i, series: this, event });
      });
    });
  }

  getDataExtents() {
    let xMin = Infinity, xMax = -Infinity;
    for (const d of this.data) {
      const start = (d as any).start ?? d.x ?? 0;
      const end = (d as any).end ?? (start + 1);
      xMin = Math.min(xMin, start);
      xMax = Math.max(xMax, end);
    }
    return { xMin, xMax, yMin: 0, yMax: 0 };
  }
}

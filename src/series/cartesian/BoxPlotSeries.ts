/**
 * BoxPlot series with features: medianColor, medianWidth,
 * medianDashStyle, stemColor, stemWidth, stemDashStyle, whiskerColor, whiskerWidth,
 * whiskerLength, whiskerDashStyle, boxDashStyle, fillColor, colorByPoint,
 * grouping/groupPadding/pointPadding, data labels, and animated updates.
 */

import { select } from 'd3-selection';
import 'd3-transition';
import { BaseSeries, resolveDashArray, staggerDelay } from '../BaseSeries';
import type { InternalSeriesConfig, PointOptions, BorderRadiusOptions } from '../../types/options';
import {
  ENTRY_DURATION,
  ENTRY_STAGGER_PER_ITEM,
  HOVER_DURATION,
  EASE_ENTRY,
  EASE_HOVER,
} from '../../core/animationConstants';

function resolveBorderRadius(val: number | BorderRadiusOptions | undefined): number {
  if (val === undefined) return 4;
  if (typeof val === 'number') return val;
  return val.radius ?? 4;
}

export class BoxPlotSeries extends BaseSeries {
  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  render(): void {
    const { xAxis, yAxis, plotArea } = this.context;
    const color = this.getColor();
    const data = this.data;
    const animate = this.context.animate;

    const { boxWidth, boxOffset } = this.computeBoxGeometry();

    const medianColor = this.config.medianColor || null;
    const medianWidth = this.config.medianWidth ?? 2;
    const medianDash = resolveDashArray(this.config.medianDashStyle);

    const stemWidth = this.config.stemWidth ?? 1;
    const stemDash = resolveDashArray(this.config.stemDashStyle);

    const whiskerWidth = this.config.whiskerWidth ?? 2;
    const whiskerDash = resolveDashArray(this.config.whiskerDashStyle);
    const whiskerLength = this.parseWhiskerLength(this.config.whiskerLength, boxWidth);

    const boxDash = resolveDashArray(this.config.boxDashStyle);
    const boxStrokeWidth = this.config.lineWidth ?? 1;
    const animOpts = typeof this.config.animation === 'object' ? this.config.animation : {};
    const entryDur = animOpts.duration ?? ENTRY_DURATION;

    for (let i = 0; i < data.length; i++) {
      const d = data[i] as any;
      const cx = xAxis.getPixelForValue(d.x ?? i) + boxOffset + boxWidth / 2;
      const low = d.low ?? 0;
      const q1 = d.q1 ?? d.low ?? 0;
      const median = d.median ?? d.y ?? 0;
      const q3 = d.q3 ?? d.high ?? 0;
      const high = d.high ?? 0;
      const midY = yAxis.getPixelForValue((low + high) / 2);

      const pointColor = d.color || this.getBoxFillColor(i, color);
      const fillColor = this.config.fillColor ?? '#ffffff';
      const stemColor = this.config.stemColor || pointColor;
      const whiskerColor = this.config.whiskerColor || pointColor;

      const g = this.group.append('g')
        .attr('class', 'katucharts-boxplot-point')
        .style('cursor', this.config.cursor || 'pointer');

      const lowerStem = g.append('line')
        .attr('x1', cx).attr('x2', cx)
        .attr('stroke', stemColor).attr('stroke-width', stemWidth)
        .attr('stroke-dasharray', stemDash);

      const upperStem = g.append('line')
        .attr('x1', cx).attr('x2', cx)
        .attr('stroke', stemColor).attr('stroke-width', stemWidth)
        .attr('stroke-dasharray', stemDash);

      const box = g.append('rect')
        .attr('x', cx - boxWidth / 2)
        .attr('width', boxWidth)
        .attr('fill', fillColor)
        .attr('stroke', pointColor)
        .attr('stroke-width', boxStrokeWidth)
        .attr('stroke-dasharray', boxDash)
        .attr('rx', resolveBorderRadius(this.config.borderRadius));

      const medianLine = g.append('line')
        .attr('x1', cx - boxWidth / 2).attr('x2', cx + boxWidth / 2)
        .attr('stroke', medianColor || this.config.lineColor || pointColor)
        .attr('stroke-width', medianWidth)
        .attr('stroke-dasharray', medianDash);

      const lowCap = g.append('line')
        .attr('x1', cx - whiskerLength / 2).attr('x2', cx + whiskerLength / 2)
        .attr('stroke', whiskerColor).attr('stroke-width', whiskerWidth)
        .attr('stroke-dasharray', whiskerDash);

      const highCap = g.append('line')
        .attr('x1', cx - whiskerLength / 2).attr('x2', cx + whiskerLength / 2)
        .attr('stroke', whiskerColor).attr('stroke-width', whiskerWidth)
        .attr('stroke-dasharray', whiskerDash);

      if (animate) {
        const delay = staggerDelay(i, 0, ENTRY_STAGGER_PER_ITEM, data.length);
        const dur = entryDur;

        lowerStem
          .attr('y1', midY).attr('y2', midY)
          .transition().duration(dur).ease(EASE_ENTRY).delay(delay)
          .attr('y1', yAxis.getPixelForValue(low))
          .attr('y2', yAxis.getPixelForValue(q1));

        upperStem
          .attr('y1', midY).attr('y2', midY)
          .transition().duration(dur).ease(EASE_ENTRY).delay(delay)
          .attr('y1', yAxis.getPixelForValue(q3))
          .attr('y2', yAxis.getPixelForValue(high));

        box
          .attr('y', midY).attr('height', 0)
          .transition().duration(dur).ease(EASE_ENTRY).delay(delay)
          .attr('y', yAxis.getPixelForValue(q3))
          .attr('height', Math.abs(yAxis.getPixelForValue(q1) - yAxis.getPixelForValue(q3)));

        medianLine
          .attr('y1', midY).attr('y2', midY)
          .transition().duration(dur).ease(EASE_ENTRY).delay(delay)
          .attr('y1', yAxis.getPixelForValue(median))
          .attr('y2', yAxis.getPixelForValue(median));

        lowCap
          .attr('y1', midY).attr('y2', midY)
          .transition().duration(dur).ease(EASE_ENTRY).delay(delay)
          .attr('y1', yAxis.getPixelForValue(low))
          .attr('y2', yAxis.getPixelForValue(low));

        highCap
          .attr('y1', midY).attr('y2', midY)
          .transition().duration(dur).ease(EASE_ENTRY).delay(delay)
          .attr('y1', yAxis.getPixelForValue(high))
          .attr('y2', yAxis.getPixelForValue(high));
      } else {
        lowerStem
          .attr('y1', yAxis.getPixelForValue(low))
          .attr('y2', yAxis.getPixelForValue(q1));
        upperStem
          .attr('y1', yAxis.getPixelForValue(q3))
          .attr('y2', yAxis.getPixelForValue(high));
        box
          .attr('y', yAxis.getPixelForValue(q3))
          .attr('height', Math.abs(yAxis.getPixelForValue(q1) - yAxis.getPixelForValue(q3)));
        medianLine
          .attr('y1', yAxis.getPixelForValue(median))
          .attr('y2', yAxis.getPixelForValue(median));
        lowCap
          .attr('y1', yAxis.getPixelForValue(low))
          .attr('y2', yAxis.getPixelForValue(low));
        highCap
          .attr('y1', yAxis.getPixelForValue(high))
          .attr('y2', yAxis.getPixelForValue(high));
      }

      this.attachBoxPointEvents(g, d, i, cx, yAxis.getPixelForValue(median), boxStrokeWidth);
    }

    this.renderDataLabels(
      data,
      (d, i) => xAxis.getPixelForValue(d.x ?? i) + boxOffset + boxWidth / 2,
      (d) => yAxis.getPixelForValue((d as any).high ?? d.y ?? 0)
    );

    if (animate) {
      this.emitAfterAnimate(entryDur + data.length * ENTRY_STAGGER_PER_ITEM);
    }
  }

  animateUpdate(duration: number): void {
    const { xAxis, yAxis } = this.context;
    const data = this.data;
    const { boxWidth, boxOffset } = this.computeBoxGeometry();

    const groups = this.group.selectAll<SVGGElement, unknown>('.katucharts-boxplot-point');
    const nodes = groups.nodes();

    if (nodes.length !== data.length) {
      this.group.selectAll('*').remove();
      this.render();
      return;
    }

    for (let i = 0; i < Math.min(nodes.length, data.length); i++) {
      const d = data[i] as any;
      const g = nodes[i];
      const cx = xAxis.getPixelForValue(d.x ?? i) + boxOffset + boxWidth / 2;
      const low = d.low ?? 0;
      const q1 = d.q1 ?? d.low ?? 0;
      const median = d.median ?? d.y ?? 0;
      const q3 = d.q3 ?? d.high ?? 0;
      const high = d.high ?? 0;

      const lines = g.querySelectorAll('line');
      const rect = g.querySelector('rect');

      if (lines[0]) {
        const sel = (this.group as any).select(() => lines[0]);
        sel.transition().duration(duration)
          .attr('x1', cx).attr('x2', cx)
          .attr('y1', yAxis.getPixelForValue(low))
          .attr('y2', yAxis.getPixelForValue(q1));
      }
      if (lines[1]) {
        const sel = (this.group as any).select(() => lines[1]);
        sel.transition().duration(duration)
          .attr('x1', cx).attr('x2', cx)
          .attr('y1', yAxis.getPixelForValue(q3))
          .attr('y2', yAxis.getPixelForValue(high));
      }
      if (rect) {
        const sel = (this.group as any).select(() => rect);
        sel.transition().duration(duration)
          .attr('x', cx - boxWidth / 2)
          .attr('y', yAxis.getPixelForValue(q3))
          .attr('height', Math.abs(yAxis.getPixelForValue(q1) - yAxis.getPixelForValue(q3)));
      }
      if (lines[2]) {
        const sel = (this.group as any).select(() => lines[2]);
        sel.transition().duration(duration)
          .attr('x1', cx - boxWidth / 2).attr('x2', cx + boxWidth / 2)
          .attr('y1', yAxis.getPixelForValue(median))
          .attr('y2', yAxis.getPixelForValue(median));
      }
      if (lines[3]) {
        const whiskerLen = this.parseWhiskerLength(this.config.whiskerLength, boxWidth);
        const sel = (this.group as any).select(() => lines[3]);
        sel.transition().duration(duration)
          .attr('x1', cx - whiskerLen / 2).attr('x2', cx + whiskerLen / 2)
          .attr('y1', yAxis.getPixelForValue(low))
          .attr('y2', yAxis.getPixelForValue(low));
      }
      if (lines[4]) {
        const whiskerLen = this.parseWhiskerLength(this.config.whiskerLength, boxWidth);
        const sel = (this.group as any).select(() => lines[4]);
        sel.transition().duration(duration)
          .attr('x1', cx - whiskerLen / 2).attr('x2', cx + whiskerLen / 2)
          .attr('y1', yAxis.getPixelForValue(high))
          .attr('y2', yAxis.getPixelForValue(high));
      }
    }

    this.group.selectAll('.katucharts-data-labels').remove();
    this.renderDataLabels(
      data,
      (d, i) => xAxis.getPixelForValue(d.x ?? i) + boxOffset + boxWidth / 2,
      (d) => yAxis.getPixelForValue((d as any).high ?? d.y ?? 0)
    );
  }

  private computeBoxGeometry() {
    const { xAxis, plotArea } = this.context;
    const data = this.data;
    const totalInGroup = (this.config.grouping !== false) ? (this.context.totalSeriesOfType || 1) : 1;
    const indexInGroup = (this.config.grouping !== false) ? (this.context.indexInType || 0) : 0;
    const groupPadding = this.config.groupPadding ?? 0.2;
    const pointPadding = this.config.pointPadding ?? 0.1;

    let groupWidth: number;
    if (this.config.pointWidth !== undefined) {
      groupWidth = this.config.pointWidth * totalInGroup * 1.5;
    } else {
      groupWidth = Math.min(200 * totalInGroup, (plotArea.width / Math.max(data.length, 1)));
    }

    let boxWidth: number;
    if (this.config.pointWidth !== undefined) {
      boxWidth = this.config.pointWidth;
    } else {
      boxWidth = (groupWidth * (1 - groupPadding * 2)) / totalInGroup * (1 - pointPadding * 2);
      if (this.config.maxPointWidth !== undefined) {
        boxWidth = Math.min(boxWidth, this.config.maxPointWidth);
      }
      boxWidth = Math.min(boxWidth, 90);
    }

    const groupStart = -groupWidth * (1 - groupPadding * 2) / 2;
    const boxOffset = groupStart + (boxWidth + boxWidth * pointPadding * 2) * indexInGroup + boxWidth * pointPadding;

    return { boxWidth, boxOffset };
  }

  private getBoxFillColor(index: number, seriesColor: string): string {
    if (this.config.colorByPoint) {
      const palette = this.config.colors || this.context.colors;
      return palette[index % palette.length];
    }
    return this.config.fillColor || '#ffffff';
  }

  private parseWhiskerLength(val: string | number | undefined, boxWidth: number): number {
    if (val === undefined) return boxWidth * 0.5;
    if (typeof val === 'number') return val;
    if (typeof val === 'string' && val.endsWith('%')) {
      return boxWidth * (parseFloat(val) / 100);
    }
    return parseFloat(val) || boxWidth * 0.5;
  }

  private attachBoxPointEvents(
    g: any, d: any, i: number, cx: number, medianPx: number, baseStrokeWidth: number
  ): void {
    if (this.config.enableMouseTracking === false) return;

    const allGroups = () => this.group.selectAll('.katucharts-boxplot-point');

    g.on('mouseover', (event: MouseEvent) => {
      g.style('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.25))');
      g.select('rect').interrupt('hover')
        .transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER)
        .attr('stroke-width', baseStrokeWidth + 1);
      const others = allGroups()
        .filter(function(this: any) { return this !== g.node(); });
      others.interrupt('hover')
        .transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER)
        .style('opacity', 0.4);
      this.context.events.emit('point:mouseover', {
        point: d, index: i, series: this, event,
        plotX: cx, plotY: medianPx,
      });
      d.events?.mouseOver?.call(d, event);
      this.config.point?.events?.mouseOver?.call(d, event);
    })
    .on('mouseout', (event: MouseEvent) => {
      g.style('filter', '');
      g.select('rect').interrupt('hover')
        .transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER)
        .attr('stroke-width', baseStrokeWidth);
      allGroups().interrupt('hover')
        .transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER)
        .style('opacity', null);
      this.context.events.emit('point:mouseout', { point: d, index: i, series: this, event });
      d.events?.mouseOut?.call(d, event);
      this.config.point?.events?.mouseOut?.call(d, event);
    })
    .on('click', (event: MouseEvent) => {
      this.context.events.emit('point:click', { point: d, index: i, series: this, event });
      d.events?.click?.call(d, event);
      this.config.point?.events?.click?.call(d, event);
      this.config.events?.click?.call(this, event);
    });
  }

  getDataExtents() {
    let xMin = Infinity, xMax = -Infinity;
    let yMin = Infinity, yMax = -Infinity;
    for (let i = 0; i < this.data.length; i++) {
      const d = this.data[i] as any;
      const x = d.x ?? i;
      xMin = Math.min(xMin, x);
      xMax = Math.max(xMax, x);
      yMin = Math.min(yMin, d.low ?? d.y ?? 0);
      yMax = Math.max(yMax, d.high ?? d.y ?? 0);
    }
    return { xMin, xMax, yMin, yMax };
  }
}

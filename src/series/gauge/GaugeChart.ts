import { arc as d3Arc } from 'd3-shape';
import { scaleLinear } from 'd3-scale';
import { interpolate } from 'd3-interpolate';
import { select } from 'd3-selection';
import 'd3-transition';
import { BaseSeries } from '../BaseSeries';
import type { InternalSeriesConfig, GaugeDialOptions, GaugePivotOptions, PaneOptions, PlotBandOptions } from '../../types/options';
import { templateFormat, stripHtmlTags } from '../../utils/format';
import { DEFAULT_CHART_TEXT_COLOR, DEFAULT_CHART_TEXT_SIZE } from '../../utils/chartText';
import {
  ENTRY_DURATION,
  HOVER_DURATION,
  EASE_ENTRY,
  EASE_HOVER,
} from '../../core/animationConstants';

export class GaugeChart extends BaseSeries {
  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  render(): void {
    const { plotArea } = this.context;
    const animate = this.context.animate;
    const cx = plotArea.width / 2;

    const paneCfg: PaneOptions = (this.config as any).pane || {};
    const startAngleDeg = paneCfg.startAngle ?? -90;
    const endAngleDeg = paneCfg.endAngle ?? 90;
    const startAngle = startAngleDeg * Math.PI / 180;
    const endAngle = endAngleDeg * Math.PI / 180;

    const isSemicircle = Math.abs(endAngleDeg - startAngleDeg) <= 180;
    const radius = isSemicircle
      ? Math.min(plotArea.width / 2, plotArea.height * 0.75) - 10
      : Math.min(plotArea.width, plotArea.height) / 2 - 10;
    const cy = isSemicircle ? plotArea.height * 0.65 : plotArea.height / 2;

    const min = (this.config as any).yAxis?.min ?? this.config.min ?? 0;
    const max = (this.config as any).yAxis?.max ?? this.config.max ?? 100;
    const value = this.data[0]?.y ?? 0;

    const wrap = (this.config as any).wrap !== false;
    const overshoot = (this.config as any).overshoot ?? 0;

    let clampedValue = value;
    if (wrap) {
      const range = max - min;
      if (range > 0) {
        clampedValue = min + ((value - min) % range + range) % range;
      }
    }

    const overshootRad = overshoot * Math.PI / 180;
    const angleScale = scaleLinear()
      .domain([min, max])
      .range([startAngle, endAngle])
      .clamp(!wrap && overshoot <= 0);

    let needleAngle = angleScale(clampedValue);
    if (!wrap && overshoot > 0) {
      const minAngle = startAngle - overshootRad;
      const maxAngle = endAngle + overshootRad;
      needleAngle = Math.max(minAngle, Math.min(maxAngle, needleAngle));
    }

    const g = this.group.append('g')
      .attr('transform', `translate(${cx},${cy})`);

    this.renderPaneBackground(g, radius, startAngle, endAngle, paneCfg);

    const bandThickness = radius * 0.15;
    const bgArc = d3Arc<any>()
      .innerRadius(radius - bandThickness)
      .outerRadius(radius)
      .startAngle(startAngle)
      .endAngle(endAngle)
      .cornerRadius(bandThickness / 2);

    g.append('path')
      .attr('d', bgArc({}) as string)
      .attr('fill', '#ddd');

    this.renderPlotBands(g, radius, startAngle, endAngle, min, max, bandThickness);
    this.renderTickMarks(g, radius, startAngle, endAngle, min, max, bandThickness);

    const dialCfg: GaugeDialOptions = (this.config as any).dial || {};
    const pivotCfg: GaugePivotOptions = (this.config as any).pivot || {};

    const dialColor = dialCfg.backgroundColor || '#333';
    const dialBorderColor = dialCfg.borderColor || 'none';
    const dialBorderWidth = dialCfg.borderWidth ?? 0;
    const dialBaseWidth = dialCfg.baseWidth ?? 8;
    const dialTopWidth = dialCfg.topWidth ?? 1;
    const dialRadius = this.resolvePercent(dialCfg.radius ?? '80%', radius);
    const dialRearLength = this.resolvePercent(dialCfg.rearLength ?? '15%', radius);

    const needleTipAngle = needleAngle - Math.PI / 2;
    const tipX = dialRadius * Math.cos(needleTipAngle);
    const tipY = dialRadius * Math.sin(needleTipAngle);
    const rearX = -dialRearLength * Math.cos(needleTipAngle);
    const rearY = -dialRearLength * Math.sin(needleTipAngle);
    const perpAngle = needleTipAngle + Math.PI / 2;
    const halfBase = dialBaseWidth / 2;
    const halfTop = dialTopWidth / 2;

    const needlePath = [
      `M${rearX + halfBase * Math.cos(perpAngle)},${rearY + halfBase * Math.sin(perpAngle)}`,
      `L${tipX + halfTop * Math.cos(perpAngle)},${tipY + halfTop * Math.sin(perpAngle)}`,
      `L${tipX - halfTop * Math.cos(perpAngle)},${tipY - halfTop * Math.sin(perpAngle)}`,
      `L${rearX - halfBase * Math.cos(perpAngle)},${rearY - halfBase * Math.sin(perpAngle)}`,
      'Z',
    ].join(' ');

    const needle = g.append('path')
      .attr('fill', dialColor)
      .attr('stroke', dialBorderColor)
      .attr('stroke-width', dialBorderWidth)
      .style('filter', 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))')
      .style('cursor', 'pointer');

    if (animate) {
      const startPath = this.buildNeedlePath(startAngle, dialRadius, dialRearLength, dialBaseWidth, dialTopWidth);
      needle.attr('d', startPath)
        .transition().duration(ENTRY_DURATION).ease(EASE_ENTRY)
        .attrTween('d', () => {
          const interp = interpolate(startAngle, needleAngle);
          return (t: number) => this.buildNeedlePath(interp(t), dialRadius, dialRearLength, dialBaseWidth, dialTopWidth);
        });
    } else {
      needle.attr('d', needlePath);
    }

    if (this.config.enableMouseTracking !== false) {
      const baseStrokeWidth = dialBorderWidth;
      needle
        .on('mouseover', (event: MouseEvent) => {
          needle.interrupt('hover')
            .transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER)
            .attr('stroke-width', baseStrokeWidth + 2);
          needle.style('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))');
          this.context.events.emit('point:mouseover', {
            point: this.data[0], index: 0, series: this, event,
            plotX: cx, plotY: cy,
          });
          this.data[0]?.events?.mouseOver?.call(this.data[0], event);
        })
        .on('mouseout', (event: MouseEvent) => {
          needle.interrupt('hover')
            .transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER)
            .attr('stroke-width', baseStrokeWidth);
          needle.style('filter', 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))');
          this.context.events.emit('point:mouseout', { point: this.data[0], index: 0, series: this, event });
          this.data[0]?.events?.mouseOut?.call(this.data[0], event);
        })
        .on('click', (event: MouseEvent) => {
          this.context.events.emit('point:click', { point: this.data[0], index: 0, series: this, event });
          this.data[0]?.events?.click?.call(this.data[0], event);
          this.config.events?.click?.call(this, event);
        });
    }

    const pivotRadius = pivotCfg.radius ?? 10;
    const pivotBorderWidth = pivotCfg.borderWidth ?? 2;
    g.append('circle')
      .attr('r', pivotRadius)
      .attr('fill', pivotCfg.backgroundColor || '#666')
      .attr('stroke', pivotCfg.borderColor || '#fff')
      .attr('stroke-width', pivotBorderWidth)
      .style('filter', 'drop-shadow(0 1px 2px rgba(0,0,0,0.2))');

    this.renderValueLabel(g, radius, value);

    if (animate) {
      this.emitAfterAnimate(ENTRY_DURATION + 100);
    }
  }

  private buildNeedlePath(angle: number, dialRadius: number, rearLength: number, baseWidth: number, topWidth: number): string {
    const tipAngle = angle - Math.PI / 2;
    const tipX = dialRadius * Math.cos(tipAngle);
    const tipY = dialRadius * Math.sin(tipAngle);
    const rearX = -rearLength * Math.cos(tipAngle);
    const rearY = -rearLength * Math.sin(tipAngle);
    const perpAngle = tipAngle + Math.PI / 2;
    const halfBase = baseWidth / 2;
    const halfTop = topWidth / 2;

    return [
      `M${rearX + halfBase * Math.cos(perpAngle)},${rearY + halfBase * Math.sin(perpAngle)}`,
      `L${tipX + halfTop * Math.cos(perpAngle)},${tipY + halfTop * Math.sin(perpAngle)}`,
      `L${tipX - halfTop * Math.cos(perpAngle)},${tipY - halfTop * Math.sin(perpAngle)}`,
      `L${rearX - halfBase * Math.cos(perpAngle)},${rearY - halfBase * Math.sin(perpAngle)}`,
      'Z',
    ].join(' ');
  }

  private renderPaneBackground(g: any, radius: number, startAngle: number, endAngle: number, paneCfg: PaneOptions): void {
    const backgrounds = paneCfg.background
      ? (Array.isArray(paneCfg.background) ? paneCfg.background : [paneCfg.background])
      : [];

    for (const bg of backgrounds) {
      const outerR = this.resolvePercent(bg.outerRadius ?? '100%', radius);
      const innerR = this.resolvePercent(bg.innerRadius ?? '0%', radius);

      const bgArc = d3Arc<any>()
        .innerRadius(innerR)
        .outerRadius(outerR)
        .startAngle(startAngle)
        .endAngle(endAngle);

      g.append('path')
        .attr('d', bgArc({}) as string)
        .attr('fill', bg.backgroundColor || '#f2f2f2')
        .attr('stroke', bg.borderColor || '#cccccc')
        .attr('stroke-width', bg.borderWidth ?? 0);
    }
  }

  /**
   * Renders colored zones on the gauge arc from yAxis.plotBands config.
   */
  private renderPlotBands(g: any, radius: number, startAngle: number, endAngle: number, min: number, max: number, bandThickness?: number): void {
    const plotBands: PlotBandOptions[] = (this.config as any).yAxis?.plotBands || [];
    if (plotBands.length === 0) return;

    const thickness = bandThickness ?? radius * 0.15;
    const angleScale = scaleLinear().domain([min, max]).range([startAngle, endAngle]);

    for (const band of plotBands) {
      if (band.from === undefined || band.to === undefined) continue;
      const bandArc = d3Arc<any>()
        .innerRadius(radius - thickness)
        .outerRadius(radius)
        .startAngle(angleScale(band.from))
        .endAngle(angleScale(band.to))
        .cornerRadius(thickness / 2);

      g.append('path')
        .attr('d', bandArc({}) as string)
        .attr('fill', band.color || '#e0e0e0')
        .attr('stroke', band.borderColor || 'none')
        .attr('stroke-width', band.borderWidth ?? 0);
    }
  }

  private renderTickMarks(g: any, radius: number, startAngle: number, endAngle: number, min: number, max: number, bandThickness?: number): void {
    const yAxisCfg = (this.config as any).yAxis || {};
    const tickPositions: number[] = yAxisCfg.tickPositions || this.generateTicks(min, max, 5);
    const tickLength = yAxisCfg.tickLength ?? 15;
    const tickWidth = yAxisCfg.tickWidth ?? 2;
    const labelsEnabled = yAxisCfg.labels?.enabled !== false;
    const labelStyle = yAxisCfg.labels?.style || {};
    const fontSize = (labelStyle.fontSize as string) || DEFAULT_CHART_TEXT_SIZE;
    const fontColor = (labelStyle.color as string) || DEFAULT_CHART_TEXT_COLOR;
    const thickness = bandThickness ?? radius * 0.15;

    const angleScale = scaleLinear().domain([min, max]).range([startAngle, endAngle]);

    const minorCount = yAxisCfg.minorTickInterval ? Math.round((max - min) / yAxisCfg.minorTickInterval) : 0;
    if (minorCount > 0 && yAxisCfg.minorTickInterval) {
      for (let i = 0; i <= minorCount; i++) {
        const val = min + i * yAxisCfg.minorTickInterval;
        if (val > max) break;
        const angle = angleScale(val) - Math.PI / 2;
        const outerR = radius - thickness + 2;
        const innerR = outerR - 6;
        g.append('line')
          .attr('x1', innerR * Math.cos(angle))
          .attr('y1', innerR * Math.sin(angle))
          .attr('x2', outerR * Math.cos(angle))
          .attr('y2', outerR * Math.sin(angle))
          .attr('stroke', '#999')
          .attr('stroke-width', 1);
      }
    }

    for (const val of tickPositions) {
      const angle = angleScale(val) - Math.PI / 2;
      const outerR = radius - thickness + 2;
      const innerR = outerR - tickLength;

      g.append('line')
        .attr('x1', innerR * Math.cos(angle))
        .attr('y1', innerR * Math.sin(angle))
        .attr('x2', outerR * Math.cos(angle))
        .attr('y2', outerR * Math.sin(angle))
        .attr('stroke', '#333')
        .attr('stroke-width', tickWidth);

      if (labelsEnabled) {
        const labelR = innerR - 10;
        g.append('text')
          .attr('x', labelR * Math.cos(angle))
          .attr('y', labelR * Math.sin(angle))
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'central')
          .attr('font-size', fontSize)
          .attr('font-weight', '600')
          .attr('fill', fontColor)
          .style('pointer-events', 'none')
          .text(String(val));
      }
    }
  }

  private generateTicks(min: number, max: number, count: number): number[] {
    const step = (max - min) / count;
    const ticks: number[] = [];
    for (let i = 0; i <= count; i++) {
      ticks.push(Math.round((min + step * i) * 100) / 100);
    }
    return ticks;
  }

  private renderValueLabel(g: any, radius: number, value: number): void {
    const dlCfg = this.config.dataLabels || {};
    const dlEnabled = dlCfg.enabled !== false;
    if (!dlEnabled) return;

    const dlFontSize = (dlCfg.style?.fontSize as string) || DEFAULT_CHART_TEXT_SIZE;
    const dlColor = dlCfg.color || (dlCfg.style?.color as string) || DEFAULT_CHART_TEXT_COLOR;

    let labelText: string;
    if (dlCfg.formatter) {
      labelText = dlCfg.formatter.call({
        point: this.data[0], series: { name: this.config.name },
        x: this.data[0]?.x, y: value,
      });
    } else if (dlCfg.format) {
      labelText = stripHtmlTags(templateFormat(dlCfg.format, {
        point: this.data[0], series: { name: this.config.name },
        x: this.data[0]?.x, y: value,
      }));
    } else {
      labelText = value.toString();
    }

    g.append('text')
      .attr('y', radius * 0.25 + (dlCfg.y ?? 0))
      .attr('x', dlCfg.x ?? 0)
      .attr('text-anchor', 'middle')
      .attr('font-size', dlFontSize)
      .attr('font-weight', 'bold')
      .attr('fill', dlColor)
      .text(labelText);
  }

  private resolvePercent(value: string | number, total: number): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.endsWith('%')) {
      return (parseFloat(value) / 100) * total;
    }
    return parseFloat(value) || 0;
  }

  getDataExtents() {
    return { xMin: 0, xMax: 0, yMin: 0, yMax: 0 };
  }
}

export class SolidGaugeChart extends BaseSeries {
  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  render(): void {
    const { plotArea, colors } = this.context;
    const animate = this.context.animate;
    const radius = Math.min(plotArea.width, plotArea.height) / 2 - 10;
    const cx = plotArea.width / 2;
    const cy = plotArea.height / 2;

    const min = (this.config as any).yAxis?.min ?? this.config.min ?? 0;
    const max = (this.config as any).yAxis?.max ?? this.config.max ?? 100;
    const isMultiArc = this.data.length > 1;

    const paneCfg: PaneOptions = (this.config as any).pane || {};
    const startAngle = (paneCfg.startAngle ?? -135) * Math.PI / 180;
    const endAngle = (paneCfg.endAngle ?? 135) * Math.PI / 180;

    const overshoot = (this.config as any).overshoot ?? 0;
    const overshootRad = overshoot * Math.PI / 180;

    const g = this.group.append('g')
      .attr('transform', `translate(${cx},${cy})`);

    const seriesInnerRadius = (this.config as any).innerRadius ?? 0.6;
    const seriesOuterRadius = (this.config as any).radius ?? 1.0;
    const cornerRadius = (this.config as any).rounded ?? 5;
    const linecapCfg = this.config.linecap || 'round';
    const yAxisStops: [number, string][] = (this.config as any).yAxis?.stops || [];

    if (!isMultiArc) {
      const innerR = this.resolveRadiusValue(seriesInnerRadius, radius);
      const outerR = this.resolveRadiusValue(seriesOuterRadius, radius);

      this.renderPaneBackground(g, outerR, innerR, startAngle, endAngle, paneCfg);
      this.renderPlotBands(g, outerR, innerR, startAngle, endAngle, min, max);

      this.renderSingleArc(g, this.data[0], 0, innerR, outerR, radius,
        startAngle, endAngle, min, max, overshoot, overshootRad,
        cornerRadius, linecapCfg, yAxisStops, cx, cy, animate);
    } else {
      const ringWidth = radius / (this.data.length + 0.5);
      const gap = ringWidth * 0.1;

      this.renderPaneBackground(g, radius, 0, startAngle, endAngle, paneCfg);

      this.data.forEach((d, i) => {
        const pointOuter = (d as any).radius
          ? this.resolveRadiusValue((d as any).radius, radius)
          : radius - i * ringWidth;
        const pointInner = (d as any).innerRadius
          ? this.resolveRadiusValue((d as any).innerRadius, radius)
          : pointOuter - ringWidth + gap;

        const color = d.color || colors[i % colors.length];
        const origColor = this.config.color;
        this.config.color = color;

        this.renderSingleArc(g, d, i, pointInner, pointOuter, radius,
          startAngle, endAngle, min, max, overshoot, overshootRad,
          cornerRadius, linecapCfg, yAxisStops, cx, cy, animate);

        this.config.color = origColor;
      });
    }

    this.renderTickMarks(g, radius, startAngle, endAngle, min, max);

    if (!isMultiArc) {
      this.renderValueLabel(g, this.data[0]?.y ?? 0);
    }

    if (animate) {
      this.emitAfterAnimate(ENTRY_DURATION + 100);
    }
  }

  /**
   * Renders a single arc for one data point, with yAxis stops gradient,
   * linecap rounding, and overshoot support.
   */
  private renderSingleArc(
    g: any, d: any, idx: number,
    innerR: number, outerR: number, totalRadius: number,
    startAngle: number, endAngle: number,
    min: number, max: number,
    overshoot: number, overshootRad: number,
    cornerRadius: number, linecapCfg: string,
    yAxisStops: [number, string][],
    cx: number, cy: number, animate: boolean | undefined
  ): void {
    const value = d?.y ?? 0;
    const fraction = Math.max(0, Math.min(1, (value - min) / (max - min)));
    let valueAngle = startAngle + (endAngle - startAngle) * fraction;

    if (overshoot > 0 && value > max) {
      const extraFraction = (value - max) / (max - min);
      valueAngle = endAngle + Math.min(overshootRad, (endAngle - startAngle) * extraFraction);
    }

    const useRoundCap = linecapCfg === 'round';

    const bgArc = d3Arc<any>()
      .innerRadius(innerR)
      .outerRadius(outerR)
      .startAngle(startAngle)
      .endAngle(endAngle)
      .cornerRadius(useRoundCap ? (outerR - innerR) / 2 : cornerRadius);

    g.append('path').attr('d', bgArc({}) as string).attr('fill', '#e0e0e0');

    const arcCorner = useRoundCap ? (outerR - innerR) / 2 : cornerRadius;

    const valArcGen = d3Arc<any>()
      .innerRadius(innerR)
      .outerRadius(outerR)
      .cornerRadius(arcCorner);

    const hoverArcGen = d3Arc<any>()
      .innerRadius(innerR)
      .outerRadius(outerR + 5)
      .cornerRadius(arcCorner);

    const arcColor = this.resolveArcColor(fraction, yAxisStops, d);

    const valPath = g.append('path')
      .attr('fill', arcColor)
      .style('cursor', 'pointer');

    if (animate) {
      const interp = interpolate(startAngle, valueAngle);
      const self = this;
      valPath.transition().duration(ENTRY_DURATION).ease(EASE_ENTRY)
        .attrTween('d', () => (t: number) => {
          const currentAngle = interp(t);
          const path = valArcGen.startAngle(startAngle).endAngle(currentAngle)({}) as string;
          if (yAxisStops.length > 0) {
            const frac = (currentAngle - startAngle) / (endAngle - startAngle);
            valPath.attr('fill', self.getStopColor(Math.min(1, frac), yAxisStops));
          }
          return path;
        });
    } else {
      valPath.attr('d', valArcGen.startAngle(startAngle).endAngle(valueAngle)({}) as string);
    }

    if (this.config.enableMouseTracking !== false) {
      valPath
        .on('mouseover', (event: MouseEvent) => {
          valPath.interrupt('hover')
            .transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER)
            .attr('d', hoverArcGen.startAngle(startAngle).endAngle(valueAngle)({}) as string);
          valPath.style('filter', 'drop-shadow(0 2px 6px rgba(0,0,0,0.25))');
          this.context.events.emit('point:mouseover', {
            point: d, index: idx, series: this, event,
            plotX: cx, plotY: cy,
          });
          d?.events?.mouseOver?.call(d, event);
        })
        .on('mouseout', (event: MouseEvent) => {
          valPath.interrupt('hover')
            .transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER)
            .attr('d', valArcGen.startAngle(startAngle).endAngle(valueAngle)({}) as string);
          valPath.style('filter', '');
          this.context.events.emit('point:mouseout', { point: d, index: idx, series: this, event });
          d?.events?.mouseOut?.call(d, event);
        })
        .on('click', (event: MouseEvent) => {
          this.context.events.emit('point:click', { point: d, index: idx, series: this, event });
          d?.events?.click?.call(d, event);
          this.config.events?.click?.call(this, event);
        });
    }
  }

  /**
   * Resolves the arc fill color considering yAxis.stops gradient and point color.
   */
  private resolveArcColor(fraction: number, stops: [number, string][], d: any): string {
    if (d?.color) return d.color;
    if (stops.length >= 2) return this.getStopColor(fraction, stops);
    return this.getColor();
  }

  private getStopColor(fraction: number, stops: [number, string][]): string {
    if (fraction <= stops[0][0]) return stops[0][1];
    if (fraction >= stops[stops.length - 1][0]) return stops[stops.length - 1][1];

    for (let i = 0; i < stops.length - 1; i++) {
      if (fraction >= stops[i][0] && fraction <= stops[i + 1][0]) {
        const t = (fraction - stops[i][0]) / (stops[i + 1][0] - stops[i][0]);
        const c1 = stops[i][1];
        const c2 = stops[i + 1][1];
        return interpolate(c1, c2)(t);
      }
    }
    return stops[stops.length - 1][1];
  }

  private resolveRadiusValue(val: string | number, totalRadius: number): number {
    if (typeof val === 'string' && val.endsWith('%')) {
      return totalRadius * parseFloat(val) / 100;
    }
    if (typeof val === 'number') {
      return val <= 1 ? totalRadius * val : val;
    }
    return totalRadius * 0.6;
  }

  private renderPaneBackground(g: any, radius: number, innerR: number, startAngle: number, endAngle: number, paneCfg: PaneOptions): void {
    const backgrounds = paneCfg.background
      ? (Array.isArray(paneCfg.background) ? paneCfg.background : [paneCfg.background])
      : [];

    for (const bg of backgrounds) {
      const outerR = this.resolvePercent(bg.outerRadius ?? '100%', radius);
      const innerBgR = this.resolvePercent(bg.innerRadius ?? '0%', radius);

      const bgArc = d3Arc<any>()
        .innerRadius(innerBgR)
        .outerRadius(outerR)
        .startAngle(startAngle)
        .endAngle(endAngle);

      g.append('path')
        .attr('d', bgArc({}) as string)
        .attr('fill', bg.backgroundColor || '#f2f2f2')
        .attr('stroke', bg.borderColor || '#cccccc')
        .attr('stroke-width', bg.borderWidth ?? 0);
    }
  }

  private renderPlotBands(g: any, radius: number, innerR: number, startAngle: number, endAngle: number, min: number, max: number): void {
    const plotBands: any[] = (this.config as any).yAxis?.plotBands || [];
    if (plotBands.length === 0) return;

    const angleScale = scaleLinear().domain([min, max]).range([startAngle, endAngle]);

    for (const band of plotBands) {
      if (band.from === undefined || band.to === undefined) continue;
      const bandArc = d3Arc<any>()
        .innerRadius(innerR)
        .outerRadius(radius)
        .startAngle(angleScale(band.from))
        .endAngle(angleScale(band.to));

      g.append('path')
        .attr('d', bandArc({}) as string)
        .attr('fill', band.color || '#e0e0e0')
        .attr('stroke', band.borderColor || 'none')
        .attr('stroke-width', band.borderWidth ?? 0);
    }
  }

  private renderTickMarks(g: any, radius: number, startAngle: number, endAngle: number, min: number, max: number): void {
    const yAxisCfg = (this.config as any).yAxis || {};
    const tickPositions: number[] = yAxisCfg.tickPositions || this.generateTicks(min, max, 5);
    const labelsEnabled = yAxisCfg.labels?.enabled !== false;
    const labelStyle = yAxisCfg.labels?.style || {};
    const fontSize = (labelStyle.fontSize as string) || DEFAULT_CHART_TEXT_SIZE;
    const fontColor = (labelStyle.color as string) || DEFAULT_CHART_TEXT_COLOR;

    const angleScale = scaleLinear().domain([min, max]).range([startAngle, endAngle]);

    for (const val of tickPositions) {
      const angle = angleScale(val) - Math.PI / 2;

      if (labelsEnabled) {
        const labelR = radius + 14;
        g.append('text')
          .attr('x', labelR * Math.cos(angle))
          .attr('y', labelR * Math.sin(angle))
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'central')
          .attr('font-size', fontSize)
          .attr('fill', fontColor)
          .style('pointer-events', 'none')
          .text(String(val));
      }
    }
  }

  private generateTicks(min: number, max: number, count: number): number[] {
    const step = (max - min) / count;
    const ticks: number[] = [];
    for (let i = 0; i <= count; i++) {
      ticks.push(Math.round((min + step * i) * 100) / 100);
    }
    return ticks;
  }

  private renderValueLabel(g: any, value: number): void {
    const dlCfg = this.config.dataLabels || {};
    const dlEnabled = dlCfg.enabled !== false;
    if (!dlEnabled) return;

    const dlFontSize = (dlCfg.style?.fontSize as string) || DEFAULT_CHART_TEXT_SIZE;
    const dlColor = dlCfg.color || (dlCfg.style?.color as string) || DEFAULT_CHART_TEXT_COLOR;

    let labelText: string;
    if (dlCfg.formatter) {
      labelText = dlCfg.formatter.call({
        point: this.data[0], series: { name: this.config.name },
        x: this.data[0]?.x, y: value,
      });
    } else if (dlCfg.format) {
      labelText = stripHtmlTags(templateFormat(dlCfg.format, {
        point: this.data[0], series: { name: this.config.name },
        x: this.data[0]?.x, y: value,
      }));
    } else {
      labelText = value.toString();
    }

    g.append('text')
      .attr('y', 10 + (dlCfg.y ?? 0))
      .attr('x', dlCfg.x ?? 0)
      .attr('text-anchor', 'middle')
      .attr('font-size', dlFontSize)
      .attr('font-weight', 'bold')
      .attr('fill', dlColor)
      .text(labelText);
  }

  private resolvePercent(value: string | number, total: number): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.endsWith('%')) {
      return (parseFloat(value) / 100) * total;
    }
    return parseFloat(value) || 0;
  }

  getDataExtents() {
    return { xMin: 0, xMax: 0, yMin: 0, yMax: 0 };
  }
}

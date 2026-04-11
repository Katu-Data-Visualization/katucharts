/**
 * Scatter series with features: jitter, marker symbols,
 * data labels, point selection, animated updates, and negativeColor.
 */

import { symbol as d3Symbol, symbolCircle, symbolSquare, symbolDiamond, symbolTriangle, symbolTriangle2, symbolCross } from 'd3-shape';
import { select } from 'd3-selection';
import 'd3-transition';
import { BaseSeries, staggerDelay } from '../BaseSeries';
import type { InternalSeriesConfig, PointOptions } from '../../types/options';
import {
  ENTRY_DURATION,
  ENTRY_STAGGER_PER_ITEM,
  HOVER_DURATION,
  EASE_ENTRY,
  EASE_HOVER,
} from '../../core/animationConstants';

const symbolMap: Record<string, any> = {
  circle: symbolCircle,
  square: symbolSquare,
  diamond: symbolDiamond,
  triangle: symbolTriangle,
  'triangle-down': symbolTriangle2,
  cross: symbolCross,
};

const DEFAULT_SYMBOL_CYCLE = ['circle', 'diamond', 'square', 'triangle', 'triangle-down'];

export class ScatterSeries extends BaseSeries {
  private cachedPositions: { cx: number; cy: number }[] = [];

  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  private resolveMarkerSymbol(): string {
    if (this.config.marker?.symbol) return this.config.marker.symbol;
    const all = this.context.allSeries || [];
    const scatterSeries = all.filter(s => s.config._internalType === 'scatter');
    if (scatterSeries.length <= 1) return 'circle';
    const idx = scatterSeries.indexOf(this);
    return DEFAULT_SYMBOL_CYCLE[idx % DEFAULT_SYMBOL_CYCLE.length];
  }

  getLegendSymbolShape(): string | null {
    return this.resolveMarkerSymbol();
  }

  render(): void {
    const { xAxis, yAxis, plotArea } = this.context;
    const color = this.getColor();
    const data = this.data.filter(d => d.y !== null && d.y !== undefined);
    const radius = this.config.marker?.radius ?? 4;
    const hoverRadius = this.config.marker?.states?.hover?.radius ?? (radius + 3);
    const animate = this.context.animate;
    const markerSymbol = this.resolveMarkerSymbol();
    const jitter = this.config.jitter;

    this.cachedPositions = data.map(d => ({
      cx: this.applyJitter(
        xAxis.getPixelForValue(d.x ?? 0),
        plotArea.width,
        jitter?.x
      ),
      cy: this.applyJitter(
        yAxis.getPixelForValue(d.y ?? 0),
        plotArea.height,
        jitter?.y
      ),
    }));

    if (markerSymbol === 'circle') {
      this.renderCircles(data, color, radius, hoverRadius, !!animate);
    } else {
      this.renderSymbols(data, color, radius, hoverRadius, markerSymbol, !!animate);
    }

    this.renderDataLabels(
      data,
      (_, i) => this.cachedPositions[i].cx,
      (_, i) => this.cachedPositions[i].cy
    );

    if (animate) {
      this.emitAfterAnimate(ENTRY_DURATION + data.length * ENTRY_STAGGER_PER_ITEM);
    }
  }

  animateUpdate(duration: number): void {
    const { xAxis, yAxis, plotArea } = this.context;
    const color = this.getColor();
    const data = this.data.filter(d => d.y !== null && d.y !== undefined);
    const radius = this.config.marker?.radius ?? 4;
    const jitter = this.config.jitter;

    this.cachedPositions = data.map(d => ({
      cx: this.applyJitter(xAxis.getPixelForValue(d.x ?? 0), plotArea.width, jitter?.x),
      cy: this.applyJitter(yAxis.getPixelForValue(d.y ?? 0), plotArea.height, jitter?.y),
    }));

    const markerSymbol = this.resolveMarkerSymbol();
    const useCircles = markerSymbol === 'circle';

    if (useCircles) {
      const circles = this.group.selectAll<SVGCircleElement, PointOptions>('.katucharts-scatter-point')
        .data(data);

      circles.exit().transition().duration(duration).attr('r', 0).remove();

      const enter = circles.enter().append('circle')
        .attr('class', 'katucharts-scatter-point')
        .attr('r', 0)
        .attr('fill', d => this.getPointFill(d, color))
        .attr('stroke', this.config.marker?.lineColor || color)
        .attr('stroke-width', this.config.marker?.lineWidth ?? 1)
        .attr('opacity', this.config.opacity ?? 1);

      enter.merge(circles)
        .transition().duration(duration)
        .attr('cx', (_, i) => this.cachedPositions[i].cx)
        .attr('cy', (_, i) => this.cachedPositions[i].cy)
        .attr('r', radius);
    } else {
      const symbolType = symbolMap[markerSymbol] || symbolCircle;
      const symbolSize = Math.PI * radius * radius;
      const gen = d3Symbol().type(symbolType).size(symbolSize);

      const symbols = this.group.selectAll<SVGPathElement, PointOptions>('.katucharts-scatter-point')
        .data(data);

      symbols.exit().transition().duration(duration).attr('opacity', 0).remove();

      const enter = symbols.enter().append('path')
        .attr('class', 'katucharts-scatter-point')
        .attr('fill', d => this.getPointFill(d, color))
        .attr('stroke', this.config.marker?.lineColor || color)
        .attr('stroke-width', this.config.marker?.lineWidth ?? 1)
        .attr('opacity', this.config.opacity ?? 1);

      enter.merge(symbols)
        .transition().duration(duration)
        .attr('transform', (_, i) =>
          `translate(${this.cachedPositions[i].cx},${this.cachedPositions[i].cy})`
        )
        .attr('d', gen as any);
    }

    this.group.selectAll('.katucharts-data-labels').remove();
    this.renderDataLabels(
      data,
      (_, i) => this.cachedPositions[i].cx,
      (_, i) => this.cachedPositions[i].cy
    );
  }

  private getPointFill(d: PointOptions, seriesColor: string): string {
    if (d.color) return d.color;
    if (d.marker?.fillColor) return d.marker.fillColor;
    if (this.config.marker?.fillColor) return this.config.marker.fillColor;
    if (this.config.negativeColor && (d.y ?? 0) < (this.config.threshold ?? 0)) {
      return this.config.negativeColor;
    }
    return seriesColor;
  }

  private getEntryDuration(): number {
    const animOpts = typeof this.config.animation === 'object' ? this.config.animation : {};
    return animOpts.duration ?? ENTRY_DURATION;
  }

  private renderCircles(
    data: PointOptions[], color: string,
    radius: number, hoverRadius: number, animate: boolean
  ): void {
    const circles = this.group.selectAll('.katucharts-scatter-point')
      .data(data)
      .join('circle')
      .attr('class', 'katucharts-scatter-point')
      .attr('cx', (_, i) => this.cachedPositions[i].cx)
      .attr('cy', (_, i) => this.cachedPositions[i].cy)
      .attr('fill', d => this.getPointFill(d, color))
      .attr('stroke', this.config.marker?.lineColor || color)
      .attr('stroke-width', this.config.marker?.lineWidth ?? 1)
      .attr('opacity', this.config.opacity ?? 1)
      .style('cursor', this.config.cursor || 'pointer');

    if (animate) {
      circles
        .attr('r', 0)
        .transition().duration(this.getEntryDuration()).ease(EASE_ENTRY)
        .delay((_, i) => staggerDelay(i, 0, ENTRY_STAGGER_PER_ITEM, data.length))
        .attr('r', radius);
    } else {
      circles.attr('r', radius);
    }

    this.attachScatterEvents(circles, data, radius, hoverRadius, color, 'circle');
  }

  private renderSymbols(
    data: PointOptions[], color: string,
    radius: number, hoverRadius: number,
    markerSymbol: string, animate: boolean
  ): void {
    const symbolType = symbolMap[markerSymbol] || symbolCircle;
    const symbolSize = Math.PI * radius * radius;
    const gen = d3Symbol().type(symbolType).size(symbolSize);

    const symbols = this.group.selectAll('.katucharts-scatter-point')
      .data(data)
      .join('path')
      .attr('class', 'katucharts-scatter-point')
      .attr('transform', (_, i) =>
        `translate(${this.cachedPositions[i].cx},${this.cachedPositions[i].cy})`
      )
      .attr('fill', d => this.getPointFill(d, color))
      .attr('stroke', this.config.marker?.lineColor || color)
      .attr('stroke-width', this.config.marker?.lineWidth ?? 1)
      .attr('opacity', this.config.opacity ?? 1)
      .style('cursor', this.config.cursor || 'pointer');

    if (animate) {
      const zeroGen = d3Symbol().type(symbolType).size(0);
      symbols
        .attr('d', zeroGen as any)
        .transition().duration(this.getEntryDuration()).ease(EASE_ENTRY)
        .delay((_, i) => staggerDelay(i, 0, ENTRY_STAGGER_PER_ITEM, data.length))
        .attr('d', gen as any);
    } else {
      symbols.attr('d', gen as any);
    }

    const hoverSize = Math.PI * hoverRadius * hoverRadius;
    const hoverGen = d3Symbol().type(symbolType).size(hoverSize);
    this.attachScatterEvents(symbols, data, radius, hoverRadius, color, 'symbol', gen, hoverGen);
  }

  private attachScatterEvents(
    elements: any, data: PointOptions[],
    radius: number, hoverRadius: number, color: string,
    type: 'circle' | 'symbol',
    gen?: any, hoverGen?: any
  ): void {
    if (this.config.enableMouseTracking === false) return;

    const hoverState = this.config.states?.hover;
    const hoverFillColor = hoverState?.marker?.fillColor;
    const hoverLineWidth = this.config.marker?.states?.hover?.lineWidth;
    const haloConfig = hoverState?.halo;
    const haloSize = haloConfig?.size ?? 10;
    const haloOpacity = haloConfig?.opacity ?? 0.25;

    const halos = data.map((d, i) => {
      return this.group.insert('circle', '.katucharts-scatter-point')
        .attr('cx', this.cachedPositions[i].cx)
        .attr('cy', this.cachedPositions[i].cy)
        .attr('r', 0)
        .attr('fill', d.color || this.config.marker?.fillColor || color)
        .attr('opacity', 0)
        .attr('class', 'katucharts-halo');
    });

    elements
      .on('mouseover', (event: MouseEvent, d: PointOptions) => {
        const target = event.currentTarget as SVGElement;
        const i = data.indexOf(d);

        if (i >= 0 && halos[i]) {
          halos[i].transition('halo').duration(HOVER_DURATION).ease(EASE_HOVER)
            .attr('r', haloSize)
            .attr('opacity', haloOpacity);
        }

        const targetSel = select(target).interrupt('hover');
        const tween = targetSel.transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER);
        if (type === 'circle') {
          tween.attr('r', hoverRadius);
        } else if (hoverGen) {
          tween.attr('d', hoverGen() as string);
        }
        target.style.filter = 'drop-shadow(0 1px 4px rgba(0,0,0,0.3))';
        if (hoverFillColor) tween.style('fill', hoverFillColor);
        if (hoverLineWidth !== undefined) tween.style('stroke-width', String(hoverLineWidth));

        this.context.events.emit('point:mouseover', {
          point: d, index: i, series: this, event,
          plotX: this.cachedPositions[i]?.cx ?? 0,
          plotY: this.cachedPositions[i]?.cy ?? 0,
        });
        d.events?.mouseOver?.call(d, event);
        this.config.point?.events?.mouseOver?.call(d, event);
      })
      .on('mouseout', (event: MouseEvent, d: PointOptions) => {
        const target = event.currentTarget as SVGElement;
        const i = data.indexOf(d);

        if (i >= 0 && halos[i]) {
          halos[i].transition('halo').duration(HOVER_DURATION).ease(EASE_HOVER)
            .attr('r', 0)
            .attr('opacity', 0);
        }

        const targetSel = select(target).interrupt('hover');
        const tween = targetSel.transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER);
        if (type === 'circle') {
          tween.attr('r', radius);
        } else if (gen) {
          tween.attr('d', gen() as string);
        }
        target.style.filter = '';
        tween.style('fill', null).style('stroke-width', null);

        this.context.events.emit('point:mouseout', { point: d, index: i, series: this, event });
        d.events?.mouseOut?.call(d, event);
        this.config.point?.events?.mouseOut?.call(d, event);
      })
      .on('click', (event: MouseEvent, d: PointOptions) => {
        const i = data.indexOf(d);
        this.context.events.emit('point:click', { point: d, index: i, series: this, event });
        d.events?.click?.call(d, event);
        this.config.point?.events?.click?.call(d, event);
        this.config.events?.click?.call(this, event);
        this.handlePointSelect(select(event.currentTarget as Element), d, i, event);
      });
  }
}

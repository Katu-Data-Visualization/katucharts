/**
 * Manhattan plot for genome-wide association studies (GWAS).
 * Points grouped by chromosome with alternating colors and significance threshold lines.
 *
 * Optimized for large datasets:
 * - Canvas rendering when data exceeds canvasThreshold (default 20000)
 * - Stack-safe min/max computations
 * - Significance points rendered as SVG overlay on top of canvas for interactivity
 */

import { select } from 'd3-selection';
import { color as d3Color } from 'd3-color';
import 'd3-transition';
import { BaseSeries } from '../BaseSeries';
import type { InternalSeriesConfig, PointOptions } from '../../types/options';
import { DEFAULT_CHART_TEXT_COLOR, DEFAULT_CHART_TEXT_SIZE } from '../../utils/chartText';
import {
  ENTRY_DURATION,
  HOVER_DURATION,
  EASE_ENTRY,
  EASE_HOVER,
} from '../../core/animationConstants';

const CHR_ORDER = ['1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18','19','20','21','22','X','Y','MT'];

function parseRgba(c: string): [number, number, number] {
  const parsed = d3Color(c);
  if (parsed) {
    const rgb = parsed.rgb();
    return [Math.round(rgb.r), Math.round(rgb.g), Math.round(rgb.b)];
  }
  return [128, 128, 128];
}

export class ManhattanSeries extends BaseSeries {
  private chrGroups: Map<string, PointOptions[]> = new Map();
  private positions: { cx: number; cy: number }[] = [];

  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  render(): void {
    const { xAxis, yAxis, plotArea } = this.context;
    const animate = this.context.animate;
    const data = this.data.filter(d => d.y !== null && d.y !== undefined);

    const chrColors = this.config.chromosomeColors ?? [this.context.colors[0] ?? '#2980b9', this.context.colors[1] ?? '#7f8c8d'];
    const sigLine = this.config.significanceLine ?? 5e-8;
    const sugLine = this.config.suggestiveLine ?? 1e-5;
    const sigLineColor = this.config.significanceLineColor ?? '#e74c3c';
    const sugLineColor = this.config.suggestiveLineColor ?? '#3498db';
    const radius = this.config.marker?.radius ?? 2.5;
    const hoverRadius = this.config.marker?.states?.hover?.radius ?? (radius + 2);
    const labelTopN = this.config.labelTopN ?? 0;
    const canvasThreshold = this.config.canvasThreshold ?? 20000;

    this.groupByChromosome(data);

    this.positions = new Array(data.length);
    for (let i = 0; i < data.length; i++) {
      this.positions[i] = {
        cx: xAxis.getPixelForValue(data[i].x ?? 0),
        cy: yAxis.getPixelForValue(data[i].y ?? 0),
      };
    }

    this.renderSignificanceLines(sigLine, sugLine, sigLineColor, sugLineColor);

    if (data.length > canvasThreshold) {
      this.renderPointsCanvas(data, chrColors, radius, sigLine);
      const negLog10Sig = -Math.log10(sigLine);
      const sigPoints = data.filter(d => (d.y ?? 0) >= negLog10Sig);
      if (sigPoints.length > 0 && sigPoints.length < 2000) {
        this.renderSignificantPointsSVG(sigPoints, data, chrColors, radius, hoverRadius);
      }
    } else {
      this.renderChromosomePoints(data, chrColors, radius, hoverRadius, !!animate);
    }

    this.renderChromosomeLabels(data);

    if (labelTopN > 0) {
      this.renderTopLabels(data, sigLine, labelTopN);
    }

    if (animate) {
      this.emitAfterAnimate(ENTRY_DURATION);
    }
  }

  private groupByChromosome(data: PointOptions[]): void {
    this.chrGroups.clear();
    for (const d of data) {
      const chr = String(d.custom?.chr ?? d.custom?.chromosome ?? '');
      if (!this.chrGroups.has(chr)) this.chrGroups.set(chr, []);
      this.chrGroups.get(chr)!.push(d);
    }
  }

  private getChrIndex(chr: string): number {
    const idx = CHR_ORDER.indexOf(chr);
    return idx >= 0 ? idx : CHR_ORDER.length;
  }

  private buildChrColorMap(chrColors: string[]): Map<string, string> {
    const sortedChrs = Array.from(this.chrGroups.keys())
      .sort((a, b) => this.getChrIndex(a) - this.getChrIndex(b));
    const map = new Map<string, string>();
    sortedChrs.forEach((chr, i) => {
      map.set(chr, chrColors[i % chrColors.length]);
    });
    return map;
  }

  private renderSignificanceLines(sigLine: number, sugLine: number, sigColor: string, sugColor: string): void {
    const { yAxis, plotArea } = this.context;
    const linesGroup = this.group.append('g').attr('class', 'katucharts-manhattan-lines');

    const negLog10Sig = -Math.log10(sigLine);
    const sigY = yAxis.getPixelForValue(negLog10Sig);
    if (sigY >= 0 && sigY <= plotArea.height) {
      linesGroup.append('line')
        .attr('x1', 0).attr('x2', plotArea.width)
        .attr('y1', sigY).attr('y2', sigY)
        .attr('stroke', sigColor).attr('stroke-width', 1)
        .attr('stroke-dasharray', '8,4')
        .attr('opacity', 0.8);
    }

    const negLog10Sug = -Math.log10(sugLine);
    const sugY = yAxis.getPixelForValue(negLog10Sug);
    if (sugY >= 0 && sugY <= plotArea.height) {
      linesGroup.append('line')
        .attr('x1', 0).attr('x2', plotArea.width)
        .attr('y1', sugY).attr('y2', sugY)
        .attr('stroke', sugColor).attr('stroke-width', 1)
        .attr('stroke-dasharray', '4,4')
        .attr('opacity', 0.6);
    }
  }

  private renderPointsCanvas(
    data: PointOptions[], chrColors: string[], radius: number, sigLine: number
  ): void {
    const { plotArea } = this.context;
    const chrColorMap = this.buildChrColorMap(chrColors);
    const negLog10Sig = -Math.log10(sigLine);

    const w = Math.ceil(plotArea.width);
    const h = Math.ceil(plotArea.height);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    if (!ctx) return;

    const colorCache = new Map<string, [number, number, number]>();
    for (const [chr, color] of chrColorMap) {
      colorCache.set(chr, parseRgba(color));
    }

    const opacity = this.config.opacity ?? 0.75;

    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      const chr = String(d.custom?.chr ?? d.custom?.chromosome ?? '');
      const rgb = colorCache.get(chr) ?? [153, 153, 153];
      const pos = this.positions[i];

      if (pos.cx < 0 || pos.cx > w || pos.cy < 0 || pos.cy > h) continue;

      const isSig = (d.y ?? 0) >= negLog10Sig;
      const alpha = isSig ? 1.0 : opacity;
      const r = isSig ? radius + 0.5 : radius;

      ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
      ctx.beginPath();
      ctx.arc(pos.cx, pos.cy, r, 0, 2 * Math.PI);
      ctx.fill();
    }

    const dataUrl = canvas.toDataURL();
    const img = this.group.append('image')
      .attr('class', 'katucharts-manhattan-canvas')
      .attr('width', plotArea.width)
      .attr('height', plotArea.height)
      .attr('href', dataUrl);

    if (this.context.animate) {
      img.attr('opacity', 0)
        .transition().duration(ENTRY_DURATION).ease(EASE_ENTRY)
        .attr('opacity', 1);
    }
  }

  private renderSignificantPointsSVG(
    sigPoints: PointOptions[], allData: PointOptions[],
    chrColors: string[], radius: number, hoverRadius: number
  ): void {
    const chrColorMap = this.buildChrColorMap(chrColors);

    const sigGroup = this.group.append('g').attr('class', 'katucharts-manhattan-sig-overlay');

    const sigCircles = sigGroup.selectAll('.katucharts-manhattan-sig')
      .data(sigPoints)
      .join('circle')
      .attr('class', 'katucharts-manhattan-sig')
      .attr('cx', d => {
        const i = allData.indexOf(d);
        return this.positions[i]?.cx ?? 0;
      })
      .attr('cy', d => {
        const i = allData.indexOf(d);
        return this.positions[i]?.cy ?? 0;
      })
      .attr('r', radius + 0.5)
      .attr('fill', d => {
        const chr = String(d.custom?.chr ?? d.custom?.chromosome ?? '');
        return d.color || chrColorMap.get(chr) || '#999';
      })
      .attr('opacity', 0)
      .style('cursor', 'pointer');

    this.attachManhattanEvents(sigCircles, sigPoints, allData, radius, hoverRadius);
  }

  private renderChromosomePoints(
    data: PointOptions[], chrColors: string[],
    radius: number, hoverRadius: number, animate: boolean
  ): void {
    const lineWidth = this.config.marker?.lineWidth ?? 0;
    const animOpts = typeof this.config.animation === 'object' ? this.config.animation : {};
    const entryDur = animOpts.duration ?? ENTRY_DURATION;
    const chrColorMap = this.buildChrColorMap(chrColors);

    const circles = this.group.selectAll('.katucharts-manhattan-point')
      .data(data)
      .join('circle')
      .attr('class', 'katucharts-manhattan-point')
      .attr('cx', (_, i) => this.positions[i].cx)
      .attr('cy', (_, i) => this.positions[i].cy)
      .attr('fill', d => d.color || chrColorMap.get(String(d.custom?.chr ?? d.custom?.chromosome ?? '')) || '#999')
      .attr('stroke-width', lineWidth)
      .attr('opacity', this.config.opacity ?? 0.75)
      .style('cursor', this.config.cursor || 'pointer');

    if (animate) {
      circles.attr('r', 0)
        .transition().duration(entryDur).ease(EASE_ENTRY)
        .attr('r', radius);
    } else {
      circles.attr('r', radius);
    }

    this.attachManhattanEvents(circles, data, data, radius, hoverRadius);
  }

  private renderChromosomeLabels(data: PointOptions[]): void {
    const { xAxis, plotArea } = this.context;
    const showLabels = this.config.showChromosomeLabels !== false;
    if (!showLabels) return;

    const sortedChrs = Array.from(this.chrGroups.keys())
      .sort((a, b) => this.getChrIndex(a) - this.getChrIndex(b));

    const parentGroup = this.context.plotGroup || this.group;
    const labelGroup = parentGroup.append('g').attr('class', 'katucharts-manhattan-chr-labels');

    for (const chr of sortedChrs) {
      const points = this.chrGroups.get(chr)!;
      if (points.length === 0) continue;

      let minX = Infinity, maxX = -Infinity;
      for (const p of points) {
        const x = p.x ?? 0;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
      const midX = (minX + maxX) / 2;
      const px = xAxis.getPixelForValue(midX);

      if (px >= 0 && px <= plotArea.width) {
        labelGroup.append('text')
          .attr('x', px)
          .attr('y', plotArea.height + 14)
          .attr('text-anchor', 'middle')
          .attr('font-size', DEFAULT_CHART_TEXT_SIZE)
          .attr('fill', DEFAULT_CHART_TEXT_COLOR)
          .text(chr);
      }
    }
  }

  private renderTopLabels(data: PointOptions[], sigLine: number, topN: number): void {
    const { xAxis, yAxis } = this.context;
    const negLog10Sig = -Math.log10(sigLine);

    const significant = data
      .filter(d => (d.y ?? 0) >= negLog10Sig)
      .sort((a, b) => (b.y ?? 0) - (a.y ?? 0))
      .slice(0, topN);

    const labelGroup = this.group.append('g').attr('class', 'katucharts-manhattan-labels');
    const placed: { x: number; y: number }[] = [];

    for (const d of significant) {
      const label = d.name || d.custom?.rsid || '';
      if (!label) continue;

      const px = xAxis.getPixelForValue(d.x ?? 0);
      const py = yAxis.getPixelForValue(d.y ?? 0) - 6;

      const tooClose = placed.some(p => Math.abs(p.x - px) < 40 && Math.abs(p.y - py) < 12);
      if (tooClose) continue;
      placed.push({ x: px, y: py });

      labelGroup.append('text')
        .attr('x', px)
        .attr('y', py)
        .attr('text-anchor', 'middle')
        .attr('font-size', DEFAULT_CHART_TEXT_SIZE)
        .attr('fill', DEFAULT_CHART_TEXT_COLOR)
        .text(label);
    }
  }

  private attachManhattanEvents(
    elements: any, eventData: PointOptions[], allData: PointOptions[],
    radius: number, hoverRadius: number
  ): void {
    if (this.config.enableMouseTracking === false) return;

    elements
      .on('mouseover', (event: MouseEvent, d: PointOptions) => {
        const target = event.currentTarget as SVGCircleElement;
        const i = allData.indexOf(d);
        select(target).interrupt('hover')
          .transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER)
          .attr('r', hoverRadius)
          .style('opacity', 1);
        target.style.filter = 'drop-shadow(0 1px 3px rgba(0,0,0,0.3))';

        this.context.events.emit('point:mouseover', {
          point: d, index: i, series: this, event,
          plotX: this.positions[i]?.cx ?? 0,
          plotY: this.positions[i]?.cy ?? 0,
        });
        d.events?.mouseOver?.call(d, event);
        this.config.point?.events?.mouseOver?.call(d, event);
      })
      .on('mouseout', (event: MouseEvent, d: PointOptions) => {
        const target = event.currentTarget as SVGCircleElement;
        const i = allData.indexOf(d);
        select(target).interrupt('hover')
          .transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER)
          .attr('r', radius)
          .style('opacity', this.config.opacity ?? 0.75);
        target.style.filter = '';

        this.context.events.emit('point:mouseout', { point: d, index: i, series: this, event });
        d.events?.mouseOut?.call(d, event);
        this.config.point?.events?.mouseOut?.call(d, event);
      })
      .on('click', (event: MouseEvent, d: PointOptions) => {
        const i = allData.indexOf(d);
        this.context.events.emit('point:click', { point: d, index: i, series: this, event });
        d.events?.click?.call(d, event);
        this.config.point?.events?.click?.call(d, event);
        this.config.events?.click?.call(this, event);
        this.handlePointSelect(select(event.currentTarget as Element), d, i, event);
      });
  }

  getDataExtents() {
    let xMin = Infinity, xMax = -Infinity;
    let yMin = 0, yMax = -Infinity;

    for (const d of this.data) {
      if (d.x !== undefined && d.x !== null) {
        if (d.x < xMin) xMin = d.x;
        if (d.x > xMax) xMax = d.x;
      }
      if (d.y !== undefined && d.y !== null) {
        if (d.y > yMax) yMax = d.y;
      }
    }

    const sigLine = this.config.significanceLine ?? 5e-8;
    const negLog10Sig = -Math.log10(sigLine);
    yMax = Math.max(yMax, negLog10Sig + 1);

    return { xMin, xMax, yMin, yMax };
  }
}

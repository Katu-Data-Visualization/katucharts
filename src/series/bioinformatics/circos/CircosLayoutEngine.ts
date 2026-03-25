/**
 * Shared circular coordinate system and ideogram rendering engine.
 * Used by all circos series variants. Handles chromosome arc computation,
 * angle↔position mapping, polar↔cartesian conversion, and ideogram rendering.
 */

import { arc as d3Arc } from 'd3-shape';
import { scaleLinear, scaleLog } from 'd3-scale';
import { color as d3Color } from 'd3-color';
import 'd3-transition';
import type {
  ChromosomeDef, ChromosomeArc, CircosLayoutConfig, IdeogramBand,
} from './CircosTypes';
import { DEFAULT_CHR_COLORS, BAND_COLORS } from './CircosTypes';

export class CircosLayoutEngine {
  chrArcs: ChromosomeArc[] = [];
  chrArcMap: Map<string, ChromosomeArc> = new Map();
  outerR = 0;
  innerR = 0;
  cx = 0;
  cy = 0;
  private chromosomes: ChromosomeDef[] = [];

  constructor(
    chromosomes: ChromosomeDef[],
    plotWidth: number,
    plotHeight: number,
    config: Partial<CircosLayoutConfig>,
  ) {
    this.chromosomes = chromosomes;
    const minDim = Math.min(plotWidth, plotHeight);
    this.outerR = parseRadius(config.outerRadius, minDim) ?? (minDim / 2 * 0.9);
    this.innerR = parseRadius(config.innerRadius, minDim) ?? (this.outerR * 0.7);
    this.cx = plotWidth / 2;
    this.cy = plotHeight / 2;

    this.computeChromosomeArcs(config.gap ?? 2);
  }

  private computeChromosomeArcs(defaultGap: number): void {
    const totalLength = this.chromosomes.reduce((s, c) => s + c.length, 0);
    let totalGapDeg = 0;
    for (const chr of this.chromosomes) {
      totalGapDeg += chr.gap ?? defaultGap;
    }
    const totalGapRad = totalGapDeg * (Math.PI / 180);
    const availableAngle = 2 * Math.PI - totalGapRad;

    this.chrArcs = [];
    this.chrArcMap = new Map();
    let currentAngle = 0;

    for (let i = 0; i < this.chromosomes.length; i++) {
      const chr = this.chromosomes[i];
      const arcAngle = (chr.length / totalLength) * availableAngle;
      const a: ChromosomeArc = {
        id: chr.id,
        startAngle: currentAngle,
        endAngle: currentAngle + arcAngle,
        length: chr.length,
        color: chr.color || DEFAULT_CHR_COLORS[i % DEFAULT_CHR_COLORS.length],
      };
      this.chrArcs.push(a);
      this.chrArcMap.set(chr.id, a);
      const gapRad = (chr.gap ?? defaultGap) * (Math.PI / 180);
      currentAngle += arcAngle + gapRad;
    }
  }

  getAngleForPosition(chr: string, pos: number): number {
    const arc = this.chrArcMap.get(chr);
    if (!arc) return 0;
    const frac = Math.min(Math.max(pos / arc.length, 0), 1);
    return arc.startAngle + frac * (arc.endAngle - arc.startAngle);
  }

  getAngleRange(chr: string, start: number, end: number): { startAngle: number; endAngle: number } {
    return {
      startAngle: this.getAngleForPosition(chr, start),
      endAngle: this.getAngleForPosition(chr, end),
    };
  }

  polarToCartesian(angle: number, r: number): { x: number; y: number } {
    const a = angle - Math.PI / 2;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  }

  createRadialScale(
    values: number[],
    innerR: number,
    outerR: number,
    useLog = false,
  ): (v: number) => number {
    const { min, max } = safeMinMax(values);
    if (useLog && min > 0) {
      return scaleLog().domain([Math.max(min, 1e-10), max || 1]).range([innerR, outerR]).clamp(true) as any;
    }
    return scaleLinear().domain([min, max || 1]).range([innerR, outerR]) as any;
  }

  renderIdeogram(
    group: any,
    innerR: number,
    outerR: number,
    animate: boolean,
    duration: number,
    events?: any,
    seriesRef?: any,
  ): void {
    const arcGen = d3Arc<ChromosomeArc>()
      .innerRadius(innerR)
      .outerRadius(outerR)
      .startAngle(d => d.startAngle)
      .endAngle(d => d.endAngle);

    const arcs = group.selectAll('.katucharts-circos-chr')
      .data(this.chrArcs)
      .join('path')
      .attr('class', 'katucharts-circos-chr')
      .attr('d', arcGen as any)
      .attr('fill', (d: ChromosomeArc) => d.color)
      .attr('stroke', '#fff')
      .attr('stroke-width', 0.5)
      .style('cursor', 'pointer');

    if (animate) {
      arcs.attr('opacity', 0)
        .transition().duration(duration * 0.5)
        .attr('opacity', 1);
    }

    if (events && seriesRef) {
      arcs
        .on('mouseover', (event: MouseEvent, d: ChromosomeArc) => {
          (event.currentTarget as SVGElement).style.filter = 'brightness(1.1)';
          events.emit('point:mouseover', {
            point: { name: d.id, custom: { length: d.length } },
            index: this.chrArcs.indexOf(d), series: seriesRef, event,
            plotX: 0, plotY: 0,
          });
        })
        .on('mouseout', (event: MouseEvent, d: ChromosomeArc) => {
          (event.currentTarget as SVGElement).style.filter = '';
          events.emit('point:mouseout', {
            point: { name: d.id },
            index: this.chrArcs.indexOf(d), series: seriesRef, event,
          });
        });
    }
  }

  renderIdeogramBands(
    group: any,
    innerR: number,
    outerR: number,
    animate: boolean,
    duration: number,
  ): void {
    const allBands: (IdeogramBand & { _startAngle: number; _endAngle: number })[] = [];

    for (const chr of this.chromosomes) {
      if (!chr.bands) continue;
      for (const band of chr.bands) {
        const range = this.getAngleRange(band.chr || chr.id, band.start, band.end);
        allBands.push({ ...band, _startAngle: range.startAngle, _endAngle: range.endAngle });
      }
    }

    if (allBands.length === 0) return;

    const bandArc = d3Arc<any>()
      .innerRadius(innerR)
      .outerRadius(outerR)
      .startAngle(d => d._startAngle)
      .endAngle(d => d._endAngle);

    const bands = group.selectAll('.katucharts-circos-band')
      .data(allBands)
      .join('path')
      .attr('class', 'katucharts-circos-band')
      .attr('d', bandArc)
      .attr('fill', (d: any) => BAND_COLORS[d.type as keyof typeof BAND_COLORS] || '#ddd')
      .attr('stroke', 'none')
      .attr('opacity', 0.6);

    if (animate) {
      bands.attr('opacity', 0)
        .transition().duration(duration * 0.5)
        .attr('opacity', 0.6);
    }
  }

  renderChromosomeLabels(group: any, radius: number, fontSize = 9): void {
    group.selectAll('.katucharts-circos-label')
      .data(this.chrArcs)
      .join('text')
      .attr('class', 'katucharts-circos-label')
      .attr('transform', (d: ChromosomeArc) => {
        const midAngle = (d.startAngle + d.endAngle) / 2;
        const angleDeg = midAngle * 180 / Math.PI - 90;
        const pos = this.polarToCartesian(midAngle, radius);
        const flip = angleDeg > 90 && angleDeg < 270;
        return `translate(${pos.x},${pos.y}) rotate(${flip ? angleDeg + 180 : angleDeg})`;
      })
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', `${fontSize}px`)
      .attr('fill', '#333')
      .text((d: ChromosomeArc) => d.id);
  }
}

export function parseRadius(val: any, minDim: number): number | undefined {
  if (val === undefined || val === null) return undefined;
  if (typeof val === 'number') return val;
  if (typeof val === 'string' && val.endsWith('%')) {
    return (parseFloat(val) / 100) * minDim / 2;
  }
  return parseFloat(val) || undefined;
}

export function safeMinMax(values: number[]): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

export function parseColor(c: string): [number, number, number, number] {
  const parsed = d3Color(c);
  if (parsed) {
    const rgb = parsed.rgb();
    return [Math.round(rgb.r), Math.round(rgb.g), Math.round(rgb.b), Math.round((rgb.opacity ?? 1) * 255)];
  }
  return [128, 128, 128, 255];
}

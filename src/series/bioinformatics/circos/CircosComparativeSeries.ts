/**
 * Multi-Species Synteny visualization.
 * Arranges chromosomes from multiple species on a single circle with
 * inter-species gaps larger than intra-species gaps, renders species label
 * arcs above each group, and draws variable-width synteny ribbons between
 * conserved regions across species.
 */

import { arc as d3Arc } from 'd3-shape';
import { scaleSequential } from 'd3-scale';
import { color as d3Color } from 'd3-color';
import 'd3-transition';
import { select } from 'd3-selection';
import { BaseSeries } from '../../BaseSeries';
import type { InternalSeriesConfig } from '../../../types/options';
import { CircosLayoutEngine, parseRadius, safeMinMax } from './CircosLayoutEngine';
import type { ChromosomeDef, ChromosomeArc, CircosColorScaleName } from './CircosTypes';
import { getColorInterpolator } from './CircosColorScales';
import { DEFAULT_CHART_TEXT_COLOR, DEFAULT_CHART_TEXT_SIZE } from '../../../utils/chartText';
import {
  ENTRY_CIRCOS_DURATION,
  HOVER_DURATION,
  EASE_ENTRY,
  EASE_HOVER,
} from '../../../core/animationConstants';

interface SpeciesDef {
  name: string;
  color: string;
  chromosomes: { id: string; length: number }[];
}

interface SyntenyRegion {
  species: string;
  chr: string;
  start: number;
  end: number;
}

interface SyntenyBlock {
  source: SyntenyRegion;
  target: SyntenyRegion;
  score?: number;
  color?: string;
}

interface ComparativeData {
  species: SpeciesDef[];
  synteny: SyntenyBlock[];
  colorScale?: CircosColorScaleName;
  showConservationTrack?: boolean;
  ribbonColorMode?: 'source' | 'score';
  curveFactor?: number;
  speciesGap?: number;
  chrGap?: number;
}

interface PrefixedBlock {
  sourceChrPrefixed: string;
  targetChrPrefixed: string;
  sourceStart: number;
  sourceEnd: number;
  targetStart: number;
  targetEnd: number;
  score: number;
  color?: string;
  sourceSpeciesColor: string;
}

export class CircosComparativeSeries extends BaseSeries {
  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  render(): void {
    const { plotArea } = this.context;
    const animate = !!this.context.animate;
    const compData = this.getComparativeData();
    if (!compData) return;

    const { species, synteny } = compData;
    const speciesGap = compData.speciesGap ?? 8;
    const chrGap = compData.chrGap ?? 2;
    const curveFactor = compData.curveFactor ?? 0.6;
    const ribbonColorMode = compData.ribbonColorMode ?? 'source';
    const showConservation = compData.showConservationTrack ?? false;

    const speciesColorMap = new Map<string, string>();
    for (const sp of species) {
      speciesColorMap.set(sp.name, sp.color);
    }

    const chromosomes = this.buildChromosomeList(species, speciesGap, chrGap);
    const prefixedBlocks = this.buildPrefixedBlocks(synteny, speciesColorMap);

    const minDim = Math.min(plotArea.width, plotArea.height);
    const radiusFactor = minDim < 400 ? 0.6 : minDim < 500 ? 0.72 : 0.82;
    const outerR = parseRadius(this.config.outerRadius, minDim) ?? (minDim / 2 * radiusFactor);
    const innerR = parseRadius(this.config.innerRadius, minDim) ?? (outerR * 0.7);

    const engine = new CircosLayoutEngine(chromosomes, plotArea.width, plotArea.height, {
      gap: chrGap,
      outerRadius: outerR,
      innerRadius: innerR,
    });

    const totalDur = ENTRY_CIRCOS_DURATION;

    // Staged timing: ideogram → species labels → conservation → ribbons
    const ideogramDur = Math.round(totalDur * 0.35);
    const speciesDelay = Math.round(ideogramDur * 0.5);
    const conservDelay = ideogramDur + 200;
    const ribbonDelay = ideogramDur + 400;
    const stageDur = Math.round(totalDur * 0.4);

    const mainGroup = this.group.append('g')
      .attr('class', 'katucharts-circos-comparative')
      .attr('transform', `translate(${engine.cx},${engine.cy})`);

    engine.renderIdeogram(
      mainGroup, engine.innerR, engine.outerR,
      animate, ideogramDur,
      this.context.events, this,
    );

    const labelGap = Math.max(6, minDim * 0.02);
    this.renderCleanLabels(mainGroup, engine, chromosomes, engine.outerR + labelGap, animate, ideogramDur, speciesDelay);

    this.renderSpeciesLabelArcs(mainGroup, engine, species, chromosomes, engine.outerR + labelGap * 2, minDim, speciesDelay, stageDur);

    if (showConservation && synteny.length > 0) {
      this.renderConservationTrack(
        mainGroup, engine, prefixedBlocks,
        engine.innerR * 0.9, engine.innerR * 0.96,
        compData.colorScale, animate, stageDur, conservDelay,
      );
    }

    const ribbonR = showConservation ? engine.innerR * 0.88 : engine.innerR * 0.95;
    this.renderSyntenyRibbons(
      mainGroup, engine, prefixedBlocks,
      ribbonR, curveFactor, ribbonColorMode,
      compData.colorScale, animate, stageDur, ribbonDelay,
    );

    if (animate) {
      const totalAnimDur = ribbonDelay + stageDur;
      this.emitAfterAnimate(totalAnimDur + 100);
    }
  }

  getDataExtents() {
    return { xMin: 0, xMax: 0, yMin: 0, yMax: 0 };
  }

  private getComparativeData(): ComparativeData | null {
    if (this.data.length > 0) {
      const first = this.data[0] as any;
      if (first.custom?.species) {
        return {
          species: first.custom.species,
          synteny: first.custom.synteny || [],
          colorScale: first.custom.colorScale,
          showConservationTrack: first.custom.showConservationTrack,
          ribbonColorMode: first.custom.ribbonColorMode,
          curveFactor: first.custom.curveFactor,
          speciesGap: first.custom.speciesGap,
          chrGap: first.custom.chrGap,
        };
      }
    }
    if (this.config.species) {
      return {
        species: this.config.species as SpeciesDef[],
        synteny: (this.config.synteny as SyntenyBlock[]) || [],
        colorScale: this.config.colorScale as CircosColorScaleName,
        showConservationTrack: this.config.showConservationTrack as boolean,
        ribbonColorMode: this.config.ribbonColorMode as 'source' | 'score',
        curveFactor: this.config.curveFactor as number,
        speciesGap: this.config.speciesGap as number,
        chrGap: this.config.chrGap as number,
      };
    }
    return null;
  }

  /**
   * Build a flat chromosome list with prefixed IDs and appropriate gaps.
   * Inter-species gaps use speciesGap; intra-species gaps use chrGap.
   */
  private buildChromosomeList(
    species: SpeciesDef[],
    speciesGap: number,
    chrGap: number,
  ): ChromosomeDef[] {
    const chromosomes: ChromosomeDef[] = [];

    for (let si = 0; si < species.length; si++) {
      const sp = species[si];
      const baseColor = d3Color(sp.color);

      for (let ci = 0; ci < sp.chromosomes.length; ci++) {
        const chr = sp.chromosomes[ci];
        const prefixedId = `${sp.name}_${chr.id}`;

        const lightnessShift = sp.chromosomes.length > 1
          ? (ci / (sp.chromosomes.length - 1)) * 0.4 - 0.2
          : 0;
        const chrColor = this.adjustColorBrightness(sp.color, lightnessShift);

        const isLastChrOfSpecies = ci === sp.chromosomes.length - 1;
        const isLastSpecies = si === species.length - 1;
        const gap = isLastChrOfSpecies && !isLastSpecies ? speciesGap : chrGap;

        chromosomes.push({
          id: prefixedId,
          length: chr.length,
          color: chrColor,
          gap,
        });
      }
    }

    return chromosomes;
  }

  private buildPrefixedBlocks(
    synteny: SyntenyBlock[],
    speciesColorMap: Map<string, string>,
  ): PrefixedBlock[] {
    return synteny.map(block => ({
      sourceChrPrefixed: `${block.source.species}_${block.source.chr}`,
      targetChrPrefixed: `${block.target.species}_${block.target.chr}`,
      sourceStart: block.source.start,
      sourceEnd: block.source.end,
      targetStart: block.target.start,
      targetEnd: block.target.end,
      score: block.score ?? 1,
      color: block.color,
      sourceSpeciesColor: speciesColorMap.get(block.source.species) || '#888',
    }));
  }

  /** Render chromosome labels using the clean ID (without species prefix). */
  private renderCleanLabels(
    group: any,
    engine: CircosLayoutEngine,
    chromosomes: ChromosomeDef[],
    radius: number,
    animate = false,
    duration = 400,
    delay = 0,
  ): void {
    const labels = group.selectAll('.katucharts-comp-label')
      .data(engine.chrArcs)
      .join('text')
      .attr('class', 'katucharts-comp-label')
      .attr('transform', (d: ChromosomeArc) => {
        const midAngle = (d.startAngle + d.endAngle) / 2;
        const angleDeg = midAngle * 180 / Math.PI - 90;
        const pos = engine.polarToCartesian(midAngle, radius);
        const flip = angleDeg > 90 && angleDeg < 270;
        return `translate(${pos.x},${pos.y}) rotate(${flip ? angleDeg + 180 : angleDeg})`;
      })
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', DEFAULT_CHART_TEXT_SIZE)
      .attr('fill', DEFAULT_CHART_TEXT_COLOR)
      .text((d: ChromosomeArc) => {
        const underscoreIdx = d.id.indexOf('_');
        return underscoreIdx >= 0 ? d.id.slice(underscoreIdx + 1) : d.id;
      });

    if (animate) {
      labels.attr('opacity', 0)
        .transition('enter').duration(Math.round(duration * 0.4)).delay(delay).ease(EASE_ENTRY)
        .attr('opacity', 1);
    }
  }

  /** Render curved label arcs above each species group. */
  private renderSpeciesLabelArcs(
    group: any,
    engine: CircosLayoutEngine,
    species: SpeciesDef[],
    chromosomes: ChromosomeDef[],
    labelRadius: number,
    minDim?: number,
    delay = 0,
    duration = 400,
  ): void {
    const md = minDim || 600;
    const animate = !!this.context.animate;

    let chrIdx = 0;
    const speciesArcs: {
      name: string;
      color: string;
      startAngle: number;
      endAngle: number;
    }[] = [];

    for (const sp of species) {
      const firstArc = engine.chrArcs[chrIdx];
      const lastArc = engine.chrArcs[chrIdx + sp.chromosomes.length - 1];
      if (firstArc && lastArc) {
        speciesArcs.push({
          name: sp.name,
          color: sp.color,
          startAngle: firstArc.startAngle,
          endAngle: lastArc.endAngle,
        });
      }
      chrIdx += sp.chromosomes.length;
    }

    const arcThickness = 3;
    const arcGen = d3Arc<any>()
      .innerRadius(labelRadius)
      .outerRadius(labelRadius + arcThickness)
      .startAngle(d => d.startAngle)
      .endAngle(d => d.endAngle);

    const arcs = group.selectAll('.katucharts-species-arc')
      .data(speciesArcs)
      .join('path')
      .attr('class', 'katucharts-species-arc')
      .attr('d', arcGen)
      .attr('fill', (d: any) => d.color)
      .attr('opacity', 0.7);

    const labels = group.selectAll('.katucharts-species-label')
      .data(speciesArcs)
      .join('text')
      .attr('class', 'katucharts-species-label')
      .attr('transform', (d: any) => {
        const midAngle = (d.startAngle + d.endAngle) / 2;
        const angleDeg = midAngle * 180 / Math.PI - 90;
        const textGap = Math.max(5, md * 0.015);
        const pos = engine.polarToCartesian(midAngle, labelRadius + arcThickness + textGap);
        const flip = angleDeg > 90 && angleDeg < 270;
        return `translate(${pos.x},${pos.y}) rotate(${flip ? angleDeg + 180 : angleDeg})`;
      })
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', md < 400 ? '9px' : '11px')
      .attr('font-weight', 'bold')
      .attr('fill', (d: any) => d.color)
      .text((d: any) => d.name);

    if (animate) {
      arcs.attr('opacity', 0)
        .transition('enter').duration(duration).delay(delay).ease(EASE_ENTRY)
        .attr('opacity', 0.7);
      labels.attr('opacity', 0)
        .transition('enter').duration(duration).delay(delay).ease(EASE_ENTRY)
        .attr('opacity', 1);
    }
  }

  /** Render synteny ribbons connecting conserved regions across species. */
  private renderSyntenyRibbons(
    group: any,
    engine: CircosLayoutEngine,
    blocks: PrefixedBlock[],
    ribbonR: number,
    curveFactor: number,
    colorMode: 'source' | 'score',
    colorScaleName?: CircosColorScaleName,
    animate?: boolean,
    duration?: number,
    delay?: number,
  ): void {
    const dur = duration ?? 400;
    const del = delay ?? 0;
    const ribbonOpacity = (this.config as any).ribbonOpacity ?? 0.4;

    let scoreColorScale: ((v: number) => string) | null = null;
    if (colorMode === 'score' && blocks.length > 0) {
      const scores = blocks.map(b => b.score);
      const { min: minScore, max: maxScore } = safeMinMax(scores);
      const interpolator = getColorInterpolator(colorScaleName || 'Viridis');
      scoreColorScale = scaleSequential(interpolator)
        .domain([minScore, maxScore]) as any;
    }

    const ribbons = group.selectAll('.katucharts-synteny-ribbon')
      .data(blocks)
      .join('path')
      .attr('class', 'katucharts-synteny-ribbon')
      .attr('d', (d: PrefixedBlock) => this.buildRibbonPath(engine, d, ribbonR, curveFactor))
      .attr('fill', (d: PrefixedBlock) => {
        if (d.color) return d.color;
        if (colorMode === 'score' && scoreColorScale) return scoreColorScale(d.score);
        return d.sourceSpeciesColor;
      })
      .attr('stroke', 'none')
      .attr('opacity', ribbonOpacity)
      .style('cursor', 'pointer');

    if (animate) {
      ribbons.attr('opacity', 0)
        .each(function(this: any, d: any, i: number) {
          select(this).transition('enter').duration(dur).delay(del + i * 8).ease(EASE_ENTRY)
            .attr('opacity', ribbonOpacity);
        });
    }

    if (this.context.events) {
      ribbons
        .on('mouseover', (event: MouseEvent, d: PrefixedBlock) => {
          select(event.currentTarget as SVGElement).interrupt('hover')
            .transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER)
            .attr('opacity', Math.min(ribbonOpacity + 0.3, 1));
          this.context.events.emit('point:mouseover', {
            point: { name: `${d.sourceChrPrefixed}→${d.targetChrPrefixed}`, custom: d },
            index: blocks.indexOf(d), series: this, event,
            plotX: 0, plotY: 0,
          });
        })
        .on('mouseout', (event: MouseEvent, d: PrefixedBlock) => {
          select(event.currentTarget as SVGElement).interrupt('hover')
            .transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER)
            .attr('opacity', ribbonOpacity);
          this.context.events.emit('point:mouseout', {
            point: { name: `${d.sourceChrPrefixed}→${d.targetChrPrefixed}` },
            index: blocks.indexOf(d), series: this, event,
          });
        });
    }
  }

  /**
   * Inner heatmap ring showing conservation scores at BOTH source and target
   * positions of each synteny block, matching real circos conservation tracks.
   */
  private renderConservationTrack(
    group: any,
    engine: CircosLayoutEngine,
    blocks: PrefixedBlock[],
    innerR: number,
    outerR: number,
    colorScaleName?: CircosColorScaleName,
    animate?: boolean,
    duration?: number,
    delay?: number,
  ): void {
    const dur = duration ?? 400;
    const del = delay ?? 0;
    const scores = blocks.map(b => b.score);
    const { min: minScore, max: maxScore } = safeMinMax(scores);
    const interpolator = getColorInterpolator(colorScaleName || 'Viridis');
    const colorScale = scaleSequential(interpolator).domain([minScore, maxScore]);

    const conservationData: { chr: string; start: number; end: number; score: number }[] = [];
    for (const b of blocks) {
      conservationData.push({ chr: b.sourceChrPrefixed, start: b.sourceStart, end: b.sourceEnd, score: b.score });
      conservationData.push({ chr: b.targetChrPrefixed, start: b.targetStart, end: b.targetEnd, score: b.score });
    }

    const arcGen = d3Arc<any>()
      .innerRadius(innerR)
      .outerRadius(outerR)
      .startAngle((d: any) => engine.getAngleForPosition(d.chr, d.start))
      .endAngle((d: any) => engine.getAngleForPosition(d.chr, d.end));

    const cells = group.selectAll('.katucharts-conservation')
      .data(conservationData)
      .join('path')
      .attr('class', 'katucharts-conservation')
      .attr('d', arcGen)
      .attr('fill', (d: any) => colorScale(d.score))
      .attr('stroke', 'none');

    if (animate) {
      cells.attr('opacity', 0)
        .transition('enter').duration(dur).delay(del).ease(EASE_ENTRY)
        .attr('opacity', 1);
    }
  }

  /** Build ribbon SVG path: source arc → bezier → target arc → bezier back. */
  private buildRibbonPath(
    engine: CircosLayoutEngine,
    d: PrefixedBlock,
    ribbonR: number,
    curveFactor: number,
  ): string {
    const r = ribbonR;
    const cf = 1 - curveFactor;

    const sa0 = engine.getAngleForPosition(d.sourceChrPrefixed, d.sourceStart) - Math.PI / 2;
    const sa1 = engine.getAngleForPosition(d.sourceChrPrefixed, d.sourceEnd) - Math.PI / 2;
    const ta0 = engine.getAngleForPosition(d.targetChrPrefixed, d.targetStart) - Math.PI / 2;
    const ta1 = engine.getAngleForPosition(d.targetChrPrefixed, d.targetEnd) - Math.PI / 2;

    const sx0 = r * Math.cos(sa0), sy0 = r * Math.sin(sa0);
    const sx1 = r * Math.cos(sa1), sy1 = r * Math.sin(sa1);
    const tx0 = r * Math.cos(ta0), ty0 = r * Math.sin(ta0);
    const tx1 = r * Math.cos(ta1), ty1 = r * Math.sin(ta1);

    const sla = Math.abs(sa1 - sa0) > Math.PI ? 1 : 0;
    const tla = Math.abs(ta1 - ta0) > Math.PI ? 1 : 0;

    return `M${sx0},${sy0}A${r},${r},0,${sla},1,${sx1},${sy1}`
      + `C${cf * sx1},${cf * sy1},${cf * tx0},${cf * ty0},${tx0},${ty0}`
      + `A${r},${r},0,${tla},1,${tx1},${ty1}`
      + `C${cf * tx1},${cf * ty1},${cf * sx0},${cf * sy0},${sx0},${sy0}Z`;
  }

  private adjustColorBrightness(baseColor: string, amount: number): string {
    const parsed = d3Color(baseColor);
    if (!parsed) return baseColor;
    const hsl = parsed as any;
    if (typeof hsl.h === 'number' && typeof hsl.s === 'number' && typeof hsl.l === 'number') {
      const l = Math.min(1, Math.max(0, hsl.l + amount));
      return `hsl(${hsl.h}, ${hsl.s * 100}%, ${l * 100}%)`;
    }
    const rgb = parsed.rgb();
    const shift = Math.round(255 * amount);
    const r = Math.min(255, Math.max(0, rgb.r + shift));
    const g = Math.min(255, Math.max(0, rgb.g + shift));
    const b = Math.min(255, Math.max(0, rgb.b + shift));
    return `rgb(${r},${g},${b})`;
  }
}

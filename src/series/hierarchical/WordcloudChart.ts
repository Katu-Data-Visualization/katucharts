/**
 * Wordcloud with Archimedean-spiral placement. Each word is scaled by weight
 * into a font-size range and placed without overlapping any previously-placed
 * word. Rotation angles cycle from a configurable list.
 */

import { BaseSeries } from '../BaseSeries';
import type { InternalSeriesConfig } from '../../types/options';
import { DEFAULT_CHART_TEXT_COLOR } from '../../utils/chartText';
import { ENTRY_DURATION, EASE_ENTRY } from '../../core/animationConstants';

interface WordDatum {
  name: string;
  weight: number;
  color?: string;
  [k: string]: any;
}

interface PlacedWord {
  x: number;
  y: number;
  width: number;
  height: number;
  word: WordDatum;
  rotation: number;
  fontSize: number;
}

export class WordcloudChart extends BaseSeries {
  constructor(config: InternalSeriesConfig) {
    super(config);
    config.clip = false;
  }

  render(): void {
    const { plotArea, colors } = this.context;
    const raw = (this.data as WordDatum[]) || [];
    if (!raw.length) return;

    const minFontSize = (this.config as any).minFontSize ?? 8;
    const maxFontSize = (this.config as any).maxFontSize ?? 50;
    const rotationCfg = (this.config as any).rotation || {};
    const rotations: number[] = Array.isArray(rotationCfg.orientations)
      ? rotationCfg.orientations
      : rotationCfg.from !== undefined && rotationCfg.to !== undefined
        ? [rotationCfg.from, rotationCfg.to]
        : [0];
    const fontFamily = (this.config.dataLabels?.style?.fontFamily as string) || 'sans-serif';
    const textColor = this.config.dataLabels?.color
      || (this.config.dataLabels?.style?.color as string)
      || DEFAULT_CHART_TEXT_COLOR;

    const sorted = [...raw]
      .filter(w => w && w.name && typeof w.weight === 'number' && w.weight > 0)
      .sort((a, b) => b.weight - a.weight);

    if (!sorted.length) return;

    const minWeight = sorted[sorted.length - 1].weight;
    const maxWeight = sorted[0].weight;
    const fontFor = (w: number): number => {
      if (maxWeight === minWeight) return (minFontSize + maxFontSize) / 2;
      const t = (w - minWeight) / (maxWeight - minWeight);
      return minFontSize + t * (maxFontSize - minFontSize);
    };

    const cx = plotArea.width / 2;
    const cy = plotArea.height / 2;
    const placed: PlacedWord[] = [];

    const rootGroup = this.group.append('g').attr('class', 'katucharts-wordcloud');
    const { measure: measureText, dispose: disposeMeasurer } =
      this.createMeasurer(rootGroup.node() as SVGGElement, fontFamily);

    try {
      sorted.forEach((word, i) => {
        const fontSize = fontFor(word.weight);
        const rotation = rotations[i % rotations.length] ?? 0;
        const metrics = measureText(word.name, fontSize);
        const w = metrics.width;
        const h = metrics.height;

        const place = this.findSpiralSpot(cx, cy, w, h, rotation, placed, plotArea.width, plotArea.height);
        if (!place) return;
        placed.push({ x: place.x, y: place.y, width: w, height: h, word, rotation, fontSize });
      });
    } finally {
      disposeMeasurer();
    }

    placed.forEach((p, i) => {
      const color = p.word.color || colors[i % Math.max(1, colors.length)] || textColor;
      rootGroup.append('text')
        .attr('x', p.x)
        .attr('y', p.y)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('transform', p.rotation ? `rotate(${p.rotation},${p.x},${p.y})` : null)
        .attr('font-size', p.fontSize)
        .attr('font-family', fontFamily)
        .attr('fill', color)
        .style('pointer-events', 'none')
        .text(p.word.name);
    });

    if (this.context.animate) {
      rootGroup.attr('opacity', 0)
        .transition()
        .duration(ENTRY_DURATION)
        .ease(EASE_ENTRY)
        .attr('opacity', 1);
    }
  }

  private createMeasurer(parentNode: SVGGElement, fontFamily: string): {
    measure: (text: string, fontSize: number) => { width: number; height: number };
    dispose: () => void;
  } {
    const owner = parentNode.ownerSVGElement || (parentNode as unknown as SVGSVGElement);
    const ns = 'http://www.w3.org/2000/svg';
    const probe = document.createElementNS(ns, 'text');
    probe.setAttribute('visibility', 'hidden');
    probe.setAttribute('font-family', fontFamily);
    owner.appendChild(probe);

    const measure = (text: string, fontSize: number): { width: number; height: number } => {
      probe.setAttribute('font-size', String(fontSize));
      probe.textContent = text;
      try {
        const bb = probe.getBBox();
        return { width: bb.width, height: bb.height || fontSize };
      } catch {
        return { width: text.length * fontSize * 0.55, height: fontSize };
      }
    };

    return { measure, dispose: () => probe.remove() };
  }

  private findSpiralSpot(
    cx: number, cy: number, w: number, h: number, rotation: number,
    placed: PlacedWord[], maxW: number, maxH: number,
  ): { x: number; y: number } | null {
    const rotated = rotation % 180 !== 0;
    const bw = rotated ? h : w;
    const bh = rotated ? w : h;
    const step = 0.2;
    const maxT = 4 * Math.PI * 6;

    for (let t = 0; t < maxT; t += step) {
      const r = 4 * t;
      const x = cx + r * Math.cos(t);
      const y = cy + r * Math.sin(t);
      if (x - bw / 2 < 0 || x + bw / 2 > maxW) continue;
      if (y - bh / 2 < 0 || y + bh / 2 > maxH) continue;
      const collides = placed.some(p => {
        const pw = p.rotation % 180 !== 0 ? p.height : p.width;
        const ph = p.rotation % 180 !== 0 ? p.width : p.height;
        return Math.abs(x - p.x) < (bw + pw) / 2 + 2
          && Math.abs(y - p.y) < (bh + ph) / 2 + 2;
      });
      if (!collides) return { x, y };
    }
    return null;
  }

  getDataExtents() {
    return { xMin: Infinity, xMax: -Infinity, yMin: Infinity, yMax: -Infinity };
  }
}

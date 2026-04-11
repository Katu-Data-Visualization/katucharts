/**
 * Sequence logo for visualizing conserved sequence motifs.
 * Stacked letters proportional to information content at each position.
 * Supports DNA, RNA, and protein alphabets with configurable color schemes.
 */

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

const DNA_COLORS: Record<string, string> = {
  A: '#2ecc71', T: '#e74c3c', G: '#f39c12', C: '#3498db',
};

const RNA_COLORS: Record<string, string> = {
  A: '#2ecc71', U: '#e74c3c', G: '#f39c12', C: '#3498db',
};

const PROTEIN_COLORS: Record<string, string> = {
  A: '#ccff00', R: '#0000ff', N: '#cc00ff', D: '#ff0000',
  C: '#ffff00', E: '#ff0066', Q: '#ff00cc', G: '#ff9900',
  H: '#0066ff', I: '#66ff00', L: '#33ff00', K: '#6600ff',
  M: '#00ff00', F: '#00ff66', P: '#ffcc00', S: '#ff3300',
  T: '#ff6600', W: '#00ccff', Y: '#00ffcc', V: '#99ff00',
};

export class SequenceLogoSeries extends BaseSeries {
  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  render(): void {
    const { xAxis, yAxis, plotArea } = this.context;
    const animate = this.context.animate;
    const data = this.data;

    const alphabetType = this.config.alphabetType ?? 'DNA';
    const colorScheme = this.config.colorScheme ?? this.getDefaultColors(alphabetType);
    const letterFont = this.config.letterFont ?? 'bold Arial, Helvetica, sans-serif';

    const animOpts = typeof this.config.animation === 'object' ? this.config.animation : {};
    const entryDur = animOpts.duration ?? ENTRY_DURATION;

    for (let i = 0; i < data.length; i++) {
      const d = data[i] as any;
      const letters: { letter: string; height: number; color?: string }[] =
        d.custom?.letters || d.letters || [];
      if (letters.length === 0) continue;

      const posX = d.x ?? i;
      const sorted = [...letters].sort((a, b) => a.height - b.height);

      const px = xAxis.getPixelForValue(posX);
      const colWidth = this.getColumnWidth(data.length);

      let currentBase = 0;

      const g = this.group.append('g')
        .attr('class', 'katucharts-seqlogo-position')
        .style('cursor', this.config.cursor || 'default');

      for (const entry of sorted) {
        if (entry.height <= 0) continue;

        const bottomY = yAxis.getPixelForValue(currentBase);
        const topY = yAxis.getPixelForValue(currentBase + entry.height);
        const letterHeight = Math.abs(bottomY - topY);
        const letterColor = entry.color || colorScheme[entry.letter] || '#999';

        if (letterHeight < 1) {
          currentBase += entry.height;
          continue;
        }

        const letterEl = g.append('text')
          .attr('x', px)
          .attr('y', topY)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'hanging')
          .attr('font-family', letterFont)
          .attr('font-size', '1px')
          .attr('fill', letterColor)
          .text(entry.letter);

        const node = letterEl.node() as SVGTextElement;
        if (node) {
          const bbox = node.getBBox();
          if (bbox.width > 0 && bbox.height > 0) {
            const scaleX = colWidth / bbox.width;
            const scaleY = letterHeight / bbox.height;

            letterEl
              .attr('transform',
                `translate(${px}, ${topY}) scale(${scaleX}, ${scaleY}) translate(${-px}, ${-topY})`
              );
          }
        }

        if (animate) {
          letterEl.attr('opacity', 0)
            .transition().duration(entryDur).ease(EASE_ENTRY)
            .delay(staggerDelay(i, 0, ENTRY_STAGGER_PER_ITEM, data.length))
            .attr('opacity', 1);
        }

        currentBase += entry.height;
      }

      this.attachPositionEvents(g, d, i, px, yAxis.getPixelForValue(currentBase / 2));
    }

    if (animate) {
      this.emitAfterAnimate(entryDur + data.length * ENTRY_STAGGER_PER_ITEM);
    }
  }

  private getDefaultColors(alphabetType: string): Record<string, string> {
    switch (alphabetType.toUpperCase()) {
      case 'RNA': return RNA_COLORS;
      case 'PROTEIN': return PROTEIN_COLORS;
      default: return DNA_COLORS;
    }
  }

  private getColumnWidth(positionCount: number): number {
    const { plotArea } = this.context;
    const configWidth = this.config.positionWidth;
    if (configWidth && configWidth !== 'auto') return Number(configWidth);
    return (plotArea.width / Math.max(positionCount, 1)) * 0.85;
  }

  private attachPositionEvents(g: any, d: any, i: number, px: number, py: number): void {
    if (this.config.enableMouseTracking === false) return;

    g.on('mouseover', (event: MouseEvent) => {
      g.style('filter', 'drop-shadow(0 1px 2px rgba(0,0,0,0.2))');
      g.interrupt('hover')
        .transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER)
        .attr('opacity', 1);
      this.context.events.emit('point:mouseover', {
        point: d, index: i, series: this, event,
        plotX: px, plotY: py,
      });
      d.events?.mouseOver?.call(d, event);
      this.config.point?.events?.mouseOver?.call(d, event);
    })
    .on('mouseout', (event: MouseEvent) => {
      g.style('filter', '');
      g.interrupt('hover')
        .transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER)
        .attr('opacity', 1);
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
    let yMax = 0;

    const maxBits = this.config.maxBits ??
      ((this.config.alphabetType ?? 'DNA').toUpperCase() === 'PROTEIN' ? Math.log2(20) : 2);

    for (let i = 0; i < this.data.length; i++) {
      const d = this.data[i] as any;
      const x = d.x ?? i;
      xMin = Math.min(xMin, x);
      xMax = Math.max(xMax, x);

      const letters: { height: number }[] = d.custom?.letters || d.letters || [];
      const total = letters.reduce((s, l) => s + l.height, 0);
      yMax = Math.max(yMax, total);
    }

    yMax = Math.max(yMax, maxBits);

    return { xMin: xMin - 0.5, xMax: xMax + 0.5, yMin: 0, yMax };
  }
}

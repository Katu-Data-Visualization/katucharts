/**
 * Chord Flow Diagram: proportional arc segments on an outer ring connected
 * by filled bezier ribbons that encode flow magnitude between groups.
 * Supports segment/flow lists, matrix input, and three color modes
 * (source, target, gradient).
 */

import { chord as d3Chord } from 'd3-chord';
import { arc as d3Arc } from 'd3-shape';
import { interpolate } from 'd3-interpolate';
import { select } from 'd3-selection';
import 'd3-transition';
import { BaseSeries } from '../../BaseSeries';
import type { InternalSeriesConfig } from '../../../types/options';
import {
  ENTRY_DURATION,
  HOVER_DURATION,
  EASE_ENTRY,
  EASE_HOVER,
} from '../../../core/animationConstants';

interface ChordSegment {
  id: string;
  value: number;
  color?: string;
}

interface ChordFlow {
  source: string;
  target: string;
  value: number;
}

type LinkColorMode = 'from' | 'to' | 'gradient';

export class CircosChordSeries extends BaseSeries {
  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  render(): void {
    const { plotArea, colors } = this.context;
    const animate = this.context.animate;
    const cfg = this.config as any;

    const centerCfg = cfg.center || ['50%', '50%'];
    const cx = this.resolvePercent(centerCfg[0], plotArea.width);
    const cy = this.resolvePercent(centerCfg[1], plotArea.height);

    const sizePct = cfg.size;
    const maxDim = sizePct
      ? this.resolvePercent(sizePct, Math.min(plotArea.width, plotArea.height))
      : Math.min(plotArea.width, plotArea.height);
    const labelMargin = Math.max(15, maxDim * 0.05);
    const nodeWidth = cfg.nodeWidth ?? Math.max(10, Math.min(18, maxDim * 0.03));
    const outerRadius = maxDim / 2 - labelMargin;
    const innerRadius = outerRadius - nodeWidth;

    const gapDeg = cfg.gap ?? 2;
    const curveFactor: number = cfg.curveFactor ?? 0.6;
    const cf = 1 - curveFactor;
    const linkOpacity: number = cfg.linkOpacity ?? 0.5;
    const linkColorMode: LinkColorMode = cfg.linkColorMode ?? 'from';
    const borderColor: string = cfg.borderColor ?? '#ffffff';
    const borderWidth: number = cfg.borderWidth ?? 1;

    const { matrix, names, segmentColors } = this.buildMatrix();
    if (names.length === 0) return;

    const padAngle = (gapDeg * Math.PI) / 180;
    const chordGen = d3Chord().padAngle(padAngle).sortSubgroups(null as any);
    const chords = chordGen(matrix);

    const arcGen = d3Arc<any>()
      .innerRadius(innerRadius)
      .outerRadius(outerRadius)
      .cornerRadius(2);

    const arcHover = d3Arc<any>()
      .innerRadius(innerRadius)
      .outerRadius(outerRadius + 5)
      .cornerRadius(2);

    const ribbonPath = (d: any): string => {
      const r = innerRadius;
      const sa0 = d.source.startAngle - Math.PI / 2;
      const sa1 = d.source.endAngle - Math.PI / 2;
      const ta0 = d.target.startAngle - Math.PI / 2;
      const ta1 = d.target.endAngle - Math.PI / 2;
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
    };

    const g = this.group.append('g')
      .attr('transform', `translate(${cx},${cy})`);

    const getSegmentColor = (idx: number): string =>
      segmentColors[idx] || colors[idx % colors.length];

    const animOpts = typeof this.config.animation === 'object' ? this.config.animation : {};
    const entryDur = animOpts.duration ?? ENTRY_DURATION;

    const arcsData = chords.groups.map((grp: any) => ({ ...grp }));

    const arcs = g.selectAll('.katucharts-chord-segment')
      .data(arcsData)
      .join('path')
      .attr('class', 'katucharts-chord-segment')
      .attr('fill', (d: any) => getSegmentColor(d.index))
      .attr('stroke', borderColor)
      .attr('stroke-width', borderWidth)
      .style('cursor', 'pointer');

    if (animate) {
      arcs.each(function(d: any) {
        const self = select(this);
        const startArc = { startAngle: d.startAngle, endAngle: d.startAngle };
        const interp = interpolate(startArc, d);
        self.transition().duration(entryDur).ease(EASE_ENTRY)
          .attrTween('d', () => (t: number) => arcGen(interp(t))!);
      });
    } else {
      arcs.attr('d', arcGen as any);
    }

    let ribbonGradientDefs: any = null;
    if (linkColorMode === 'gradient') {
      ribbonGradientDefs = g.append('defs');
    }

    const ribbons = g.selectAll('.katucharts-chord-ribbon')
      .data(chords)
      .join('path')
      .attr('class', 'katucharts-chord-ribbon')
      .attr('d', (d: any) => ribbonPath(d))
      .attr('stroke', 'none')
      .style('cursor', 'pointer');

    if (linkColorMode === 'gradient' && ribbonGradientDefs) {
      ribbons.each(function(d: any, i: number) {
        const gradId = `katucharts-cchord-grad-${i}-${Math.random().toString(36).slice(2, 6)}`;
        const sa = (d.source.startAngle + d.source.endAngle) / 2 - Math.PI / 2;
        const ta = (d.target.startAngle + d.target.endAngle) / 2 - Math.PI / 2;
        ribbonGradientDefs.append('linearGradient')
          .attr('id', gradId)
          .attr('gradientUnits', 'userSpaceOnUse')
          .attr('x1', innerRadius * Math.cos(sa)).attr('y1', innerRadius * Math.sin(sa))
          .attr('x2', innerRadius * Math.cos(ta)).attr('y2', innerRadius * Math.sin(ta))
          .selectAll('stop')
          .data([
            { offset: '0%', color: getSegmentColor(d.source.index) },
            { offset: '100%', color: getSegmentColor(d.target.index) },
          ])
          .join('stop')
          .attr('offset', (s: any) => s.offset)
          .attr('stop-color', (s: any) => s.color);
        select(this).attr('fill', `url(#${gradId})`);
      });
    } else if (linkColorMode === 'to') {
      ribbons.attr('fill', (d: any) => getSegmentColor(d.target.index));
    } else {
      ribbons.attr('fill', (d: any) => getSegmentColor(d.source.index));
    }

    if (animate) {
      ribbons.attr('fill-opacity', 0)
        .transition().duration(entryDur).ease(EASE_ENTRY)
        .attr('fill-opacity', linkOpacity);
    } else {
      ribbons.attr('fill-opacity', linkOpacity);
    }

    ribbons
      .on('mouseover', (event: MouseEvent, d: any) => {
        ribbons.interrupt('highlight');
        arcs.interrupt('highlight');
        ribbons.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER)
          .attr('fill-opacity', (o: any) => o === d ? Math.min(linkOpacity + 0.35, 1) : 0.05);
        arcs.attr('opacity', 1);
        arcs.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER)
          .attr('opacity', (a: any) =>
            a.index === d.source.index || a.index === d.target.index ? 1 : 0.3
          );
        this.context.events.emit('point:mouseover', {
          point: { from: names[d.source.index], to: names[d.target.index], y: d.source.value },
          index: chords.indexOf(d), series: this, event,
          plotX: cx, plotY: cy,
        });
      })
      .on('mouseout', (event: MouseEvent, d: any) => {
        ribbons.interrupt('highlight');
        arcs.interrupt('highlight');
        ribbons.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER).attr('fill-opacity', linkOpacity);
        arcs.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER).attr('opacity', 1);
        this.context.events.emit('point:mouseout', {
          point: { from: names[d.source.index], to: names[d.target.index], y: d.source.value },
          index: chords.indexOf(d), series: this, event,
        });
      })
      .on('click', (event: MouseEvent, d: any) => {
        this.context.events.emit('point:click', {
          point: { from: names[d.source.index], to: names[d.target.index], y: d.source.value },
          index: chords.indexOf(d), series: this, event,
        });
      });

    arcs
      .on('mouseover', (event: MouseEvent, d: any) => {
        const target = select(event.currentTarget as SVGPathElement);
        target.transition('arc').duration(HOVER_DURATION).ease(EASE_HOVER).attr('d', arcHover(d)!);
        ribbons.interrupt('highlight');
        arcs.interrupt('highlight');
        ribbons.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER)
          .attr('fill-opacity', (r: any) =>
            r.source.index === d.index || r.target.index === d.index
              ? Math.min(linkOpacity + 0.35, 1) : 0.05
          );
        arcs.filter((o: any) => o !== d)
          .transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER)
          .attr('opacity', (a: any) => {
            const connected = chords.some((r: any) =>
              (r.source.index === d.index && r.target.index === a.index) ||
              (r.target.index === d.index && r.source.index === a.index)
            );
            return connected ? 1 : 0.3;
          });
        this.context.events.emit('point:mouseover', {
          point: { name: names[d.index], y: d.value },
          index: d.index, series: this, event,
          plotX: cx, plotY: cy,
        });
      })
      .on('mouseout', (event: MouseEvent, d: any) => {
        const target = select(event.currentTarget as SVGPathElement);
        target.transition('arc').duration(HOVER_DURATION).ease(EASE_HOVER).attr('d', arcGen(d)!);
        ribbons.interrupt('highlight');
        arcs.interrupt('highlight');
        ribbons.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER).attr('fill-opacity', linkOpacity);
        arcs.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER).attr('opacity', 1);
        this.context.events.emit('point:mouseout', {
          point: { name: names[d.index], y: d.value },
          index: d.index, series: this, event,
        });
      })
      .on('click', (event: MouseEvent, d: any) => {
        this.context.events.emit('point:click', {
          point: { name: names[d.index], y: d.value },
          index: d.index, series: this, event,
        });
      });

    this.renderLabels(g, arcsData, names, innerRadius, outerRadius);

    if (animate) {
      this.emitAfterAnimate(entryDur + 100);
    }
  }

  /**
   * Build NxN adjacency matrix from segment/flow lists or raw matrix input.
   */
  private buildMatrix(): { matrix: number[][]; names: string[]; segmentColors: (string | undefined)[] } {
    const cfg = this.config as any;

    if (cfg.matrix && cfg.names) {
      const matrix: number[][] = cfg.matrix;
      const names: string[] = cfg.names;
      const segmentColors = names.map((_: string, i: number) =>
        cfg.segments?.[i]?.color as string | undefined
      );
      return { matrix, names, segmentColors };
    }

    const segments: ChordSegment[] =
      cfg.segments || this.data[0]?.custom?.segments || [];
    const flows: ChordFlow[] =
      cfg.flows || this.data[0]?.custom?.flows || [];

    if (segments.length === 0) return { matrix: [], names: [], segmentColors: [] };

    const names = segments.map(s => s.id);
    const nameIndex = new Map(names.map((n, i) => [n, i]));
    const n = names.length;
    const matrix = Array.from({ length: n }, () => new Array(n).fill(0));

    for (const flow of flows) {
      const si = nameIndex.get(flow.source);
      const ti = nameIndex.get(flow.target);
      if (si !== undefined && ti !== undefined) {
        matrix[si][ti] += flow.value;
      }
    }

    const segmentColors = segments.map(s => s.color);
    return { matrix, names, segmentColors };
  }

  private renderLabels(
    g: any,
    arcsData: any[],
    names: string[],
    innerRadius: number,
    outerRadius: number,
  ): void {
    const uid = `cchord-${Math.random().toString(36).slice(2, 8)}`;
    const labelR = (innerRadius + outerRadius) / 2;
    const defs = g.append('defs');

    arcsData.forEach((d: any) => {
      const mid = (d.startAngle + d.endAngle) / 2;
      const flip = mid > Math.PI;
      const a0 = (flip ? d.endAngle : d.startAngle) - Math.PI / 2;
      const a1 = (flip ? d.startAngle : d.endAngle) - Math.PI / 2;
      const la = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
      defs.append('path').attr('id', `${uid}-${d.index}`)
        .attr('d', `M${labelR * Math.cos(a0)},${labelR * Math.sin(a0)}`
          + `A${labelR},${labelR},0,${la},${flip ? 0 : 1},`
          + `${labelR * Math.cos(a1)},${labelR * Math.sin(a1)}`);
    });

    g.selectAll('.katucharts-chord-label')
      .data(arcsData)
      .join('text')
      .attr('class', 'katucharts-chord-label')
      .attr('text-anchor', 'middle')
      .attr('font-size', '11px')
      .attr('font-weight', 'bold')
      .attr('fill', '#333')
      .style('pointer-events', 'none')
      .style('paint-order', 'stroke')
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .attr('stroke-linejoin', 'round')
      .each(function(this: SVGTextElement, d: any) {
        select(this).append('textPath')
          .attr('href', `#${uid}-${d.index}`)
          .attr('startOffset', '50%')
          .text(names[d.index] || '');
      });
  }

  private resolvePercent(val: string | number, total: number): number {
    if (typeof val === 'string' && val.endsWith('%')) {
      return (parseFloat(val) / 100) * total;
    }
    return typeof val === 'number' ? val : parseFloat(val) || total / 2;
  }

  getDataExtents() {
    return { xMin: 0, xMax: 0, yMin: 0, yMax: 0 };
  }
}

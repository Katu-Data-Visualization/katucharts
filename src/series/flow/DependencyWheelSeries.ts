import { chord } from 'd3-chord';
import { arc as d3Arc } from 'd3-shape';
import { interpolate } from 'd3-interpolate';
import { select } from 'd3-selection';
import 'd3-transition';
import { BaseSeries } from '../BaseSeries';
import type { InternalSeriesConfig, SankeyNodeOptions } from '../../types/options';

export class DependencyWheelSeries extends BaseSeries {
  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  render(): void {
    const { plotArea, colors } = this.context;
    const animate = this.context.animate;
    const cfg = this.config as any;
    const nodeWidth = cfg.nodeWidth ?? 20;
    const linkOpacity = cfg.linkOpacity ?? 0.5;
    const minLinkWidth = cfg.minLinkWidth ?? 0;
    const startAngle = (cfg.startAngle ?? 0) * (Math.PI / 180);

    const centerCfg = cfg.center || ['50%', '50%'];
    const cxo = this.resolvePercent(centerCfg[0], plotArea.width);
    const cyo = this.resolvePercent(centerCfg[1], plotArea.height);

    const sizePct = cfg.size;
    const maxDim = sizePct
      ? this.resolvePercent(sizePct, Math.min(plotArea.width, plotArea.height))
      : Math.min(plotArea.width, plotArea.height);
    const outerRadius = maxDim / 2 - 30;
    const innerRadius = outerRadius - nodeWidth;

    const { matrix, names, nodeColors } = this.buildMatrix();
    if (names.length === 0) return;

    const nodePadding = cfg.nodePadding ?? 10;
    const padAngle = nodePadding / (outerRadius > 0 ? outerRadius : 1);
    const chordGen = chord().padAngle(padAngle).sortSubgroups(null as any);
    const chords = chordGen(matrix);

    const arcGen = d3Arc<any>()
      .innerRadius(innerRadius)
      .outerRadius(outerRadius)
      .cornerRadius(3);

    const arcHover = d3Arc<any>()
      .innerRadius(innerRadius)
      .outerRadius(outerRadius + 4)
      .cornerRadius(3);

    const curveFactor = cfg.curveFactor ?? 0.6;
    const cf = 1 - curveFactor;
    const ribbonPath = (d: any): string => {
      const r = innerRadius;
      const sa0 = d.source.startAngle + startAngle - Math.PI / 2;
      const sa1 = d.source.endAngle + startAngle - Math.PI / 2;
      const ta0 = d.target.startAngle + startAngle - Math.PI / 2;
      const ta1 = d.target.endAngle + startAngle - Math.PI / 2;
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
      .attr('transform', `translate(${cxo},${cyo})`);

    const getNodeColor = (idx: number): string => nodeColors[idx] || colors[idx % colors.length];

    const dwLinkColorMode = cfg.linkColorMode ?? 'from';

    let ribbonGradientDefs: any = null;
    if (dwLinkColorMode === 'gradient') {
      ribbonGradientDefs = g.append('defs');
    }

    const ribbons = g.selectAll('.katucharts-chord')
      .data(chords)
      .join('path')
      .attr('class', 'katucharts-chord')
      .attr('d', (d: any) => ribbonPath(d))
      .attr('stroke', 'none')
      .style('cursor', 'pointer');

    if (dwLinkColorMode === 'gradient' && ribbonGradientDefs) {
      ribbons.each(function(d: any, i: number) {
        const gradId = `katucharts-dw-grad-${i}-${Math.random().toString(36).slice(2, 6)}`;
        const sa = (d.source.startAngle + d.source.endAngle) / 2 + startAngle - Math.PI / 2;
        const ta = (d.target.startAngle + d.target.endAngle) / 2 + startAngle - Math.PI / 2;
        ribbonGradientDefs.append('linearGradient')
          .attr('id', gradId)
          .attr('gradientUnits', 'userSpaceOnUse')
          .attr('x1', innerRadius * Math.cos(sa)).attr('y1', innerRadius * Math.sin(sa))
          .attr('x2', innerRadius * Math.cos(ta)).attr('y2', innerRadius * Math.sin(ta))
          .selectAll('stop')
          .data([
            { offset: '0%', color: getNodeColor(d.source.index) },
            { offset: '100%', color: getNodeColor(d.target.index) },
          ])
          .join('stop')
          .attr('offset', (s: any) => s.offset)
          .attr('stop-color', (s: any) => s.color);
        select(this).attr('fill', `url(#${gradId})`);
      });
    } else if (dwLinkColorMode === 'to') {
      ribbons.attr('fill', (d: any) => getNodeColor(d.target.index));
    } else {
      ribbons.attr('fill', (d: any) => getNodeColor(d.source.index));
    }

    if (animate) {
      ribbons.attr('fill-opacity', 0)
        .transition().duration(600).delay(400)
        .attr('fill-opacity', linkOpacity);
    } else {
      ribbons.attr('fill-opacity', linkOpacity);
    }

    ribbons
      .on('mouseover', (event: MouseEvent, d: any) => {
        ribbons.interrupt('highlight');
        arcs.interrupt('highlight');
        ribbons.transition('highlight').duration(150)
          .attr('fill-opacity', (o: any) => o === d ? Math.min(linkOpacity + 0.35, 1) : 0.05);
        arcs.attr('opacity', 1);
        arcs.transition('highlight').duration(150)
          .attr('opacity', (a: any) =>
            a.index === d.source.index || a.index === d.target.index ? 1 : 0.3
          );
        this.context.events.emit('point:mouseover', {
          point: { from: names[d.source.index], to: names[d.target.index], y: d.source.value },
          index: chords.indexOf(d), series: this, event,
          plotX: cxo, plotY: cyo,
        });
      })
      .on('mouseout', (event: MouseEvent, d: any) => {
        ribbons.interrupt('highlight');
        arcs.interrupt('highlight');
        ribbons.transition('highlight').duration(150).attr('fill-opacity', linkOpacity);
        arcs.transition('highlight').duration(150).attr('opacity', 1);
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

    const arcsData = chords.groups.map((g: any) => {
      return {
        ...g,
        startAngle: g.startAngle + startAngle,
        endAngle: g.endAngle + startAngle,
      };
    });

    const arcBorderColor = cfg.borderColor ?? '#ffffff';
    const arcBorderWidth = cfg.borderWidth ?? 1;

    const arcs = g.selectAll('.katucharts-chord-arc')
      .data(arcsData)
      .join('path')
      .attr('class', 'katucharts-chord-arc')
      .attr('fill', (d: any) => getNodeColor(d.index))
      .attr('stroke', arcBorderColor)
      .attr('stroke-width', arcBorderWidth)
      .style('cursor', 'pointer');

    if (animate) {
      arcs.each(function(d: any) {
        const self = select(this);
        const startArc = { startAngle: d.startAngle, endAngle: d.startAngle };
        const interp = interpolate(startArc, d);
        self.transition().duration(800)
          .attrTween('d', () => (t: number) => arcGen(interp(t))!);
      });
    } else {
      arcs.attr('d', arcGen as any);
    }

    arcs
      .on('mouseover', (event: MouseEvent, d: any) => {
        const target = select(event.currentTarget as SVGPathElement);
        target.transition('arc').duration(150).attr('d', arcHover(d)!);
        ribbons.interrupt('highlight');
        arcs.interrupt('highlight');
        ribbons.transition('highlight').duration(150)
          .attr('fill-opacity', (r: any) =>
            r.source.index === d.index || r.target.index === d.index ? Math.min(linkOpacity + 0.35, 1) : 0.05
          );
        arcs.attr('opacity', 1);
        arcs.filter((o: any) => o !== d)
          .transition('highlight').duration(150).attr('opacity', (a: any) => {
            const connected = chords.some((r: any) =>
              (r.source.index === d.index && r.target.index === a.index) ||
              (r.target.index === d.index && r.source.index === a.index)
            );
            return connected ? 1 : 0.3;
          });
        this.context.events.emit('point:mouseover', {
          point: { name: names[d.index], y: d.value },
          index: d.index, series: this, event,
          plotX: cxo, plotY: cyo,
        });
      })
      .on('mouseout', (event: MouseEvent, d: any) => {
        const target = select(event.currentTarget as SVGPathElement);
        target.transition('arc').duration(150).attr('d', arcGen(d)!);
        ribbons.interrupt('highlight');
        arcs.interrupt('highlight');
        ribbons.transition('highlight').duration(150).attr('fill-opacity', linkOpacity);
        arcs.transition('highlight').duration(150).attr('opacity', 1);
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

    const uid = `dw-${Math.random().toString(36).slice(2, 8)}`;
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
      .each(function(d: any) {
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

  private buildMatrix(): { matrix: number[][]; names: string[]; nodeColors: (string | undefined)[] } {
    const configNodes: SankeyNodeOptions[] = (this.config as any).nodes || [];
    const nodeColorMap = new Map<string, string>();
    for (const n of configNodes) {
      if (n.color) nodeColorMap.set(n.id, n.color);
    }

    const nameSet = new Set<string>();
    for (const d of this.data) {
      if ((d as any).from) nameSet.add((d as any).from);
      if ((d as any).to) nameSet.add((d as any).to);
    }
    const names = Array.from(nameSet);
    const nameIndex = new Map(names.map((n, i) => [n, i]));
    const matrix = Array.from({ length: names.length }, () => new Array(names.length).fill(0));

    for (const d of this.data) {
      const from = nameIndex.get((d as any).from);
      const to = nameIndex.get((d as any).to);
      if (from !== undefined && to !== undefined) {
        const w = d.y ?? (d as any).weight ?? 1;
        matrix[from][to] += w;
        matrix[to][from] += w;
      }
    }

    const nodeColors = names.map(n => nodeColorMap.get(n));

    return { matrix, names, nodeColors };
  }

  getDataExtents() {
    return { xMin: 0, xMax: 0, yMin: 0, yMax: 0 };
  }
}

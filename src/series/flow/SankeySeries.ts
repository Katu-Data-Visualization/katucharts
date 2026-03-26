import { sankey, sankeyLinkHorizontal, sankeyLeft, sankeyJustify } from 'd3-sankey';
import { select } from 'd3-selection';
import 'd3-transition';
import { BaseSeries } from '../BaseSeries';
import type { InternalSeriesConfig, SankeyNodeOptions, SankeyLevelOptions } from '../../types/options';

export class SankeySeries extends BaseSeries {
  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  render(): void {
    const { plotArea, colors } = this.context;
    const animate = this.context.animate;
    const cfg = this.config as any;

    const parentGroup = (this.group.node() as SVGElement)?.parentElement;
    if (parentGroup) {
      select(parentGroup).attr('clip-path', null);
    }
    const svg = this.group.select(function() {
      return (this as unknown as SVGElement).ownerSVGElement;
    }) as any;
    if (!svg.empty()) {
      svg.style('overflow', 'visible');
    }

    const { nodes, links } = this.buildGraph();
    if (nodes.length === 0) return;

    const nodeWidth = cfg.nodeWidth ?? 20;
    const nodePadding = cfg.nodePadding ?? 10;
    const baseLinkOpacity = cfg.linkOpacity ?? 0.4;
    const colorByPoint = cfg.colorByPoint !== false;
    const minLinkWidth = cfg.minLinkWidth ?? 1;
    const nodeBorderWidth = cfg.borderWidth ?? 0;
    const nodeBorderColor = cfg.borderColor ?? 'none';
    const levels: SankeyLevelOptions[] = cfg.levels || [];
    const curveFactor = cfg.curveFactor ?? 0.33;

    const alignMode = cfg.nodeAlignment === 'left' ? sankeyLeft : sankeyJustify;
    const sankeyGen = sankey<any, any>()
      .nodeId((d: any) => d.id)
      .nodeAlign(alignMode)
      .nodeWidth(nodeWidth)
      .nodePadding(nodePadding)
      .extent([[0, 0], [plotArea.width, plotArea.height]]);

    const graph = sankeyGen({ nodes: [...nodes], links: [...links] });

    const levelMap = new Map<number, SankeyLevelOptions>();
    for (const lvl of levels) {
      if (lvl.level !== undefined) levelMap.set(lvl.level, lvl);
    }

    const getLinkOpacity = (d: any): number => {
      const srcLevel = d.source?.depth;
      const lvlCfg = srcLevel !== undefined ? levelMap.get(srcLevel) : undefined;
      return lvlCfg?.linkOpacity ?? baseLinkOpacity;
    };

    const linkPathGen = sankeyLinkHorizontal() as any;
    const linkColorMode = cfg.linkColorMode ?? 'from';

    const getSourceColor = (d: any) =>
      d.source.color || colors[graph.nodes.indexOf(d.source) % colors.length] || '#aaa';
    const getTargetColor = (d: any) =>
      d.target.color || colors[graph.nodes.indexOf(d.target) % colors.length] || '#aaa';

    let gradientDefs: any = null;
    if (linkColorMode === 'gradient') {
      gradientDefs = this.group.append('defs');
    }

    const linkPaths = this.group.selectAll('.katucharts-sankey-link')
      .data(graph.links)
      .join('path')
      .attr('class', 'katucharts-sankey-link')
      .attr('d', linkPathGen)
      .attr('fill', 'none')
      .attr('stroke-width', (d: any) => Math.max(minLinkWidth, d.width))
      .style('cursor', 'pointer');

    if (linkColorMode === 'gradient' && gradientDefs) {
      linkPaths.each(function(d: any, i: number) {
        const gradId = `katucharts-sankey-grad-${i}-${Math.random().toString(36).slice(2, 6)}`;
        gradientDefs.append('linearGradient')
          .attr('id', gradId)
          .attr('gradientUnits', 'userSpaceOnUse')
          .attr('x1', d.source.x1).attr('x2', d.target.x0)
          .selectAll('stop')
          .data([
            { offset: '0%', color: getSourceColor(d) },
            { offset: '100%', color: getTargetColor(d) },
          ])
          .join('stop')
          .attr('offset', (s: any) => s.offset)
          .attr('stop-color', (s: any) => s.color);
        select(this).attr('stroke', `url(#${gradId})`);
      });
    } else if (linkColorMode === 'to') {
      linkPaths.attr('stroke', (d: any) => getTargetColor(d));
    } else {
      linkPaths.attr('stroke', (d: any) => getSourceColor(d));
    }

    if (animate) {
      linkPaths.attr('stroke-opacity', 0)
        .transition().duration(600).delay(300)
        .attr('stroke-opacity', (d: any) => getLinkOpacity(d));
    } else {
      linkPaths.attr('stroke-opacity', (d: any) => getLinkOpacity(d));
    }

    linkPaths
      .on('mouseover', (event: MouseEvent, d: any) => {
        const opacity = getLinkOpacity(d);
        const target = select(event.currentTarget as SVGPathElement);
        linkPaths.interrupt('highlight');
        nodeRects.interrupt('highlight');
        target.attr('stroke-opacity', Math.min(opacity + 0.3, 1));
        linkPaths.filter((l: any) => l !== d).transition('highlight').duration(150).attr('stroke-opacity', opacity * 0.375);
        nodeRects.attr('opacity', 1);
        nodeRects.transition('highlight').duration(150)
          .attr('opacity', (n: any) => n === d.source || n === d.target ? 1 : 0.4);
        this.context.events.emit('point:mouseover', {
          point: { from: d.source.name, to: d.target.name, y: d.value },
          index: graph.links.indexOf(d), series: this, event,
          plotX: (d.source.x1 + d.target.x0) / 2,
          plotY: (d.y0 + d.y1) / 2,
        });
      })
      .on('mouseout', (event: MouseEvent, d: any) => {
        linkPaths.interrupt('highlight');
        nodeRects.interrupt('highlight');
        linkPaths.transition('highlight').duration(150)
          .attr('stroke-opacity', (l: any) => getLinkOpacity(l));
        nodeRects.transition('highlight').duration(150).attr('opacity', 1);
        this.context.events.emit('point:mouseout', {
          point: { from: d.source.name, to: d.target.name, y: d.value },
          index: graph.links.indexOf(d), series: this, event,
        });
      })
      .on('click', (event: MouseEvent, d: any) => {
        this.context.events.emit('point:click', {
          point: { from: d.source.name, to: d.target.name, y: d.value },
          index: graph.links.indexOf(d), series: this, event,
        });
      });

    const nodeRects = this.group.selectAll('.katucharts-sankey-node')
      .data(graph.nodes)
      .join('rect')
      .attr('class', 'katucharts-sankey-node')
      .attr('x', (d: any) => d.x0)
      .attr('y', (d: any) => d.y0)
      .attr('width', (d: any) => d.x1 - d.x0)
      .attr('height', (d: any) => Math.max(1, d.y1 - d.y0))
      .attr('fill', (d: any, i: number) => {
        if (d.color) return d.color;
        const lvlCfg = d.depth !== undefined ? levelMap.get(d.depth) : undefined;
        if (lvlCfg?.color) return lvlCfg.color;
        return colorByPoint ? colors[i % colors.length] : (cfg.color || colors[0]);
      })
      .attr('stroke', nodeBorderColor)
      .attr('stroke-width', nodeBorderWidth)
      .attr('rx', 4)
      .style('cursor', 'pointer');

    if (animate) {
      nodeRects.attr('opacity', 0)
        .transition().duration(500)
        .attr('opacity', 1);
    }

    nodeRects
      .on('mouseover', (event: MouseEvent, d: any) => {
        const target = select(event.currentTarget as SVGRectElement);
        target.style('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))');
        nodeRects.interrupt('highlight');
        linkPaths.interrupt('highlight');
        nodeRects.attr('opacity', 1);
        nodeRects.filter((n: any) => n !== d).transition('highlight').duration(150).attr('opacity', 0.4);
        linkPaths.transition('highlight').duration(150)
          .attr('stroke-opacity', (l: any) =>
            l.source === d || l.target === d ? Math.min(getLinkOpacity(l) + 0.3, 1) : getLinkOpacity(l) * 0.375
          );
        this.context.events.emit('point:mouseover', {
          point: { name: d.name || d.id, y: d.value },
          index: graph.nodes.indexOf(d), series: this, event,
          plotX: (d.x0 + d.x1) / 2, plotY: (d.y0 + d.y1) / 2,
        });
      })
      .on('mouseout', (event: MouseEvent, d: any) => {
        const target = select(event.currentTarget as SVGRectElement);
        target.style('filter', '');
        nodeRects.interrupt('highlight');
        linkPaths.interrupt('highlight');
        nodeRects.transition('highlight').duration(150).attr('opacity', 1);
        linkPaths.transition('highlight').duration(150)
          .attr('stroke-opacity', (l: any) => getLinkOpacity(l));
        this.context.events.emit('point:mouseout', {
          point: { name: d.name || d.id, y: d.value },
          index: graph.nodes.indexOf(d), series: this, event,
        });
      })
      .on('click', (event: MouseEvent, d: any) => {
        this.context.events.emit('point:click', {
          point: { name: d.name || d.id, y: d.value },
          index: graph.nodes.indexOf(d), series: this, event,
        });
      });

    const dlCfg = this.config.dataLabels || {};
    const dlEnabled = dlCfg.enabled !== false;
    const dlFontSize = (dlCfg.style?.fontSize as string) || '10px';
    const dlColor = dlCfg.color || (dlCfg.style?.color as string) || '#333';

    if (dlEnabled) {
      const labelTarget = this.context.plotGroup || this.group;
      const labelsGroup = labelTarget.append('g')
        .attr('class', 'katucharts-sankey-labels');

      labelsGroup.selectAll('.katucharts-sankey-label')
        .data(graph.nodes)
        .join('text')
        .attr('class', 'katucharts-sankey-label')
        .attr('x', (d: any) => d.x1 + 6 + (dlCfg.x ?? 0))
        .attr('y', (d: any) => (d.y0 + d.y1) / 2 + (dlCfg.y ?? 0))
        .attr('dy', '0.35em')
        .attr('text-anchor', 'start')
        .attr('font-size', dlFontSize)
        .attr('fill', dlColor)
        .style('pointer-events', 'none')
        .text((d: any) => {
          if (dlCfg.formatter) {
            return dlCfg.formatter.call({
              point: { name: d.name || d.id, y: d.value },
              series: { name: this.config.name },
              x: d.name || d.id, y: d.value,
            });
          }
          return d.name || d.id;
        });
    }
  }

  private buildGraph() {
    const nodeMap = new Map<string, any>();
    const links: any[] = [];
    const configNodes: SankeyNodeOptions[] = (this.config as any).nodes || [];

    for (const n of configNodes) {
      nodeMap.set(n.id, { id: n.id, name: n.name || n.id, color: n.color, column: n.column, offset: n.offset });
    }

    for (const d of this.data) {
      const from = (d as any).from;
      const to = (d as any).to;
      const weight = d.y ?? (d as any).weight ?? 1;

      if (from && to) {
        if (!nodeMap.has(from)) nodeMap.set(from, { id: from, name: from });
        if (!nodeMap.has(to)) nodeMap.set(to, { id: to, name: to });
        links.push({ source: from, target: to, value: weight });
      }
    }

    return { nodes: Array.from(nodeMap.values()), links };
  }

  getDataExtents() {
    return { xMin: 0, xMax: 0, yMin: 0, yMax: 0 };
  }
}

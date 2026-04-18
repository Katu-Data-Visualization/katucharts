import { sankey, sankeyLinkHorizontal, sankeyLeft, sankeyJustify } from 'd3-sankey';
import { select } from 'd3-selection';
import 'd3-transition';
import { BaseSeries } from '../BaseSeries';
import type { InternalSeriesConfig, SankeyNodeOptions, SankeyLevelOptions } from '../../types/options';
import { DEFAULT_CHART_TEXT_COLOR, DEFAULT_CHART_TEXT_SIZE } from '../../utils/chartText';
import {
  ENTRY_FLOW_DURATION,
  ENTRY_DURATION,
  HOVER_DURATION,
  EASE_ENTRY,
  EASE_HOVER,
} from '../../core/animationConstants';

export class SankeyChart extends BaseSeries {
  private getBaseFlowDuration(): number {
    return ENTRY_DURATION * 4;
  }

  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  render(): void {
    const { plotArea, colors } = this.context;
    const animate = this.context.animate;
    const cfg = this.config as any;
    const baseFlowDur = this.getBaseFlowDuration();

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

    const dlCfgPre = this.config.dataLabels || {};
    const dlEnabledPre = dlCfgPre.enabled !== false;
    let labelReserve = 0;
    if (dlEnabledPre && nodes.length > 0) {
      const fontSize = parseFloat((dlCfgPre.style?.fontSize as string) || '10') || 10;
      const maxLen = nodes.reduce((max, n) => Math.max(max, (n.name || n.id || '').length), 0);
      labelReserve = maxLen * fontSize * 0.6 + 12;
    }

    const alignMode = cfg.nodeAlignment === 'left' ? sankeyLeft : sankeyJustify;
    const sankeyGen = sankey<any, any>()
      .nodeId((d: any) => d.id)
      .nodeAlign(alignMode)
      .nodeWidth(nodeWidth)
      .nodePadding(nodePadding)
      .extent([[0, 0], [plotArea.width - labelReserve, plotArea.height]]);

    const graph = sankeyGen({ nodes: [...nodes], links: [...links] });

    // Group nodes and links by column depth for cascading animation
    const nodesByDepth = new Map<number, any[]>();
    const linksBySourceDepth = new Map<number, any[]>();
    for (const node of graph.nodes) {
      const dep = node.depth ?? 0;
      if (!nodesByDepth.has(dep)) nodesByDepth.set(dep, []);
      nodesByDepth.get(dep)!.push(node);
    }
    for (const link of graph.links) {
      const dep = link.source.depth ?? 0;
      if (!linksBySourceDepth.has(dep)) linksBySourceDepth.set(dep, []);
      linksBySourceDepth.get(dep)!.push(link);
    }
    const maxDepth = graph.nodes.reduce((m, n) => Math.max(m, n.depth ?? 0), 0);
    const numCols = maxDepth + 1;

    // Per-column timing derived from total base duration
    const nodeDur = Math.round(baseFlowDur * 0.22);
    const linkDur = nodeDur;
    const colStep = linkDur;
    const totalAnimDur = maxDepth * colStep + nodeDur + linkDur;

    const centerNodes = cfg.centerNodes !== false;
    const spreadFactor = cfg.spreadFactor ?? 1.0;
    if (centerNodes || spreadFactor !== 1.0) {
      this.centerAndSpreadNodes(graph, sankeyGen, plotArea.height, spreadFactor, nodePadding);
    }

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
      linkPaths.attr('stroke-opacity', (d: any) => getLinkOpacity(d))
        .each(function(this: any, d: any) {
          const pathEl = this as SVGPathElement;
          const totalLength = pathEl.getTotalLength?.() || 0;
          if (totalLength === 0) return;
          const dep = d.source.depth ?? 0;
          const colLinks = linksBySourceDepth.get(dep) || [];
          const linkIdx = colLinks.indexOf(d);
          const colDelay = dep * colStep;
          const delay = colDelay + nodeDur - 60 + Math.min(linkIdx * 12, 60);
          select(this)
            .attr('stroke-dasharray', `${totalLength} ${totalLength}`)
            .attr('stroke-dashoffset', totalLength)
            .transition('enter').duration(linkDur).delay(delay).ease(EASE_ENTRY)
            .attr('stroke-dashoffset', 0)
            .on('end', function() {
              select(this).attr('stroke-dasharray', null).attr('stroke-dashoffset', null);
            });
        });
    } else {
      linkPaths.attr('stroke-opacity', (d: any) => getLinkOpacity(d));
    }

    const emitLinkPoint = (type: 'mouseover' | 'mouseout' | 'click', event: MouseEvent, d: any) => {
      const point = {
        from: d.source.name, to: d.target.name, y: d.value, weight: d.value,
        fromNode: { name: d.source.name, id: d.source.id },
        toNode: { name: d.target.name, id: d.target.id },
      };

      if (type === 'mouseover') {
        this.context.events.emit('point:mouseover', {
          point,
          index: graph.links.indexOf(d), series: this, event,
          plotX: (d.source.x1 + d.target.x0) / 2,
          plotY: (d.y0 + d.y1) / 2,
        });
        return;
      }

      if (type === 'mouseout') {
        this.context.events.emit('point:mouseout', {
          point,
          index: graph.links.indexOf(d), series: this, event,
        });
        return;
      }

      this.context.events.emit('point:click', {
        point,
        index: graph.links.indexOf(d), series: this, event,
      });
    };

    const handleLinkMouseOver = (event: MouseEvent, d: any) => {
      const opacity = getLinkOpacity(d);
      linkPaths.interrupt('highlight');
      nodeRects.interrupt('highlight');
      linkPaths.attr('stroke-opacity', (l: any) => l === d ? Math.min(opacity + 0.3, 1) : getLinkOpacity(l));
      linkPaths.filter((l: any) => l !== d).transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER).attr('stroke-opacity', opacity * 0.375);
      nodeRects.attr('opacity', 1);
      nodeRects.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER)
        .attr('opacity', (n: any) => n === d.source || n === d.target ? 1 : 0.4);
      emitLinkPoint('mouseover', event, d);
    };

    const handleLinkMouseOut = (event: MouseEvent, d: any) => {
      linkPaths.interrupt('highlight');
      nodeRects.interrupt('highlight');
      linkPaths.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER)
        .attr('stroke-opacity', (l: any) => getLinkOpacity(l));
      nodeRects.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER).attr('opacity', 1);
      emitLinkPoint('mouseout', event, d);
    };

    const handleLinkClick = (event: MouseEvent, d: any) => {
      emitLinkPoint('click', event, d);
    };

    linkPaths
      .on('mouseover', handleLinkMouseOver)
      .on('mouseout', handleLinkMouseOut)
      .on('click', handleLinkClick);

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
      nodeRects
        .attr('opacity', 0)
        .attr('x', (d: any) => d.x0 - 10)
        .each(function(this: any, d: any) {
          const dep = d.depth ?? 0;
          const colNodes = nodesByDepth.get(dep) || [];
          const nodeIdx = colNodes.indexOf(d);
          const delay = dep * colStep + Math.min(nodeIdx * 20, 80);
          select(this).transition('enter').duration(nodeDur).delay(delay).ease(EASE_ENTRY)
            .attr('opacity', 1)
            .attr('x', d.x0);
        });
    }

    nodeRects
      .on('mouseover', (event: MouseEvent, d: any) => {
        const target = select(event.currentTarget as SVGRectElement);
        target.style('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))');
        nodeRects.interrupt('highlight');
        linkPaths.interrupt('highlight');
        nodeRects.attr('opacity', 1);
        nodeRects.filter((n: any) => n !== d).transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER).attr('opacity', 0.4);
        linkPaths.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER)
          .attr('stroke-opacity', (l: any) =>
            l.source === d || l.target === d ? Math.min(getLinkOpacity(l) + 0.3, 1) : getLinkOpacity(l) * 0.375
          );
        const nodePoint = { name: d.name || d.id, y: d.value, sum: d.value };
        this.context.events.emit('point:mouseover', {
          point: nodePoint,
          index: graph.nodes.indexOf(d), series: this, event,
          plotX: (d.x0 + d.x1) / 2, plotY: (d.y0 + d.y1) / 2,
        });
      })
      .on('mouseout', (event: MouseEvent, d: any) => {
        const target = select(event.currentTarget as SVGRectElement);
        target.style('filter', '');
        nodeRects.interrupt('highlight');
        linkPaths.interrupt('highlight');
        nodeRects.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER).attr('opacity', 1);
        linkPaths.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER)
          .attr('stroke-opacity', (l: any) => getLinkOpacity(l));
        this.context.events.emit('point:mouseout', {
          point: { name: d.name || d.id, y: d.value, sum: d.value },
          index: graph.nodes.indexOf(d), series: this, event,
        });
      })
      .on('click', (event: MouseEvent, d: any) => {
        this.context.events.emit('point:click', {
          point: { name: d.name || d.id, y: d.value },
          index: graph.nodes.indexOf(d), series: this, event,
        });
      });

    const linkHitAreas = this.group.append('g')
      .attr('class', 'katucharts-sankey-link-hitareas');

    linkHitAreas.selectAll('.katucharts-sankey-link-hitarea')
      .data(graph.links)
      .join('path')
      .attr('class', 'katucharts-sankey-link-hitarea')
      .attr('d', linkPathGen)
      .attr('fill', 'none')
      .attr('stroke', 'transparent')
      .attr('stroke-linecap', 'round')
      .attr('stroke-width', (d: any) => Math.max(16, Math.max(minLinkWidth, d.width) + 10))
      .style('cursor', 'pointer')
      .on('mouseover', handleLinkMouseOver)
      .on('mouseout', handleLinkMouseOut)
      .on('click', handleLinkClick);

    const dlCfg = this.config.dataLabels || {};
    const dlEnabled = dlCfg.enabled !== false;
    const dlFontSize = (dlCfg.style?.fontSize as string) || DEFAULT_CHART_TEXT_SIZE;
    const dlColor = dlCfg.color || (dlCfg.style?.color as string) || DEFAULT_CHART_TEXT_COLOR;

    if (dlEnabled) {
      const labelsGroup = this.group.append('g')
        .attr('class', 'katucharts-sankey-labels');

      const labelNodes = labelsGroup.selectAll('.katucharts-sankey-label')
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

      if (animate) {
        labelNodes.attr('opacity', 0)
          .each(function(this: any, d: any) {
            const dep = d.depth ?? 0;
            const colNodes = nodesByDepth.get(dep) || [];
            const nodeIdx = colNodes.indexOf(d);
            const delay = dep * colStep + nodeDur - 80 + Math.min(nodeIdx * 20, 80);
            select(this).transition('enter').duration(nodeDur).delay(delay).ease(EASE_ENTRY)
              .attr('opacity', 1);
          });
      }
    }

    if (animate) {
      this.emitAfterAnimate(totalAnimDur + 100);
    }
  }

  private centerAndSpreadNodes(
    graph: any,
    sankeyGen: any,
    plotHeight: number,
    spreadFactor: number,
    nodePadding: number
  ): void {
    const columns = new Map<number, any[]>();
    for (const node of graph.nodes) {
      const layer = node.layer ?? node.depth ?? 0;
      if (!columns.has(layer)) columns.set(layer, []);
      columns.get(layer)!.push(node);
    }

    for (const [, colNodes] of columns) {
      colNodes.sort((a: any, b: any) => a.y0 - b.y0);

      if (spreadFactor !== 1.0 && colNodes.length > 1) {
        const minY = colNodes[0].y0;
        const maxY = colNodes[colNodes.length - 1].y1;
        const midpoint = (minY + maxY) / 2;

        for (const node of colNodes) {
          const nodeMid = (node.y0 + node.y1) / 2;
          const nodeHeight = node.y1 - node.y0;
          const newMid = midpoint + (nodeMid - midpoint) * spreadFactor;
          node.y0 = newMid - nodeHeight / 2;
          node.y1 = newMid + nodeHeight / 2;
        }

        for (let i = 1; i < colNodes.length; i++) {
          const overlap = colNodes[i - 1].y1 + nodePadding - colNodes[i].y0;
          if (overlap > 0) {
            colNodes[i].y0 += overlap;
            colNodes[i].y1 += overlap;
          }
        }
      }

      const colMinY = colNodes[0].y0;
      const colMaxY = colNodes[colNodes.length - 1].y1;
      const delta = (plotHeight - (colMaxY - colMinY)) / 2 - colMinY;

      for (const node of colNodes) {
        node.y0 += delta;
        node.y1 += delta;
      }
    }

    sankeyGen.update(graph);
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

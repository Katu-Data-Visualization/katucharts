import { sankey, sankeyLinkHorizontal, sankeyLeft, sankeyJustify } from 'd3-sankey';
import { select } from 'd3-selection';
import 'd3-transition';
import { BaseSeries } from '../BaseSeries';
import type { InternalSeriesConfig, SankeyNodeOptions, SankeyLevelOptions } from '../../types/options';
import { DEFAULT_CHART_TEXT_COLOR, DEFAULT_CHART_TEXT_SIZE } from '../../utils/chartText';
import {
  ENTRY_DURATION,
  HOVER_DURATION,
  EASE_ENTRY,
  EASE_HOVER,
} from '../../core/animationConstants';

const NARROW_PLOT_WIDTH = 500;
const VERY_NARROW_PLOT_WIDTH = 380;
const ULTRA_NARROW_PLOT_WIDTH = 280;

function parseSankeyFontSizePx(fontSize: string | undefined): number {
  if (!fontSize) return 12;
  if (fontSize.endsWith('px')) return parseFloat(fontSize) || 12;
  if (fontSize.endsWith('rem') || fontSize.endsWith('em')) {
    const rootFontPx = typeof document === 'undefined'
      ? 16
      : parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    return (parseFloat(fontSize) || 1) * rootFontPx;
  }
  const parsed = parseFloat(fontSize);
  return Number.isNaN(parsed) ? 12 : parsed;
}

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

    this.group.selectAll('rect, path, text')
      .interrupt('enter')
      .interrupt('highlight');

    // Deliberately keep the parent group's clip-path and the owner SVG's
    // overflow intact — stripping either causes link curves that dip past the
    // plot edges (seen on narrow widths where bezier control points fan out)
    // to render outside the card boundary.

    const { nodes, links } = this.buildGraph();
    if (nodes.length === 0) return;

    const isNarrow = plotArea.width < NARROW_PLOT_WIDTH;
    const isVeryNarrow = plotArea.width < VERY_NARROW_PLOT_WIDTH;
    const isUltraNarrow = plotArea.width < ULTRA_NARROW_PLOT_WIDTH;
    const nodeWidthCfg = cfg.nodeWidth;
    const autoNodeWidth = nodeWidthCfg === 'auto';
    const rawColumns = nodes
      .map((n: any) => typeof n.column === 'number' && Number.isFinite(n.column) ? Math.max(0, Math.floor(n.column)) : null)
      .filter((n: number | null): n is number => n !== null);
    const hasExplicitColumns = rawColumns.length > 0;
    const maxExplicitColumn = hasExplicitColumns ? Math.max(...rawColumns) : 0;
    const baseNodePadding = typeof cfg.nodePadding === 'number'
      ? cfg.nodePadding
      : (isNarrow ? Math.max(4, Math.min(10, plotArea.height / 40)) : 10);
    const baseLinkOpacity = cfg.linkOpacity ?? 0.4;
    const colorByPoint = cfg.colorByPoint !== false;
    const minLinkWidth = cfg.minLinkWidth ?? 1;
    const nodeBorderWidth = cfg.borderWidth ?? 0;
    const nodeBorderColor = cfg.borderColor ?? 'none';
    const levels: SankeyLevelOptions[] = cfg.levels || [];

    const dlCfg = this.config.dataLabels || {};
    const dlEnabled = dlCfg.enabled !== false;
    const dlFontSizeRaw = (dlCfg.style?.fontSize as string) || DEFAULT_CHART_TEXT_SIZE;
    const dlFontSizePx = parseSankeyFontSizePx(dlFontSizeRaw);
    const effectiveFontPx = isVeryNarrow
      ? Math.min(dlFontSizePx, 10)
      : isNarrow ? Math.min(dlFontSizePx, 12) : dlFontSizePx;
    const dlFontSize = `${effectiveFontPx}px`;
    const dlColor = dlCfg.color || (dlCfg.style?.color as string) || DEFAULT_CHART_TEXT_COLOR;

    const charW = effectiveFontPx * 0.62;
    const getNodeLabel = (d: any): string => {
      if (dlCfg.formatter) {
        return String(dlCfg.formatter.call({
          point: { name: d.name || d.id, y: d.value },
          series: { name: this.config.name },
          x: d.name || d.id,
          y: d.value,
        }) ?? '');
      }
      return String(d.name || d.id || '');
    };
    const estimateWidth = (s: string) => s.length * charW;
    const truncateToFit = (text: string, maxWidth: number, minChars: number = 2): string => {
      if (maxWidth <= 0) return '';
      const fullW = estimateWidth(text);
      if (fullW <= maxWidth) return text;
      const maxChars = Math.floor(maxWidth / charW) - 1;
      if (maxChars < minChars) return '';
      if (maxChars >= text.length) return text;
      return text.slice(0, maxChars) + '…';
    };

    const alignMode = cfg.nodeAlignment === 'left' ? sankeyLeft : sankeyJustify;
    const minNodeWidth = isVeryNarrow ? 8 : isNarrow ? 10 : 14;
    const absoluteMinNodeWidth = isUltraNarrow ? 5 : minNodeWidth;
    const desiredNodeWidth = typeof nodeWidthCfg === 'number'
      ? nodeWidthCfg
      : (autoNodeWidth ? 20 : 20);

    const buildLayout = (padding: number, leftPad: number, rightPad: number, nodeWidth: number) => {
      const extentRight = Math.max(leftPad + nodeWidth + 20, plotArea.width - rightPad);
      const gen = sankey<any, any>()
        .nodeId((d: any) => d.id)
        .nodeAlign(alignMode)
        .nodeWidth(nodeWidth)
        .nodePadding(padding)
        .extent([[leftPad, 0], [extentRight, plotArea.height]]);
      const graph = gen({ nodes: [...nodes], links: [...links] });
      for (const n of graph.nodes) {
        if (n.x0 < leftPad) {
          const w = n.x1 - n.x0;
          n.x0 = leftPad;
          n.x1 = leftPad + w;
        }
      }
      return { gen, graph };
    };

    let firstPassNodeWidth = desiredNodeWidth;
    const firstPass = buildLayout(baseNodePadding, 0, 0, firstPassNodeWidth);
    const getNodeColumn = (n: any): number =>
      hasExplicitColumns && typeof n.column === 'number' && Number.isFinite(n.column)
        ? Math.max(0, Math.floor(n.column))
        : (n.layer ?? n.depth ?? 0);
    const firstPassMaxDepth = hasExplicitColumns
      ? maxExplicitColumn
      : firstPass.graph.nodes.reduce((m, n) => Math.max(m, n.depth ?? 0), 0);
    const maxNodeX0FirstPass = firstPass.graph.nodes.reduce((m, n) => Math.max(m, n.x0 ?? 0), 0);
    const minNodeX0FirstPass = firstPass.graph.nodes.reduce((m, n) => Math.min(m, n.x0 ?? Infinity), Infinity);
    const firstColumnNodes = hasExplicitColumns
      ? firstPass.graph.nodes.filter((n: any) => getNodeColumn(n) === 0)
      : firstPass.graph.nodes.filter((n: any) => (n.x0 ?? Infinity) <= minNodeX0FirstPass + 0.5);
    const lastColumnNodes = hasExplicitColumns
      ? firstPass.graph.nodes.filter((n: any) => getNodeColumn(n) === maxExplicitColumn)
      : firstPass.graph.nodes.filter((n: any) => (n.x0 ?? 0) >= maxNodeX0FirstPass - 0.5);

    const maxFirstLabelWidth = dlEnabled
      ? Math.max(0, ...firstColumnNodes.map((n: any) => estimateWidth(getNodeLabel(n))))
      : 0;
    const maxLastLabelWidth = dlEnabled
      ? Math.max(0, ...lastColumnNodes.map((n: any) => estimateWidth(getNodeLabel(n))))
      : 0;
    const leftLabelPad = dlEnabled && isNarrow
      ? Math.min(Math.floor(plotArea.width * 0.08), Math.max(0, maxFirstLabelWidth * 0.18))
      : 0;
    const reserveExternalLastLabels = dlEnabled && !isUltraNarrow;
    const rightLabelPad = reserveExternalLastLabels
      ? Math.min(
          Math.floor(plotArea.width * (isVeryNarrow ? 0.24 : isNarrow ? 0.22 : 0.18)),
          Math.max(0, maxLastLabelWidth + 10)
        )
      : 0;
    const usableWidth = Math.max(1, plotArea.width - leftLabelPad - rightLabelPad);
    const maxDepthForWidth = Math.max(firstPassMaxDepth, 0);
    if (maxDepthForWidth > 0) {
      const minColumnGap = isUltraNarrow ? 8 : isVeryNarrow ? 10 : isNarrow ? 14 : 18;
      const maxWidthWithGap = (usableWidth - maxDepthForWidth * minColumnGap) / (maxDepthForWidth + 1);
      const budgetedNodeWidth = Math.max(absoluteMinNodeWidth, Math.min(desiredNodeWidth, maxWidthWithGap));
      if (typeof nodeWidthCfg !== 'number' || isNarrow) {
        firstPassNodeWidth = budgetedNodeWidth;
      }
    } else if (typeof nodeWidthCfg !== 'number') {
      firstPassNodeWidth = Math.max(absoluteMinNodeWidth, Math.min(desiredNodeWidth, usableWidth * 0.5));
    }

    const edgeInset = isVeryNarrow
      ? Math.max(2, Math.min(8, firstPassNodeWidth * 0.35))
      : 0;
    const layoutLeftPad = leftLabelPad + edgeInset;
    const layoutRightPad = rightLabelPad + edgeInset;

    let { gen: sankeyGen, graph } = buildLayout(baseNodePadding, layoutLeftPad, layoutRightPad, firstPassNodeWidth);

    // Highcharts `getNodePadding` shrinks padding when nodes would overflow
    // vertically: `if (maxLen * nodePadding > plotSizeY) nodePadding = plotSizeY / maxLen`.
    const countByDepth = new Map<number, number>();
    for (const n of graph.nodes) {
      const d = getNodeColumn(n);
      countByDepth.set(d, (countByDepth.get(d) ?? 0) + 1);
    }
    const maxNodesInColumn = Math.max(1, ...countByDepth.values());
    let effectiveNodePadding = baseNodePadding;
    if (maxNodesInColumn * baseNodePadding > plotArea.height) {
      effectiveNodePadding = Math.max(1, plotArea.height / maxNodesInColumn);
      ({ gen: sankeyGen, graph } = buildLayout(effectiveNodePadding, layoutLeftPad, layoutRightPad, firstPassNodeWidth));
    }

    if (autoNodeWidth) {
      const md = graph.nodes.reduce((m, n) => Math.max(m, getNodeColumn(n)), 0);
      const autoWidth = Math.max(absoluteMinNodeWidth, Math.min(20, usableWidth / ((md + 1) * 3)));
      sankeyGen.nodeWidth(autoWidth);
      graph = sankeyGen({ nodes: [...nodes], links: [...links] });
    }

    if (hasExplicitColumns) {
      const actualNodeWidth = Math.max(1, graph.nodes[0] ? graph.nodes[0].x1 - graph.nodes[0].x0 : firstPassNodeWidth);
      const explicitPadding = this.applyExplicitColumnLayout(
        graph,
        sankeyGen,
        getNodeColumn,
        maxExplicitColumn,
        layoutLeftPad,
        Math.max(layoutLeftPad + actualNodeWidth, plotArea.width - layoutRightPad),
        plotArea.height,
        effectiveNodePadding,
        actualNodeWidth
      );
      effectiveNodePadding = explicitPadding;
    }

    // Group nodes and links by column depth for cascading animation
    const nodesByDepth = new Map<number, any[]>();
    const linksBySourceDepth = new Map<number, any[]>();
    for (const node of graph.nodes) {
      const dep = getNodeColumn(node);
      if (!nodesByDepth.has(dep)) nodesByDepth.set(dep, []);
      nodesByDepth.get(dep)!.push(node);
    }
    for (const link of graph.links) {
      const dep = getNodeColumn(link.source);
      if (!linksBySourceDepth.has(dep)) linksBySourceDepth.set(dep, []);
      linksBySourceDepth.get(dep)!.push(link);
    }
    const maxDepth = graph.nodes.reduce((m, n) => Math.max(m, getNodeColumn(n)), 0);

    // Per-column timing derived from total base duration
    const nodeDur = Math.round(baseFlowDur * 0.22);
    const linkDur = nodeDur;
    const colStep = linkDur;
    const totalAnimDur = maxDepth * colStep + nodeDur + linkDur;

    const centerNodes = cfg.centerNodes === true;
    const spreadFactor = cfg.spreadFactor ?? 1.0;
    if (centerNodes || spreadFactor !== 1.0) {
      this.centerAndSpreadNodes(graph, sankeyGen, plotArea.height, spreadFactor, effectiveNodePadding);
    }

    const levelMap = new Map<number, SankeyLevelOptions>();
    for (const lvl of levels) {
      if (lvl.level !== undefined) levelMap.set(lvl.level, lvl);
    }

    const getLinkOpacity = (d: any): number => {
      const srcLevel = d.source ? getNodeColumn(d.source) : undefined;
      const lvlCfg = srcLevel !== undefined ? levelMap.get(srcLevel) : undefined;
      return lvlCfg?.linkOpacity ?? baseLinkOpacity;
    };

    const defaultLinkPathGen = sankeyLinkHorizontal() as any;
    const centerLinkPathGen = (d: any): string => {
      if (!isVeryNarrow) return defaultLinkPathGen(d);

      const sourceX = d.source.x1;
      const targetX = d.target.x0;
      const sourceY = d.y0;
      const targetY = d.y1;
      const dx = targetX - sourceX;

      if (!Number.isFinite(dx) || !Number.isFinite(sourceY) || !Number.isFinite(targetY)) {
        return defaultLinkPathGen(d);
      }

      if (dx <= 14) {
        return `M${sourceX},${sourceY}L${targetX},${targetY}`;
      }

      if (dx < 28) {
        const curve = Math.max(2, dx * 0.35);
        return `M${sourceX},${sourceY}C${sourceX + curve},${sourceY} ${targetX - curve},${targetY} ${targetX},${targetY}`;
      }

      return defaultLinkPathGen(d);
    };
    const useRibbonLinks = isVeryNarrow;
    const ribbonLinkPathGen = (d: any): string => {
      const sourceX = d.source.x1;
      const targetX = d.target.x0;
      const sourceY = d.y0;
      const targetY = d.y1;
      const dx = targetX - sourceX;
      const halfWidth = Math.max(minLinkWidth, d.width) / 2;

      if (!Number.isFinite(dx) || !Number.isFinite(sourceY) || !Number.isFinite(targetY)) {
        return centerLinkPathGen(d);
      }

      const sourceTop = sourceY - halfWidth;
      const sourceBottom = sourceY + halfWidth;
      const targetTop = targetY - halfWidth;
      const targetBottom = targetY + halfWidth;
      const curve = Math.max(1, dx * 0.42);

      if (dx <= 2) {
        return [
          `M${sourceX},${sourceTop}`,
          `L${targetX},${targetTop}`,
          `L${targetX},${targetBottom}`,
          `L${sourceX},${sourceBottom}`,
          'Z',
        ].join('');
      }

      return [
        `M${sourceX},${sourceTop}`,
        `C${sourceX + curve},${sourceTop} ${targetX - curve},${targetTop} ${targetX},${targetTop}`,
        `L${targetX},${targetBottom}`,
        `C${targetX - curve},${targetBottom} ${sourceX + curve},${sourceBottom} ${sourceX},${sourceBottom}`,
        'Z',
      ].join('');
    };
    const linkPathGen = useRibbonLinks ? ribbonLinkPathGen : centerLinkPathGen;
    const linkOpacityAttr = useRibbonLinks ? 'fill-opacity' : 'stroke-opacity';
    const linkColorMode = cfg.linkColorMode ?? 'from';

    const getSourceColor = (d: any) =>
      d.source.color || colors[graph.nodes.indexOf(d.source) % colors.length] || '#aaa';
    const getTargetColor = (d: any) =>
      d.target.color || colors[graph.nodes.indexOf(d.target) % colors.length] || '#aaa';

    const defs = this.group.append('defs');
    const clipId = `katucharts-sankey-clip-${this.config.index}-${Math.random().toString(36).slice(2, 8)}`;
    defs.append('clipPath')
      .attr('id', clipId)
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', plotArea.width)
      .attr('height', plotArea.height);

    const clippedLayer = this.group.append('g')
      .attr('class', 'katucharts-sankey-clipped-layer')
      .attr('clip-path', `url(#${clipId})`);
    const linksLayer = clippedLayer.append('g').attr('class', 'katucharts-sankey-links');
    const nodesLayer = clippedLayer.append('g').attr('class', 'katucharts-sankey-nodes');
    const hitAreaLayer = clippedLayer.append('g').attr('class', 'katucharts-sankey-link-hitareas');

    let gradientDefs: any = null;
    if (linkColorMode === 'gradient') {
      gradientDefs = defs;
    }

    const linkPaths = linksLayer.selectAll('.katucharts-sankey-link')
      .data(graph.links)
      .join('path')
      .attr('class', 'katucharts-sankey-link')
      .attr('d', linkPathGen)
      .attr('fill', useRibbonLinks ? '#aaa' : 'none')
      .attr('stroke', useRibbonLinks ? 'none' : '#aaa')
      .attr('stroke-width', (d: any) => useRibbonLinks ? null : Math.max(minLinkWidth, d.width))
      .attr('stroke-linecap', 'butt')
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
        select(this).attr(useRibbonLinks ? 'fill' : 'stroke', `url(#${gradId})`);
      });
    } else if (linkColorMode === 'to') {
      linkPaths.attr(useRibbonLinks ? 'fill' : 'stroke', (d: any) => getTargetColor(d));
    } else {
      linkPaths.attr(useRibbonLinks ? 'fill' : 'stroke', (d: any) => getSourceColor(d));
    }

    if (animate && !isUltraNarrow) {
      if (isNarrow) {
        linkPaths.attr(linkOpacityAttr, 0)
          .each(function(this: any, d: any) {
            const dep = getNodeColumn(d.source);
            const colLinks = linksBySourceDepth.get(dep) || [];
            const linkIdx = colLinks.indexOf(d);
            const delay = dep * colStep + nodeDur - 60 + Math.min(linkIdx * 12, 60);
            select(this)
              .transition('enter').duration(linkDur).delay(delay).ease(EASE_ENTRY)
              .attr(linkOpacityAttr, getLinkOpacity(d));
          });
      } else {
        linkPaths.attr(linkOpacityAttr, (d: any) => getLinkOpacity(d))
          .each(function(this: any, d: any) {
            const pathEl = this as SVGPathElement;
            const totalLength = pathEl.getTotalLength?.() || 0;
            if (totalLength === 0) return;
            const dep = getNodeColumn(d.source);
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
      }
    } else {
      linkPaths.attr(linkOpacityAttr, (d: any) => getLinkOpacity(d));
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
      linkPaths.attr(linkOpacityAttr, (l: any) => l === d ? Math.min(opacity + 0.3, 1) : getLinkOpacity(l));
      linkPaths.filter((l: any) => l !== d).transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER).attr(linkOpacityAttr, opacity * 0.375);
      nodeRects.attr('opacity', 1);
      nodeRects.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER)
        .attr('opacity', (n: any) => n === d.source || n === d.target ? 1 : 0.4);
      emitLinkPoint('mouseover', event, d);
    };

    const handleLinkMouseOut = (event: MouseEvent, d: any) => {
      linkPaths.interrupt('highlight');
      nodeRects.interrupt('highlight');
      linkPaths.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER)
        .attr(linkOpacityAttr, (l: any) => getLinkOpacity(l));
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

    const nodeRects = nodesLayer.selectAll('.katucharts-sankey-node')
      .data(graph.nodes)
      .join('rect')
      .attr('class', 'katucharts-sankey-node')
      .attr('x', (d: any) => d.x0)
      .attr('y', (d: any) => d.y0)
      .attr('width', (d: any) => d.x1 - d.x0)
      .attr('height', (d: any) => Math.max(1, d.y1 - d.y0))
      .attr('fill', (d: any, i: number) => {
        if (d.color) return d.color;
        const lvlCfg = levelMap.get(getNodeColumn(d));
        if (lvlCfg?.color) return lvlCfg.color;
        return colorByPoint ? colors[i % colors.length] : (cfg.color || colors[0]);
      })
      .attr('stroke', nodeBorderColor)
      .attr('stroke-width', nodeBorderWidth)
      .attr('rx', 4)
      .style('cursor', 'pointer');

    if (animate && !isUltraNarrow) {
      nodeRects
        .attr('opacity', 0)
        .attr('x', (d: any) => d.x0 - (isVeryNarrow ? 4 : 10))
        .each(function(this: any, d: any) {
          const dep = getNodeColumn(d);
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
          .attr(linkOpacityAttr, (l: any) =>
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
          .attr(linkOpacityAttr, (l: any) => getLinkOpacity(l));
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

    hitAreaLayer.selectAll('.katucharts-sankey-link-hitarea')
      .data(graph.links)
      .join('path')
      .attr('class', 'katucharts-sankey-link-hitarea')
      .attr('d', centerLinkPathGen)
      .attr('fill', 'none')
      .attr('stroke', 'transparent')
      .attr('stroke-linecap', 'round')
      .attr('stroke-width', (d: any) => Math.max(16, Math.max(minLinkWidth, d.width) + 10))
      .style('cursor', 'pointer')
      .on('mouseover', handleLinkMouseOver)
      .on('mouseout', handleLinkMouseOut)
      .on('click', handleLinkClick);

    if (dlEnabled) {
      const labelsGroup = this.group.append('g')
        .attr('class', 'katucharts-sankey-labels');

      const minNodeHeightForLabel = Math.max(6, effectiveFontPx * 0.6);
      const maxNodeX0 = graph.nodes.reduce((m: number, n: any) => Math.max(m, n.x0 ?? 0), 0);

      // Pick label text per node, honouring formatter + min-height.
      const labelTextByNode = new Map<any, string>();
      for (const d of graph.nodes) {
        const nodeHeight = d.y1 - d.y0;
        if (nodeHeight < minNodeHeightForLabel) {
          labelTextByNode.set(d, '');
          continue;
        }
        labelTextByNode.set(d, getNodeLabel(d));
      }

      // Initial placement: last-column leaves get `start` anchor + x = node.x1+4
      // so the label text extends rightward into the reserved label pad. Every
      // other node uses `middle` anchor centred on the rect (Highcharts `inside`
      // default) so labels sit on/over tall middle-column nodes.
      const isLastCol = (d: any) => hasExplicitColumns
        ? getNodeColumn(d) === maxDepth
        : maxNodeX0 > 0 && (d.x0 ?? 0) >= maxNodeX0 - 0.5;
      const shouldUseExternalLabel = (d: any) => reserveExternalLastLabels && isLastCol(d);
      // Last column flows right into the reserved right pad; every other
      // column (including the first, which now has its own small left pad)
      // uses Highcharts `inside: true` placement — middle-anchor on the rect
      // centre, letting the text overflow the narrow rect horizontally.
      const initialAnchorFor = (d: any) => shouldUseExternalLabel(d) ? 'start' : 'middle';
      const initialXFor = (d: any) => shouldUseExternalLabel(d)
        ? d.x1 + 4 + (dlCfg.x ?? 0)
        : (d.x0 + d.x1) / 2 + (dlCfg.x ?? 0);

      const labelNodes = labelsGroup.selectAll('.katucharts-sankey-label')
        .data(graph.nodes)
        .join('text')
        .attr('class', 'katucharts-sankey-label')
        .attr('x', initialXFor)
        .attr('y', (d: any) => (d.y0 + d.y1) / 2 + (dlCfg.y ?? 0))
        .attr('dy', '0.35em')
        .attr('text-anchor', initialAnchorFor)
        .attr('font-size', dlFontSize)
        .attr('font-weight', (dlCfg.style as any)?.fontWeight ?? 600)
        .attr('fill', dlColor)
        .attr('paint-order', 'stroke')
        .attr('stroke', (dlCfg.style as any)?.textOutline ? null : 'white')
        .attr('stroke-width', (dlCfg.style as any)?.textOutline ? null : 2)
        .attr('stroke-linejoin', 'round')
        .style('pointer-events', 'none')
        .text((d: any) => labelTextByNode.get(d) ?? '');

      // Justify pass: if a middle-anchored label's bbox overflows a plot edge,
      // re-anchor it on the node side with more room (mirrors the Highcharts
      // `justifyDataLabel` behaviour). Labels that still do not fit are either
      // truncated to the available width or cleared entirely.
      const colMin = new Map<number, number>();
      const colMax = new Map<number, number>();
      for (const n of graph.nodes) {
        const dep = getNodeColumn(n);
        colMin.set(dep, Math.min(colMin.get(dep) ?? Infinity, n.x0));
        colMax.set(dep, Math.max(colMax.get(dep) ?? -Infinity, n.x1));
      }
      // Deterministic char-based width estimate. We avoid getComputedTextLength
      // here because it returns 0 before the browser performs a layout, which
      // caused first-column labels to silently skip the justify branch and
      // stay centred on the narrow rect (with their bbox hanging off the plot
      // and getting cleared later by the overlap pass).
      labelNodes.each(function(this: any, d: any) {
        const el = this as SVGTextElement;
        let text = el.textContent;
        if (!text) return;
        const labelW = estimateWidth(text);
        if (shouldUseExternalLabel(d)) {
          const avail = plotArea.width - (d.x1 + 4) - 2;
          if (avail <= charW) { el.textContent = ''; return; }
          if (labelW > avail) {
            text = truncateToFit(text, avail, 1);
            el.textContent = text;
          }
          return;
        }
        const cx = (d.x0 + d.x1) / 2;
        const left = cx - labelW / 2;
        const right = cx + labelW / 2;
        if (right <= plotArea.width && left >= 0) return;

        const dep = getNodeColumn(d);
        const nextColStart = colMin.get(dep + 1) ?? plotArea.width;
        const prevColEnd = colMax.get(dep - 1) ?? 0;
        const gapRight = nextColStart - d.x1 - 4;
        const gapLeft = d.x0 - prevColEnd - 4;

        if (left < 0 && gapRight > effectiveFontPx * 1.5) {
          el.setAttribute('text-anchor', 'start');
          el.setAttribute('x', String(d.x1 + 2));
          if (labelW > gapRight) el.textContent = truncateToFit(text, gapRight);
          return;
        }
        if (right > plotArea.width && gapLeft > effectiveFontPx * 1.5) {
          el.setAttribute('text-anchor', 'end');
          el.setAttribute('x', String(d.x0 - 2));
          if (labelW > gapLeft) el.textContent = truncateToFit(text, gapLeft);
          return;
        }
        const centerAvail = 2 * Math.min(cx, plotArea.width - cx) - 4;
        if (centerAvail < effectiveFontPx * 2) {
          el.textContent = '';
          return;
        }
        el.textContent = truncateToFit(text, centerAvail);
      });

      // Highcharts-style overlap hiding: iterate labels in descending value
      // order (larger flows = higher priority) and hide any whose bbox
      // intersects a previously-kept label's bbox. Keeps the chart readable
      // on narrow widths where dozens of leaves would otherwise collide.
      type Kept = { left: number; right: number; top: number; bottom: number };
      const keptBoxes: Kept[] = [];
      const nodesByPriority = [...graph.nodes].sort((a: any, b: any) =>
        (b.value ?? 0) - (a.value ?? 0));
      const labelByNode = new Map<any, SVGTextElement>();
      labelNodes.each(function(this: any, d: any) {
        labelByNode.set(d, this as SVGTextElement);
      });
      const intersects = (a: Kept, b: Kept) =>
        a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      for (const d of nodesByPriority) {
        if (dlCfg.allowOverlap === true) break;
        const el = labelByNode.get(d);
        if (!el || !el.textContent) continue;
        let bbox;
        try {
          bbox = el.getBBox();
        } catch {
          const width = estimateWidth(el.textContent || '');
          const x = Number(el.getAttribute('x') || 0);
          const anchor = el.getAttribute('text-anchor');
          bbox = {
            x: anchor === 'end' ? x - width : anchor === 'middle' ? x - width / 2 : x,
            y: Number(el.getAttribute('y') || 0) - effectiveFontPx / 2,
            width,
            height: effectiveFontPx,
          };
        }
        if (bbox.width === 0 && bbox.height === 0) continue;
        const box = {
          left: bbox.x, right: bbox.x + bbox.width,
          top: bbox.y, bottom: bbox.y + bbox.height,
        };
        const clash = keptBoxes.some(k => intersects(k, box));
        if (clash && dlCfg.overflow !== 'allow') {
          el.textContent = '';
          continue;
        }
        keptBoxes.push(box);
      }

      if (animate && !isUltraNarrow) {
        labelNodes.attr('opacity', 0)
          .each(function(this: any, d: any) {
            const dep = getNodeColumn(d);
            const colNodes = nodesByDepth.get(dep) || [];
            const nodeIdx = colNodes.indexOf(d);
            const delay = dep * colStep + nodeDur - 80 + Math.min(nodeIdx * 20, 80);
            select(this).transition('enter').duration(nodeDur).delay(delay).ease(EASE_ENTRY)
              .attr('opacity', 1);
          });
      }
    }

    if (animate) {
      this.emitAfterAnimate(isUltraNarrow ? 0 : totalAnimDur + 100);
    }
  }

  private applyExplicitColumnLayout(
    graph: any,
    sankeyGen: any,
    getNodeColumn: (node: any) => number,
    maxColumn: number,
    left: number,
    right: number,
    plotHeight: number,
    nodePadding: number,
    nodeWidth: number
  ): number {
    const columns = new Map<number, any[]>();
    for (const node of graph.nodes) {
      const column = getNodeColumn(node);
      node.depth = column;
      node.layer = column;
      if (!columns.has(column)) columns.set(column, []);
      columns.get(column)!.push(node);
    }

    const orderedColumns = Array.from(columns.entries()).sort((a, b) => a[0] - b[0]);
    const maxNodesInColumn = Math.max(1, ...orderedColumns.map(([, nodes]) => nodes.length));
    const effectivePadding = maxNodesInColumn > 1
      ? Math.min(nodePadding, Math.max(1, plotHeight / (maxNodesInColumn - 1)))
      : nodePadding;

    const sums = orderedColumns
      .map(([, colNodes]) => colNodes.reduce((sum: number, node: any) => sum + Math.max(0, node.value ?? 0), 0))
      .filter(sum => sum > 0);
    const ky = sums.length > 0
      ? Math.min(...orderedColumns.map(([, colNodes]) => {
          const total = colNodes.reduce((sum: number, node: any) => sum + Math.max(0, node.value ?? 0), 0);
          if (total <= 0) return Infinity;
          return Math.max(0.0001, (plotHeight - Math.max(0, colNodes.length - 1) * effectivePadding) / total);
        }))
      : 1;

    const xStep = maxColumn > 0 ? (right - left - nodeWidth) / maxColumn : 0;
    for (const [column, colNodes] of orderedColumns) {
      colNodes.sort((a: any, b: any) =>
        (a.offset ?? 0) - (b.offset ?? 0) ||
        (a.y0 ?? 0) - (b.y0 ?? 0) ||
        String(a.name ?? a.id).localeCompare(String(b.name ?? b.id))
      );

      const colHeight = colNodes.reduce((sum: number, node: any) => sum + Math.max(1, (node.value ?? 0) * ky), 0)
        + Math.max(0, colNodes.length - 1) * effectivePadding;
      let y = Math.max(0, (plotHeight - colHeight) / 2);
      const x = left + column * xStep;

      for (const node of colNodes) {
        const h = Math.max(1, (node.value ?? 0) * ky);
        node.x0 = x;
        node.x1 = x + nodeWidth;
        node.y0 = y;
        node.y1 = y + h;
        y = node.y1 + effectivePadding;
      }
    }

    for (const link of graph.links) {
      link.width = Math.max(0.0001, link.value * ky);
    }
    for (const node of graph.nodes) {
      node.sourceLinks?.sort((a: any, b: any) => (a.target.y0 ?? 0) - (b.target.y0 ?? 0));
      node.targetLinks?.sort((a: any, b: any) => (a.source.y0 ?? 0) - (b.source.y0 ?? 0));
    }
    sankeyGen.update(graph);
    return effectivePadding;
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
        const height = node.y1 - node.y0;
        const proposed = node.y0 + delta;
        node.y0 = Math.max(0, Math.min(plotHeight - height, proposed));
        node.y1 = node.y0 + height;
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

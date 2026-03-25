import { treemap, hierarchy, treemapSquarify, treemapBinary, treemapDice, treemapSlice, treemapSliceDice } from 'd3-hierarchy';
import { select } from 'd3-selection';
import { color as d3Color, hsl } from 'd3-color';
import 'd3-transition';
import { BaseSeries } from '../BaseSeries';
import type { InternalSeriesConfig, TreemapLevelOptions, BorderRadiusOptions } from '../../types/options';
import { templateFormat } from '../../utils/format';

function resolveBorderRadius(val: number | BorderRadiusOptions | undefined): number {
  if (val === undefined) return 4;
  if (typeof val === 'number') return val;
  return val.radius ?? 4;
}

export class TreemapSeries extends BaseSeries {
  private currentRoot: any = null;

  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  render(): void {
    const { plotArea, colors } = this.context;
    const animate = this.context.animate;
    const data = this.data;
    const levels: TreemapLevelOptions[] = (this.config as any).levels || [];
    const colorByPoint = this.config.colorByPoint !== false;
    const allowTraversing = (this.config as any).allowTraversingTree === true || (this.config as any).allowDrillToNode === true;
    const interactByLeaf = (this.config as any).interactByLeaf ?? (allowTraversing ? false : true);
    const alternateDirection = (this.config as any).alternateStartingDirection === true;
    const inactiveOpacity = this.config.states?.inactive?.opacity ?? 0.4;

    const root = this.buildHierarchy(data);

    const renderNode = allowTraversing && this.currentRoot
      ? this.currentRoot
      : root;

    const tileAlgorithms: Record<string, any> = {
      squarify: treemapSquarify,
      squarified: treemapSquarify,
      binary: treemapBinary,
      dice: treemapDice,
      slice: treemapSlice,
      sliceDice: treemapSliceDice,
      sliceAndDice: treemapSliceDice,
      strip: treemapSlice,
      stripes: treemapSlice,
    };
    const defaultAlgo = (this.config as any).layoutAlgorithm || 'squarified';
    const algorithm = tileAlgorithms[defaultAlgo] || treemapSquarify;
    const layoutStartDir = (this.config as any).layoutStartingDirection || 'vertical';
    const seriesOpacity = this.config.opacity ?? 1;

    const resolvedTile = alternateDirection
      ? treemapSliceDice
      : (defaultAlgo === 'sliceAndDice' || defaultAlgo === 'sliceDice')
        ? (layoutStartDir === 'horizontal' ? treemapSliceDice : treemapSliceDice)
        : algorithm;

    const sortFn = (a: any, b: any) => {
      const aSort = a.data?.sortIndex ?? 0;
      const bSort = b.data?.sortIndex ?? 0;
      if (aSort !== bSort) return aSort - bSort;
      return (b.value || 0) - (a.value || 0);
    };
    renderNode.sort(sortFn);

    treemap()
      .size([plotArea.width, plotArea.height])
      .tile(resolvedTile)
      .padding(1)
      (renderNode);

    const leaves = (allowTraversing && !interactByLeaf)
      ? (renderNode.children || renderNode.leaves())
      : renderNode.leaves();

    const getLevelConfig = (depth: number): TreemapLevelOptions | undefined =>
      levels.find(l => l.level === depth);

    const getNodeColor = (d: any, i: number): string => {
      if (d.data.color) return d.data.color;
      const lc = getLevelConfig(d.depth);
      if (lc?.color) {
        const variation = lc.colorVariation;
        if (variation?.key === 'brightness' && d.parent?.children) {
          const siblings = d.parent.children;
          const idx = siblings.indexOf(d);
          const total = siblings.length;
          const factor = total > 1 ? -0.5 + (idx / (total - 1)) * (variation.to ?? 0.5) : 0;
          const hslC = hsl(d3Color(lc.color)?.toString() || lc.color);
          hslC.l = Math.max(0.1, Math.min(0.95, hslC.l + factor * 0.3));
          return hslC.toString();
        }
        return lc.color;
      }
      if (colorByPoint) {
        const baseColor = colors[i % colors.length];
        const parentLc = d.parent ? getLevelConfig(d.parent.depth) : undefined;
        if (parentLc?.colorVariation?.key === 'brightness') {
          const siblings = d.parent?.children || [];
          const idx = siblings.indexOf(d);
          const total = siblings.length;
          const to = parentLc.colorVariation.to ?? 0.5;
          const factor = total > 1 ? (idx / (total - 1)) * to : to * 0.5;
          const hslC = hsl(d3Color(baseColor)?.toString() || baseColor);
          hslC.l = Math.max(0.1, Math.min(0.95, hslC.l + factor * 0.3));
          return hslC.toString();
        }
        return baseColor;
      }
      return this.getColor();
    };

    const cells = this.group.selectAll('.katucharts-treemap-cell')
      .data(leaves)
      .join('rect')
      .attr('class', 'katucharts-treemap-cell')
      .attr('x', (d: any) => d.x0)
      .attr('y', (d: any) => d.y0)
      .attr('width', (d: any) => Math.max(0, d.x1 - d.x0))
      .attr('height', (d: any) => Math.max(0, d.y1 - d.y0))
      .attr('fill', (d: any, i: number) => getNodeColor(d, i))
      .attr('stroke', (d: any) => {
        const lc = getLevelConfig(d.depth);
        return lc?.borderColor || this.config.borderColor || '#ffffff';
      })
      .attr('stroke-width', (d: any) => {
        const lc = getLevelConfig(d.depth);
        return lc?.borderWidth ?? this.config.borderWidth ?? 1;
      })
      .attr('rx', resolveBorderRadius(this.config.borderRadius))
      .style('cursor', this.config.cursor || 'pointer');

    if (animate) {
      cells.attr('opacity', 0)
        .transition().duration(600).delay((_: any, i: number) => i * 50)
        .attr('opacity', seriesOpacity);
    } else if (seriesOpacity !== 1) {
      cells.attr('opacity', seriesOpacity);
    }

    if (this.config.enableMouseTracking !== false) {
      cells
        .on('mouseover', (event: MouseEvent, d: any) => {
          const target = select(event.currentTarget as SVGRectElement);
          const fill = target.attr('fill');
          const brightness = this.config.states?.hover?.brightness ?? 0.3;
          const brighter = d3Color(fill)?.brighter(brightness)?.toString() || fill;
          target.transition('fill').duration(150).attr('fill', brighter);
          target.style('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))');
          cells.interrupt('highlight');
          cells.attr('opacity', 1);
          cells.filter((o: any) => o !== d).transition('highlight').duration(150).attr('opacity', inactiveOpacity);

          const i = leaves.indexOf(d);
          this.context.events.emit('point:mouseover', {
            point: d.data, index: i, series: this, event,
            plotX: (d.x0 + d.x1) / 2, plotY: (d.y0 + d.y1) / 2,
          });
          d.data.events?.mouseOver?.call(d.data, event);
        })
        .on('mouseout', (event: MouseEvent, d: any) => {
          const target = select(event.currentTarget as SVGRectElement);
          const i = leaves.indexOf(d);
          const origColor = getNodeColor(d, i);
          target.transition('fill').duration(150).attr('fill', origColor);
          target.style('filter', '');
          cells.interrupt('highlight');
          cells.transition('highlight').duration(150).attr('opacity', 1);

          this.context.events.emit('point:mouseout', { point: d.data, index: i, series: this, event });
          d.data.events?.mouseOut?.call(d.data, event);
        })
        .on('click', (event: MouseEvent, d: any) => {
          const i = leaves.indexOf(d);

          if (allowTraversing && d.children) {
            this.currentRoot = d;
            this.group.selectAll('*').remove();
            this.render();
            return;
          }

          this.context.events.emit('point:click', { point: d.data, index: i, series: this, event });
          d.data.events?.click?.call(d.data, event);
          this.config.events?.click?.call(this, event);
        });
    }

    if (allowTraversing && this.currentRoot && this.currentRoot !== root) {
      this.renderBreadcrumbs(plotArea, root);
    }

    this.renderLabels(leaves, getLevelConfig);
  }

  private buildHierarchy(data: any[]): any {
    const hasChildren = data.some(d => d.children && d.children.length > 0);

    if (hasChildren) {
      const prepareNested = (items: any[]): any[] =>
        items.map(d => {
          const item: any = { ...d, value: d.y ?? d.value ?? (d.children ? 0 : 1) };
          if (item.children) item.children = prepareNested(item.children);
          return item;
        });

      return hierarchy({ children: prepareNested(data) } as any)
        .sum((d: any) => d.children ? 0 : (d.value || 0));
    }

    return hierarchy({ children: data.map(d => ({ ...d, value: d.y ?? d.value ?? 1 })) } as any)
      .sum((d: any) => d.value || 0);
  }

  /**
   * Renders breadcrumb navigation trail showing the path from root to current node.
   */
  private renderBreadcrumbs(plotArea: any, root: any): void {
    const breadcrumbsCfg = (this.config as any).breadcrumbs || {};
    const position = breadcrumbsCfg.position || {};
    const bx = position.x ?? 0;
    const by = position.y ?? -20;
    const separator = breadcrumbsCfg.separator ?? ' / ';
    const style = breadcrumbsCfg.style || {};
    const fontSize = (style.fontSize as string) || '11px';
    const fontColor = (style.color as string) || '#333';

    const trail: any[] = [];
    let node = this.currentRoot;
    while (node) {
      trail.unshift(node);
      node = node.parent;
    }

    const crumbG = this.group.append('g')
      .attr('class', 'katucharts-treemap-breadcrumbs')
      .attr('transform', `translate(${bx},${by})`);

    let offsetX = 0;

    trail.forEach((n, i) => {
      const name = n.data?.name || (i === 0 ? 'Root' : `Level ${i}`);
      const isLast = i === trail.length - 1;

      const crumb = crumbG.append('text')
        .attr('x', offsetX)
        .attr('y', 0)
        .attr('font-size', fontSize)
        .attr('fill', isLast ? '#999' : '#2f7ed8')
        .attr('dominant-baseline', 'middle')
        .style('cursor', isLast ? 'default' : 'pointer')
        .style('text-decoration', isLast ? 'none' : 'underline')
        .text(name);

      if (!isLast) {
        crumb.on('click', () => {
          this.currentRoot = n === root ? null : n;
          this.group.selectAll('*').remove();
          this.render();
        });
      }

      const textLen = (crumb.node() as SVGTextElement)?.getComputedTextLength?.() || name.length * 7;
      offsetX += textLen;

      if (!isLast) {
        crumbG.append('text')
          .attr('x', offsetX)
          .attr('y', 0)
          .attr('font-size', fontSize)
          .attr('fill', fontColor)
          .attr('dominant-baseline', 'middle')
          .style('pointer-events', 'none')
          .text(separator);
        offsetX += separator.length * 5;
      }
    });
  }

  private renderLabels(leaves: any[], getLevelConfig: (d: number) => TreemapLevelOptions | undefined): void {
    const dlCfg = this.config.dataLabels || {};
    const dlEnabled = dlCfg.enabled !== false;
    if (!dlEnabled) return;

    const defaultFontSize = (dlCfg.style?.fontSize as string) || '11px';
    const defaultFontColor = dlCfg.color || (dlCfg.style?.color as string) || '#333';

    const labels = this.group.selectAll('.katucharts-treemap-label')
      .data(leaves)
      .join('text')
      .attr('class', 'katucharts-treemap-label')
      .attr('x', (d: any) => d.x0 + 4 + (dlCfg.x ?? 0))
      .attr('y', (d: any) => d.y0 + 14 + (dlCfg.y ?? 0))
      .text((d: any) => {
        const lc = getLevelConfig(d.depth);
        const lcDl = lc?.dataLabels;
        if (lcDl?.enabled === false) return '';

        if (dlCfg.formatter) {
          return dlCfg.formatter.call({
            point: d.data, series: { name: this.config.name },
            x: d.data.x, y: d.data.y ?? d.data.value,
          });
        }
        if (dlCfg.format) {
          return templateFormat(dlCfg.format, {
            point: d.data, x: d.data.x, y: d.data.y ?? d.data.value,
          });
        }
        return d.data.name || '';
      })
      .attr('fill', defaultFontColor)
      .attr('font-size', defaultFontSize)
      .style('pointer-events', 'none')
      .each(function(d: any) {
        const w = d.x1 - d.x0;
        const h = d.y1 - d.y0;
        if (w < 30 || h < 16) (this as SVGTextElement).textContent = '';
      });

    if (this.context.animate) {
      labels.attr('opacity', 0)
        .transition().duration(400).delay((_: any, i: number) => 300 + i * 50)
        .attr('opacity', 1);
    }
  }

  getDataExtents() {
    return { xMin: 0, xMax: 0, yMin: 0, yMax: 0 };
  }
}

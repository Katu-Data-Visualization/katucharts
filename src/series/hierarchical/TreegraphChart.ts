/**
 * Tidy-tree layout for hierarchical node/edge data. Accepts either parent/id
 * rows or nested children; emits circles for nodes and
 * smooth paths for edges.
 */

import { hierarchy, stratify, tree, cluster } from 'd3-hierarchy';
import { linkHorizontal, linkVertical } from 'd3-shape';
import 'd3-transition';
import { BaseSeries } from '../BaseSeries';
import type { InternalSeriesConfig } from '../../types/options';
import { DEFAULT_CHART_TEXT_COLOR, DEFAULT_CHART_TEXT_SIZE } from '../../utils/chartText';
import { ENTRY_DURATION, EASE_ENTRY } from '../../core/animationConstants';

type Orientation = 'horizontal' | 'vertical';

interface TreegraphNodeDatum {
  id?: string | number;
  parent?: string | number;
  name?: string;
  value?: number;
  color?: string;
  children?: TreegraphNodeDatum[];
  [k: string]: any;
}

export class TreegraphChart extends BaseSeries {
  constructor(config: InternalSeriesConfig) {
    super(config);
    config.clip = false;
  }

  render(): void {
    const { plotArea, colors } = this.context;
    const rawData = (this.data as TreegraphNodeDatum[]) || [];
    if (!rawData.length) return;

    const orientation: Orientation =
      (this.config as any).layout === 'vertical' ? 'vertical' : 'horizontal';
    const link = (this.config as any).link || {};
    const nodeRadius = (this.config as any).marker?.radius ?? 6;
    const linkColor = link.color || '#cccccc';
    const linkWidth = link.lineWidth ?? 1;
    const useCluster = (this.config as any).layoutAlgorithm === 'cluster';
    const levels: any[] = (this.config as any).levels || [];
    const dataLabels = this.config.dataLabels || {};
    const labelFontSize = (dataLabels.style?.fontSize as string) || DEFAULT_CHART_TEXT_SIZE;
    const labelColor = dataLabels.color || (dataLabels.style?.color as string) || DEFAULT_CHART_TEXT_COLOR;

    const root = this.buildRoot(rawData);
    if (!root) return;

    const layoutSize: [number, number] = orientation === 'horizontal'
      ? [plotArea.height, plotArea.width]
      : [plotArea.width, plotArea.height];
    const layout = useCluster ? cluster() : tree();
    layout.size(layoutSize);
    layout(root);

    const nodeX = (d: any) => orientation === 'horizontal' ? d.y : d.x;
    const nodeY = (d: any) => orientation === 'horizontal' ? d.x : d.y;
    const linkGen = orientation === 'horizontal'
      ? linkHorizontal<any, any>().x((d: any) => nodeX(d)).y((d: any) => nodeY(d))
      : linkVertical<any, any>().x((d: any) => nodeX(d)).y((d: any) => nodeY(d));

    const rootGroup = this.group.append('g').attr('class', 'katucharts-treegraph');

    const nodes = root.descendants();
    const linksData = root.links();

    const levelColor = (depth: number): string => {
      const lvl = levels.find((l: any) => l.level === depth);
      if (lvl?.color) return lvl.color;
      return colors[depth % Math.max(1, colors.length)] || '#2f7ed8';
    };

    rootGroup.append('g')
      .attr('class', 'katucharts-treegraph-links')
      .selectAll('path')
      .data(linksData)
      .join('path')
      .attr('d', (d: any) => linkGen(d) as string)
      .attr('fill', 'none')
      .attr('stroke', linkColor)
      .attr('stroke-width', linkWidth);

    const nodeGroup = rootGroup.append('g')
      .attr('class', 'katucharts-treegraph-nodes')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .attr('transform', (d: any) => `translate(${nodeX(d)},${nodeY(d)})`);

    nodeGroup.append('circle')
      .attr('r', nodeRadius)
      .attr('fill', (d: any) => d.data?.color || levelColor(d.depth))
      .attr('stroke', this.autoBorderColor())
      .attr('stroke-width', 1);

    if (dataLabels.enabled !== false) {
      nodeGroup.append('text')
        .attr('dy', orientation === 'horizontal' ? '0.32em' : nodeRadius + 12)
        .attr('x', orientation === 'horizontal' ? (d: any) => d.children ? -(nodeRadius + 4) : (nodeRadius + 4) : 0)
        .attr('text-anchor', orientation === 'horizontal'
          ? (d: any) => d.children ? 'end' : 'start'
          : 'middle')
        .attr('font-size', labelFontSize)
        .attr('fill', labelColor)
        .style('pointer-events', 'none')
        .text((d: any) => d.data?.name ?? d.data?.id ?? '');
    }

    if (this.context.animate) {
      rootGroup.attr('opacity', 0)
        .transition()
        .duration(ENTRY_DURATION)
        .ease(EASE_ENTRY)
        .attr('opacity', 1);
    }
  }

  private buildRoot(data: TreegraphNodeDatum[]): any | null {
    const hasNested = data.some(d => d.children && d.children.length > 0);
    if (hasNested) {
      return hierarchy(
        { name: 'root', children: data } as any,
        (d: any) => d.children,
      );
    }

    const rowsWithId = data.filter(d => d.id !== undefined && d.id !== null);
    if (!rowsWithId.length) return null;

    const hasSingleRoot = rowsWithId.filter(d => !d.parent).length <= 1;
    if (!hasSingleRoot) {
      const syntheticRootId = '__katu_treegraph_root__';
      const normalized = rowsWithId.map(d => ({
        ...d,
        parent: d.parent || syntheticRootId,
      }));
      normalized.push({ id: syntheticRootId, parent: '', name: '' } as any);
      return stratify<any>()
        .id((d: any) => String(d.id))
        .parentId((d: any) => d.parent ? String(d.parent) : null)(normalized);
    }

    return stratify<any>()
      .id((d: any) => String(d.id))
      .parentId((d: any) => d.parent ? String(d.parent) : null)(rowsWithId);
  }

  getDataExtents() {
    return { xMin: Infinity, xMax: -Infinity, yMin: Infinity, yMax: -Infinity };
  }
}

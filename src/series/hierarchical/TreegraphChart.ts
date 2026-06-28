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
import { parseColor } from '../../utils/color';
import { ENTRY_DURATION, EASE_ENTRY } from '../../core/animationConstants';

type Orientation = 'horizontal' | 'vertical';

/**
 * Resolves a label halo into a stroke width/color drawn behind the text fill.
 * Accepts the `'<n>px <color>'` shorthand; defaults to a thin white halo so
 * labels stay legible over links and colored nodes.
 */
function parseTextOutline(outline: string | false | undefined): { width: number; color: string } | null {
  if (outline === false || outline === 'none' || outline === '0') return null;
  if (outline == null) return { width: 3, color: '#ffffff' };
  const m = /^([\d.]+)px\s+(.+)$/.exec(outline.trim());
  if (m) return { width: parseFloat(m[1]), color: /contrast/i.test(m[2]) ? '#ffffff' : m[2].trim() };
  return { width: 3, color: '#ffffff' };
}

interface TreegraphNodeDatum {
  id?: string | number;
  parent?: string | number;
  name?: string;
  value?: number;
  color?: string;
  children?: TreegraphNodeDatum[];
  [k: string]: any;
}

function isPresent(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

function toKey(value: string | number | undefined): string {
  return value === undefined ? '' : String(value);
}

function reserveUniqueId(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }

  let suffix = 2;
  let candidate = `${base}__${suffix}`;
  while (used.has(candidate)) {
    suffix += 1;
    candidate = `${base}__${suffix}`;
  }
  used.add(candidate);
  return candidate;
}

export function normalizeTreegraphRows(data: TreegraphNodeDatum[]): TreegraphNodeDatum[] {
  const rowsWithId = data.filter(d => isPresent(d.id));
  if (!rowsWithId.length) return [];

  const originalIds = new Set(rowsWithId.map(d => toKey(d.id)));
  const missingParentIds = new Set<string>();

  for (const row of rowsWithId) {
    const parent = toKey(row.parent);
    if (parent && !originalIds.has(parent)) {
      missingParentIds.add(parent);
    }
  }

  const implicitParents: TreegraphNodeDatum[] = Array.from(missingParentIds).map(id => ({
    id,
    parent: '',
    name: id,
  }));

  const rows = [...implicitParents, ...rowsWithId];
  const idCounts = rows.reduce((counts, row) => {
    const id = toKey(row.id);
    counts.set(id, (counts.get(id) || 0) + 1);
    return counts;
  }, new Map<string, number>());

  const usedIds = new Set<string>();
  const idMap = new Map<TreegraphNodeDatum, string>();
  const canonicalIdByOriginal = new Map<string, string>();

  rows.forEach((row, index) => {
    const originalId = toKey(row.id);
    const parent = toKey(row.parent);
    const duplicate = (idCounts.get(originalId) || 0) > 1;
    const baseId = duplicate
      ? `${parent || 'root'}::${originalId}::${index}`
      : originalId;
    const internalId = reserveUniqueId(baseId, usedIds);

    idMap.set(row, internalId);
    if (!canonicalIdByOriginal.has(originalId)) {
      canonicalIdByOriginal.set(originalId, internalId);
    }
  });

  return rows.map(row => {
    const parent = toKey(row.parent);
    const internalParent = parent ? canonicalIdByOriginal.get(parent) || '' : '';
    return {
      ...row,
      id: idMap.get(row)!,
      parent: internalParent,
      name: row.name ?? String(row.id),
    };
  });
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
    const markerFill = (this.config as any).marker?.fillColor;
    const markerLineWidth = (this.config as any).marker?.lineWidth;
    const linkColor = link.color || '#cccccc';
    const linkWidth = link.lineWidth ?? 1;
    const useCluster = (this.config as any).layoutAlgorithm === 'cluster';
    const levels: any[] = (this.config as any).levels || [];
    const dataLabels = this.config.dataLabels || {};
    const labelsEnabled = dataLabels.enabled !== false;
    const labelFontSize = (dataLabels.style?.fontSize as string) || DEFAULT_CHART_TEXT_SIZE;
    const labelColor = dataLabels.color || (dataLabels.style?.color as string) || DEFAULT_CHART_TEXT_COLOR;
    const labelOffsetX = (dataLabels as any).x;
    const labelOffsetY = (dataLabels as any).y ?? 0;
    const outline = parseTextOutline(dataLabels.style?.textOutline as any);

    const root = this.buildRoot(rawData);
    if (!root) return;

    /**
     * Compress the depth axis so the tree clusters toward the start, leaving the
     * far side free for node labels to extend into; the cross axis fills the plot.
     */
    const depthCount = Math.max(1, root.height);
    const crossSize = orientation === 'horizontal' ? plotArea.height : plotArea.width;
    const depthExtent = orientation === 'horizontal' ? plotArea.width : plotArea.height;
    const levelGap = labelsEnabled
      ? Math.min(160, (depthExtent * 0.5) / depthCount)
      : depthExtent / depthCount;
    const layout = useCluster ? cluster() : tree();
    layout.size([crossSize, levelGap * depthCount]);
    layout(root);

    this.assignColors(root, levels, colors);

    const nodeX = (d: any) => orientation === 'horizontal' ? d.y : d.x;
    const nodeY = (d: any) => orientation === 'horizontal' ? d.x : d.y;
    const linkGen = orientation === 'horizontal'
      ? linkHorizontal<any, any>().x((d: any) => nodeX(d)).y((d: any) => nodeY(d))
      : linkVertical<any, any>().x((d: any) => nodeX(d)).y((d: any) => nodeY(d));

    const rootGroup = this.group.append('g').attr('class', 'katucharts-treegraph');

    const nodes = root.descendants();
    const linksData = root.links();

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
      .attr('fill', (d: any) => markerFill ?? d.__color)
      .attr('stroke', (d: any) => markerFill ? d.__color : this.autoBorderColor())
      .attr('stroke-width', markerLineWidth ?? 1);

    if (labelsEnabled) {
      /**
       * Branch nodes label toward the start (their children sit on the far side),
       * leaves toward the end — so labels never collide with the next level.
       */
      const offsetX = labelOffsetX ?? (nodeRadius + 4);
      const text = nodeGroup.append('text')
        .attr('x', orientation === 'horizontal' ? (d: any) => d.children ? -offsetX : offsetX : 0)
        .attr('y', labelOffsetY)
        .attr('dy', orientation === 'horizontal' ? '0.32em' : nodeRadius + 12)
        .attr('text-anchor', orientation === 'horizontal' ? (d: any) => d.children ? 'end' : 'start' : 'middle')
        .attr('font-size', labelFontSize)
        .attr('fill', labelColor)
        .style('pointer-events', 'none')
        .text((d: any) => d.data?.name ?? d.data?.id ?? '');
      if (outline) {
        text.attr('stroke', outline.color)
          .attr('stroke-width', outline.width)
          .attr('paint-order', 'stroke')
          .style('stroke-linejoin', 'round');
      }
    }

    if (this.context.animate) {
      rootGroup.attr('opacity', 0)
        .transition()
        .duration(ENTRY_DURATION)
        .ease(EASE_ENTRY)
        .attr('opacity', 1);
    }
  }

  /**
   * Assigns a color to each node top-down following the level options: explicit
   * per-point or per-level color, `colorByPoint` cycling the palette across a
   * level, or `colorVariation` brightening the inherited parent color across
   * siblings. Result is stored as `__color` on each node.
   */
  private assignColors(root: any, levels: any[], colors: string[]): void {
    const counters = new Map<number, number>();
    const palette = colors.length ? colors : ['#2f7ed8'];
    root.each((node: any) => {
      const levelCfg = levels.find((l: any) => l.level === node.depth + 1);
      if (node.data?.color) {
        node.__color = node.data.color;
      } else if (levelCfg?.color) {
        node.__color = levelCfg.color;
      } else if (levelCfg?.colorByPoint) {
        const n = (counters.get(node.depth) ?? -1) + 1;
        counters.set(node.depth, n);
        node.__color = palette[n % palette.length];
      } else if (levelCfg?.colorVariation && node.parent?.__color) {
        const cv = levelCfg.colorVariation;
        const sibs: any[] = node.parent.children || [node];
        const frac = sibs.length > 1 ? sibs.indexOf(node) / (sibs.length - 1) : 0;
        const amount = (cv.key === 'brightness' ? (cv.to ?? 0) : 0) * frac * 10;
        node.__color = parseColor(node.parent.__color).brighten(amount).toString();
      } else if (node.parent?.__color) {
        node.__color = node.parent.__color;
      } else {
        node.__color = palette[node.depth % palette.length];
      }
    });
  }

  private buildRoot(data: TreegraphNodeDatum[]): any | null {
    const hasNested = data.some(d => d.children && d.children.length > 0);
    if (hasNested) {
      return hierarchy(
        { name: 'root', children: data } as any,
        (d: any) => d.children,
      );
    }

    const rowsWithId = normalizeTreegraphRows(data);
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

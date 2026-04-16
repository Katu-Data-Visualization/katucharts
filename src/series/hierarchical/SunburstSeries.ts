import { hierarchy, partition, stratify } from 'd3-hierarchy';
import { arc as d3Arc } from 'd3-shape';
import { interpolate } from 'd3-interpolate';
import { color as d3Color, hsl } from 'd3-color';
import { select } from 'd3-selection';
import 'd3-transition';
import { BaseSeries } from '../BaseSeries';
import type { InternalSeriesConfig } from '../../types/options';
import { DEFAULT_CHART_TEXT_COLOR, DEFAULT_CHART_TEXT_SIZE } from '../../utils/chartText';
import {
  ENTRY_DURATION,
  ENTRY_DELAY_BASE,
  ENTRY_STAGGER_PER_ITEM,
  HOVER_DURATION,
  EASE_ENTRY,
  EASE_HOVER,
} from '../../core/animationConstants';

interface LevelConfig {
  level: number;
  color?: string;
  colorByPoint?: boolean;
  colorVariation?: { key: string; to: number };
  levelSize?: { unit: 'weight' | 'percentage' | 'pixels'; value: number };
  dataLabels?: { enabled?: boolean; rotationMode?: string; filter?: { property: string; operator: string; value: number }; style?: Record<string, any> };
  borderColor?: string;
  borderWidth?: number;
}

export class SunburstSeries extends BaseSeries {
  private currentRoot: any = null;

  constructor(config: InternalSeriesConfig) {
    super(config);
    config.showInLegend = false;
  }

  render(): void {
    const { plotArea, colors } = this.context;
    const animate = this.context.animate;
    const levels: LevelConfig[] = (this.config as any).levels || [];
    const allowTraversing = (this.config as any).allowTraversingTree === true || (this.config as any).allowDrillToNode === true;
    const slicedOffset = (this.config as any).slicedOffset ?? 0;
    const inactiveOpacity = this.config.states?.inactive?.opacity ?? 0.4;

    const center = this.config.center || ['50%', '50%'];
    const cx = this.resolvePercent(center[0], plotArea.width);
    const cy = this.resolvePercent(center[1], plotArea.height);
    const configSize = this.config.size;
    const maxDim = Math.min(plotArea.width, plotArea.height);
    const radius = configSize
      ? this.resolvePercent(configSize, maxDim) / 2 - 5
      : maxDim / 2 - 5;

    const startAngleDeg = this.config.startAngle ?? 0;
    const endAngleDeg = this.config.endAngle ?? 360;
    const startAngle = startAngleDeg * Math.PI / 180;
    const endAngle = endAngleDeg * Math.PI / 180;
    const angleRange = endAngle - startAngle;

    const parentGroup = (this.group.node() as SVGElement)?.parentElement;
    if (parentGroup) {
      select(parentGroup).attr('clip-path', null);
    }

    const fullRoot = this.buildHierarchy(startAngle, angleRange);
    const rootId = (this.config as any).rootId;
    let displayRoot = fullRoot;

    if (allowTraversing && this.currentRoot) {
      displayRoot = this.currentRoot;
    } else if (rootId) {
      fullRoot.each((n: any) => {
        if (n.data?.id === rootId) displayRoot = n;
      });
    }

    const maxDepth = this.getMaxDepth(displayRoot);
    const levelIsConstant = (this.config as any).levelIsConstant !== false;
    const ringWidths = this.computeRingWidths(radius, maxDepth, levels);
    this.applyCustomRadii(displayRoot, ringWidths, levelIsConstant);
    this.assignColors(displayRoot, colors, levels);

    const borderRadiusVal = this.config.borderRadius !== undefined
      ? this.resolveBorderRadius(this.config.borderRadius) : 0;
    const arcGen = d3Arc<any>()
      .startAngle(d => d.x0)
      .endAngle(d => d.x1)
      .innerRadius(d => d._y0)
      .outerRadius(d => d._y1)
      .padAngle(0.005)
      .cornerRadius(borderRadiusVal);

    const g = this.group.append('g')
      .attr('transform', `translate(${cx},${cy})`);

    const descendants = displayRoot.descendants();
    const rootNode = descendants[0];
    const nonRoot = descendants.filter((d: any) => d.depth > 0);

    const rootRadius = rootNode._y1 || rootNode.y1;
    const rawRootColor = rootNode.data.color || this.getColor() || '#ffffff';
    const rootHslColor = hsl(rawRootColor);
    const rootColor = rootHslColor && !isNaN(rootHslColor.h)
      ? hsl(rootHslColor.h, rootHslColor.s * 0.4, 0.88).toString()
      : rawRootColor;
    const rootCircle = g.append('circle')
      .attr('r', rootRadius)
      .attr('fill', rootColor)
      .attr('stroke', 'none')
      .style('cursor', allowTraversing ? 'pointer' : 'default');

    if (allowTraversing && this.currentRoot && this.currentRoot !== fullRoot) {
      g.select('circle').on('click', () => {
        this.currentRoot = this.currentRoot?.parent || null;
        this.group.selectAll('*').remove();
        this.render();
      });
      this.renderBreadcrumbs(fullRoot);
    }

    if (this.config.enableMouseTracking !== false) {
      const self = this;
      const rootHoverColor = '#f0f0f0';
      rootCircle
        .on('mouseover', function(event: MouseEvent) {
          select(this).transition('fill').duration(HOVER_DURATION).ease(EASE_HOVER).attr('fill', rootHoverColor);
          select(this).style('filter', 'drop-shadow(0 1px 3px rgba(0,0,0,0.15))');
          self.context.events.emit('point:mouseover', {
            point: { ...rootNode.data, value: rootNode.value, y: rootNode.value ?? rootNode.data.value },
            index: -1, series: self, event,
            plotX: cx, plotY: cy,
          });
        })
        .on('mouseout', function(event: MouseEvent) {
          select(this).transition('fill').duration(HOVER_DURATION).ease(EASE_HOVER).attr('fill', rootColor);
          select(this).style('filter', '');
          self.context.events.emit('point:mouseout', { point: { ...rootNode.data, value: rootNode.value, y: rootNode.value ?? rootNode.data.value }, index: -1, series: self, event });
        });
    }

    if (rootRadius > 15) {
      const rootLabel = this.config.name || rootNode.data?.name || '';
      if (rootLabel) {
        const labelColor = '#333';
        const dlStyle = (this.config.dataLabels as any)?.style || {};
        const rootOutline = dlStyle.textOutline;
        const rootText = g.append('text')
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'central')
          .attr('font-size', rootRadius > 35 ? '13px' : '10px')
          .attr('font-weight', 'bold')
          .attr('fill', labelColor)
          .style('pointer-events', 'none')
          .text(rootLabel);
        if (rootOutline) {
          const outlineParts = rootOutline.split(/\s+/);
          rootText
            .style('paint-order', 'stroke fill')
            .attr('stroke', outlineParts.length >= 2 ? outlineParts.slice(1).join(' ') : 'white')
            .attr('stroke-width', parseFloat(rootOutline) || 0)
            .attr('stroke-linejoin', 'round');
        }
      }
    }

    const slices = g.selectAll('.katucharts-sunburst-arc')
      .data(nonRoot)
      .join('path')
      .attr('class', 'katucharts-sunburst-arc')
      .attr('fill', (d: any) => d._color)
      .attr('stroke', (d: any) => {
        const lc = levels.find(l => l.level === d.depth);
        return lc?.borderColor || d._color;
      })
      .attr('stroke-width', (d: any) => {
        const lc = levels.find(l => l.level === d.depth);
        return lc?.borderColor ? (lc?.borderWidth ?? 1) : 0.5;
      })
      .attr('shape-rendering', 'geometricPrecision')
      .style('cursor', 'pointer');

    if (slicedOffset > 0) {
      slices.each(function(d: any) {
        if (d.data.sliced) {
          const midAngle = (d.x0 + d.x1) / 2;
          const tx = slicedOffset * Math.sin(midAngle);
          const ty = -slicedOffset * Math.cos(midAngle);
          select(this).attr('transform', `translate(${tx},${ty})`);
        }
      });
    }

    if (animate) {
      slices.each(function(d: any, i: number) {
        const self = select(this);
        const startArc = { x0: d.x0, x1: d.x0, _y0: d._y0, _y1: d._y1 };
        const endArc = { x0: d.x0, x1: d.x1, _y0: d._y0, _y1: d._y1 };
        const interp = interpolate(startArc, endArc);
        self.transition().duration(ENTRY_DURATION).ease(EASE_ENTRY)
          .delay(ENTRY_DELAY_BASE + i * ENTRY_STAGGER_PER_ITEM)
          .attrTween('d', () => (t: number) => arcGen(interp(t))!);
      });
    } else {
      slices.attr('d', arcGen as any);
    }

    const levelRadii = new Set<number>();
    for (const d of nonRoot) {
      if (d.depth > 1) levelRadii.add(d._y0);
    }
    for (const r of levelRadii) {
      g.append('circle')
        .attr('r', r)
        .attr('fill', 'none')
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 2)
        .style('pointer-events', 'none');
    }

    this.renderLabels(g, nonRoot, levels);

    if (this.config.enableMouseTracking !== false) {
      const self = this;

      slices
        .on('mouseover', function(event: MouseEvent, d: any) {
          const target = select(this);
          const brighter = d3Color(d._color)?.brighter(0.3)?.toString() || d._color;
          target.transition('fill').duration(HOVER_DURATION).ease(EASE_HOVER).attr('fill', brighter);
          target.style('filter', 'drop-shadow(0 1px 3px rgba(0,0,0,0.2))');

          slices.interrupt('highlight');
          slices.attr('opacity', 1);
          slices.filter((o: any) => o !== d && !self.isAncestorOf(o, d))
            .transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER)
            .attr('opacity', inactiveOpacity);

          const i = nonRoot.indexOf(d);
          const centroid = arcGen.centroid(d);
          self.context.events.emit('point:mouseover', {
            point: { ...d.data, value: d.value, y: d.value ?? d.data.value },
            index: i, series: self, event,
            plotX: cx + centroid[0], plotY: cy + centroid[1],
          });
          d.data.events?.mouseOver?.call(d.data, event);
        })
        .on('mouseout', function(event: MouseEvent, d: any) {
          const target = select(this);
          target.transition('fill').duration(HOVER_DURATION).ease(EASE_HOVER).attr('fill', d._color);
          target.style('filter', '');
          slices.interrupt('highlight');
          slices.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER).attr('opacity', 1);

          const i = nonRoot.indexOf(d);
          self.context.events.emit('point:mouseout', { point: { ...d.data, value: d.value, y: d.value ?? d.data.value }, index: i, series: self, event });
          d.data.events?.mouseOut?.call(d.data, event);
        })
        .on('click', function(event: MouseEvent, d: any) {
          const i = nonRoot.indexOf(d);

          if (allowTraversing && d.children && d.children.length > 0) {
            self.currentRoot = d;
            partition().size([angleRange, 1])(self.currentRoot);
            if (startAngle !== 0) {
              self.currentRoot.each((n: any) => {
                n.x0 += startAngle;
                n.x1 += startAngle;
              });
            }
            self.group.selectAll('*').remove();
            self.render();
            return;
          }

          self.context.events.emit('point:click', { point: d.data, index: i, series: self, event });
          d.data.events?.click?.call(d.data, event);
          self.config.events?.click?.call(self, event);
        });
    }
  }

  private isAncestorOf(ancestor: any, node: any): boolean {
    let current = node;
    while (current) {
      if (current === ancestor) return true;
      current = current.parent;
    }
    return false;
  }

  /**
   * Builds hierarchy from either nested children format or flat id/parent format.
   */
  private buildHierarchy(startAngle: number = 0, angleRange: number = 2 * Math.PI): any {
    const data = this.data;
    const isFlatFormat = data.length > 0 && ((data[0] as any).id !== undefined || (data[0] as any).parent !== undefined);

    let root: any;

    if (isFlatFormat) {
      const flatData = data.map(d => ({
        ...d,
        id: (d as any).id || d.name || String(data.indexOf(d)),
        parentId: (d as any).parent || null,
        value: d.y ?? (d as any).value ?? undefined,
      }));

      const hasRoot = flatData.some(d => !d.parentId || d.parentId === '');
      if (!hasRoot) {
        flatData.unshift({ id: '__root__', parentId: null, name: 'Root', value: undefined } as any);
        flatData.forEach(d => {
          if (d.id !== '__root__' && (!d.parentId || d.parentId === '')) {
            d.parentId = '__root__';
          }
        });
      } else {
        flatData.forEach(d => {
          if (!d.parentId || d.parentId === '') d.parentId = null;
        });
      }

      root = stratify()
        .id((d: any) => d.id)
        .parentId((d: any) => d.parentId)
        (flatData as any);

      root.sum((d: any) => d.children ? 0 : (d.value ?? 0));
    } else {
      root = hierarchy({ children: this.prepareNestedData(data) } as any)
        .sum((d: any) => d.children ? 0 : (d.value || 0));
    }

    partition().size([angleRange, 1])(root);

    if (startAngle !== 0) {
      root.each((d: any) => {
        d.x0 += startAngle;
        d.x1 += startAngle;
      });
    }

    return root;
  }

  private prepareNestedData(data: any[]): any[] {
    return data.map(d => {
      const item: any = { ...d, value: d.y ?? (d as any).value ?? 1 };
      if (item.children) {
        item.children = this.prepareNestedData(item.children);
      }
      return item;
    });
  }

  private getMaxDepth(root: any): number {
    let max = 0;
    root.each((d: any) => { if (d.depth > max) max = d.depth; });
    return max;
  }

  /**
   * Computes ring widths based on levels config (weight/percentage/pixels).
   */
  private computeRingWidths(totalRadius: number, maxDepth: number, levels: LevelConfig[]): number[] {
    const widths: { value: number; unit: string }[] = [];
    const seriesLevelSize = this.config.levelSize;

    for (let d = 0; d <= maxDepth; d++) {
      const lc = levels.find(l => l.level === d);
      if (lc?.levelSize) {
        widths.push({ value: lc.levelSize.value, unit: lc.levelSize.unit });
      } else if (seriesLevelSize?.unit && seriesLevelSize?.value) {
        widths.push({ value: seriesLevelSize.value, unit: seriesLevelSize.unit });
      } else {
        widths.push({ value: 1, unit: 'weight' });
      }
    }

    let remaining = totalRadius;
    const resolved: number[] = new Array(maxDepth + 1).fill(0);

    for (let i = 0; i <= maxDepth; i++) {
      if (widths[i].unit === 'pixels') {
        resolved[i] = widths[i].value;
        remaining -= resolved[i];
      }
    }

    for (let i = 0; i <= maxDepth; i++) {
      if (widths[i].unit === 'percentage') {
        resolved[i] = (widths[i].value / 100) * totalRadius;
        remaining -= resolved[i];
      }
    }

    let totalWeight = 0;
    for (let i = 0; i <= maxDepth; i++) {
      if (widths[i].unit === 'weight') totalWeight += widths[i].value;
    }

    if (totalWeight > 0 && remaining > 0) {
      for (let i = 0; i <= maxDepth; i++) {
        if (widths[i].unit === 'weight') {
          resolved[i] = (widths[i].value / totalWeight) * remaining;
        }
      }
    }

    return resolved;
  }

  /**
   * Applies custom radii (_y0, _y1) to each node based on computed ring widths.
   * When levelIsConstant is true, levels keep their size regardless of traversal depth.
   */
  private applyCustomRadii(root: any, ringWidths: number[], levelIsConstant: boolean = true): void {
    const cumulative: number[] = [0];
    for (let i = 0; i < ringWidths.length; i++) {
      cumulative.push(cumulative[i] + ringWidths[i]);
    }

    const baseDepth = levelIsConstant ? 0 : root.depth;

    root.each((d: any) => {
      const relativeDepth = d.depth - baseDepth;
      d._y0 = cumulative[relativeDepth] || 0;
      d._y1 = cumulative[relativeDepth + 1] || cumulative[cumulative.length - 1];
    });
  }

  /**
   * Assigns colors following this pattern:
   * - Root: transparent
   * - Level with colorByPoint: each node gets a unique palette color
   * - Deeper levels: inherit parent color with brightness variation across siblings
   */
  private assignColors(root: any, colors: string[], levels: LevelConfig[]): void {
    let colorIdx = 0;
    root._color = root.data.color || 'transparent';

    const colorByPointLevel = levels.find(l => l.colorByPoint)?.level;
    const baseLevel = colorByPointLevel ?? 1;

    const assignRecursive = (node: any) => {
      if (node.depth === 0) {
        node._color = node.data.color || 'transparent';
      } else if (node.data.color) {
        node._color = node.data.color;
      } else if (node.depth === baseLevel) {
        node._color = colors[colorIdx++ % colors.length];
      } else if (node.depth > baseLevel && node.parent) {
        const lc = levels.find(l => l.level === node.depth);
        const variation = lc?.colorVariation;
        const parentColor = d3Color(node.parent._color);

        if (parentColor && variation?.key === 'brightness') {
          const siblings = node.parent.children || [];
          const idx = siblings.indexOf(node);
          const total = siblings.length;
          const factor = total > 1 ? (idx / (total - 1)) * variation.to : variation.to * 0.5;
          const hslColor = hsl(parentColor.toString());
          hslColor.l = Math.max(0.1, Math.min(0.95, hslColor.l + factor * 0.3));
          node._color = hslColor.toString();
        } else if (parentColor) {
          const siblings = node.parent.children || [];
          const idx = siblings.indexOf(node);
          const total = siblings.length;
          const factor = total > 1 ? -0.3 + (idx / (total - 1)) * 0.6 : 0;
          node._color = parentColor.brighter(factor).toString();
        } else {
          node._color = node.parent._color;
        }
      } else if (node.depth < baseLevel && node.parent) {
        node._color = node.parent._color !== 'transparent'
          ? node.parent._color
          : colors[colorIdx++ % colors.length];
      }

      if (node.children) {
        for (const child of node.children) {
          assignRecursive(child);
        }
      }
    };

    assignRecursive(root);
  }

  private renderLabels(g: any, nonRoot: any[], levels: LevelConfig[]): void {
    const defaultMinArc = 16;
    const dlConfig = this.config.dataLabels as any;
    const defaultRotationMode = dlConfig?.rotationMode || 'auto';
    const globalStyle = dlConfig?.style || {};
    const globalFontSize = globalStyle.fontSize || DEFAULT_CHART_TEXT_SIZE;
    const globalTextOutline: string | undefined = globalStyle.textOutline;
    const globalFilter = dlConfig?.filter;

    const resolveOutline = (d: any) => {
      const lc = levels.find(l => l.level === d.depth);
      return lc?.dataLabels?.style?.textOutline || globalTextOutline;
    };

    g.selectAll('.katucharts-sunburst-label')
      .data(nonRoot)
      .join('text')
      .attr('class', 'katucharts-sunburst-label')
      .attr('transform', (d: any) => {
        const lc = levels.find(l => l.level === d.depth);
        const rotMode = lc?.dataLabels?.rotationMode || defaultRotationMode;
        const angle = (d.x0 + d.x1) / 2;
        const r = (d._y0 + d._y1) / 2;
        const deg = (angle * 180 / Math.PI) - 90;

        const flipTangential = angle < Math.PI / 2 || angle > Math.PI * 3 / 2;
        const flipRadial = angle > Math.PI;

        if (rotMode === 'parallel') {
          return `rotate(${deg}) translate(${r},0) rotate(${flipTangential ? 90 : -90})`;
        }

        if (rotMode === 'perpendicular') {
          return `rotate(${deg}) translate(${r},0)${flipRadial ? ' rotate(180)' : ''}`;
        }

        const arcLen = d._y1 * (d.x1 - d.x0);
        const ringWidth = d._y1 - d._y0;
        if (arcLen > ringWidth * 2) {
          return `rotate(${deg}) translate(${r},0) rotate(${flipTangential ? 90 : -90})`;
        }
        return `rotate(${deg}) translate(${r},0)${flipRadial ? ' rotate(180)' : ''}`;
      })
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', (d: any) => {
        const lc = levels.find(l => l.level === d.depth);
        return lc?.dataLabels?.style?.fontSize || globalFontSize;
      })
      .attr('font-weight', 'bold')
      .attr('fill', DEFAULT_CHART_TEXT_COLOR)
      .style('paint-order', 'stroke fill')
      .attr('stroke', (d: any) => {
        const outline = resolveOutline(d);
        if (!outline) return 'none';
        const parts = outline.split(/\s+/);
        return parts.length >= 2 ? parts.slice(1).join(' ') : 'white';
      })
      .attr('stroke-width', (d: any) => {
        const outline = resolveOutline(d);
        if (!outline) return 0;
        return parseFloat(outline) || 0;
      })
      .attr('stroke-linejoin', 'round')
      .style('pointer-events', 'none')
      .each(function(this: SVGTextElement, d: any) {
        const el = select(this);
        el.selectAll('tspan').remove();
        const lc = levels.find((l: LevelConfig) => l.level === d.depth);

        if (lc?.dataLabels?.enabled === false) return;

        const filter = lc?.dataLabels?.filter || globalFilter;
        const outerArcLen = d._y1 * (d.x1 - d.x0);
        const innerArcLen = d._y0 * (d.x1 - d.x0);
        const ringWidth = d._y1 - d._y0;

        if (filter) {
          const val = filter.property === 'outerArcLength' ? outerArcLen
            : filter.property === 'innerArcLength' ? innerArcLen : 0;
          if (filter.operator === '>' && val <= filter.value) return;
          if (filter.operator === '<' && val >= filter.value) return;
        } else if (outerArcLen < defaultMinArc) {
          return;
        }

        const name = d.data.name || '';
        const lcRot = lc?.dataLabels?.rotationMode || defaultRotationMode;
        const isParallel = lcRot === 'parallel' || (lcRot === 'auto' && outerArcLen > ringWidth * 2);
        const lineWidth = isParallel ? (outerArcLen + innerArcLen) / 2 : ringWidth;
        const lineHeight = isParallel ? ringWidth : (outerArcLen + innerArcLen) / 2;
        const fontSize = parseFloat(lc?.dataLabels?.style?.fontSize || globalFontSize) || 11;
        const charWidth = fontSize * 0.6;
        const maxCharsPerLine = Math.max(3, Math.floor(lineWidth / charWidth));
        const maxLines = Math.max(1, Math.floor(lineHeight / (fontSize * 1.2)));

        if (name.length <= maxCharsPerLine) {
          el.text(name);
          return;
        }

        const words = name.split(/[\s_-]+/);
        const lines: string[] = [];
        let currentLine = '';

        for (const word of words) {
          const test = currentLine ? currentLine + ' ' + word : word;
          if (test.length <= maxCharsPerLine) {
            currentLine = test;
          } else {
            if (currentLine) lines.push(currentLine);
            currentLine = word.length > maxCharsPerLine
              ? word.substring(0, maxCharsPerLine - 1) + '\u2026'
              : word;
          }
          if (lines.length >= maxLines) break;
        }
        if (currentLine && lines.length < maxLines) lines.push(currentLine);

        if (lines.length === 0) return;
        if (lines.length > maxLines) lines.length = maxLines;
        if (lines.length === maxLines && currentLine && !lines[lines.length - 1].endsWith('\u2026')) {
          const remaining = words.slice(lines.join(' ').split(/[\s]+/).length);
          if (remaining.length > 0) {
            const last = lines[lines.length - 1];
            if (last.length + 2 > maxCharsPerLine) {
              lines[lines.length - 1] = last.substring(0, maxCharsPerLine - 1) + '\u2026';
            }
          }
        }

        const totalHeight = lines.length * fontSize * 1.2;
        const startDy = -(totalHeight - fontSize * 1.2) / 2;

        lines.forEach((line, li) => {
          el.append('tspan')
            .attr('x', 0)
            .attr('dy', li === 0 ? `${startDy}px` : `${fontSize * 1.2}px`)
            .text(line);
        });
      });
  }

  /**
   * Renders breadcrumb trail showing path from root to current traversed node.
   */
  private renderBreadcrumbs(root: any): void {
    const breadcrumbsCfg = (this.config as any).breadcrumbs || {};
    const style = breadcrumbsCfg.style || {};
    const fontSize = (style.fontSize as string) || '11px';
    const separator = breadcrumbsCfg.separator ?? ' / ';

    const trail: any[] = [];
    let node = this.currentRoot;
    while (node) {
      trail.unshift(node);
      node = node.parent;
    }

    const crumbG = this.group.append('g')
      .attr('class', 'katucharts-sunburst-breadcrumbs')
      .attr('transform', `translate(0,-15)`);

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
          .attr('fill', '#666')
          .attr('dominant-baseline', 'middle')
          .style('pointer-events', 'none')
          .text(separator);
        offsetX += separator.length * 5;
      }
    });
  }

  private resolvePercent(value: string | number, total: number): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.endsWith('%')) {
      return (parseFloat(value) / 100) * total;
    }
    return parseFloat(value) || 0;
  }

  private resolveBorderRadius(val: number | { radius?: number } | undefined): number {
    if (val === undefined) return 3;
    if (typeof val === 'number') return val;
    return val.radius ?? 3;
  }

  getDataExtents() {
    return { xMin: 0, xMax: 0, yMin: 0, yMax: 0 };
  }
}

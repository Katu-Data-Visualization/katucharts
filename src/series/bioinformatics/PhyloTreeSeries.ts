/**
 * Phylogenetic tree for evolutionary relationship visualization.
 * Supports rectangular and radial layouts with branch length scaling,
 * bootstrap values, and interactive subtree collapse.
 */

import { hierarchy, cluster } from 'd3-hierarchy';
import { select } from 'd3-selection';
import 'd3-transition';
import { BaseSeries } from '../BaseSeries';
import type { InternalSeriesConfig, PointOptions } from '../../types/options';
import { DEFAULT_CHART_TEXT_COLOR, DEFAULT_CHART_TEXT_SIZE } from '../../utils/chartText';
import {
  ENTRY_DURATION,
  HOVER_DURATION,
  EASE_ENTRY,
  EASE_HOVER,
} from '../../core/animationConstants';

interface PhyloNode {
  name?: string;
  children?: PhyloNode[];
  branchLength?: number;
  custom?: { bootstrap?: number; color?: string; [key: string]: any };
}

export class PhyloTreeSeries extends BaseSeries {
  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  render(): void {
    const { plotArea } = this.context;
    const animate = this.context.animate;

    const treeData = this.getTreeData();
    if (!treeData) return;

    const layout = this.config.layout ?? 'rectangular';
    const branchColor = this.config.branchColor ?? '#666';
    const branchWidth = this.config.branchWidth ?? 1.5;
    const leafLabelSize = this.config.leafLabelSize ?? 11;
    const showBranchLengths = this.config.showBranchLengths ?? false;
    const showBootstrap = this.config.showBootstrap ?? false;
    const bootstrapThreshold = this.config.bootstrapThreshold ?? 70;
    const leafPadding = this.config.leafPadding ?? 10;
    const colorByAttribute = this.config.colorByAttribute as string | undefined;

    const animOpts = typeof this.config.animation === 'object' ? this.config.animation : {};
    const entryDur = animOpts.duration ?? ENTRY_DURATION;

    const root = hierarchy<PhyloNode>(treeData);
    const leaves = root.leaves();
    const labelSpace = this.estimateLabelSpace(leaves, leafLabelSize);

    if (layout === 'radial') {
      this.renderRadial(root, plotArea, branchColor, branchWidth, leafLabelSize, leafPadding, showBootstrap, bootstrapThreshold, showBranchLengths, colorByAttribute, !!animate, entryDur);
    } else {
      this.renderRectangular(root, plotArea, labelSpace, branchColor, branchWidth, leafLabelSize, leafPadding, showBootstrap, bootstrapThreshold, showBranchLengths, colorByAttribute, !!animate, entryDur);
    }

    if (animate) {
      this.emitAfterAnimate(entryDur + 200);
    }
  }

  private getTreeData(): PhyloNode | null {
    if (this.data.length > 0) {
      const first = this.data[0] as any;
      if (first.children || first.custom?.children) {
        return {
          name: first.name,
          children: first.children || first.custom?.children,
          branchLength: first.branchLength ?? first.custom?.branchLength,
          custom: first.custom,
        };
      }
    }
    if (this.config.treeData) return this.config.treeData as PhyloNode;
    return null;
  }

  private estimateLabelSpace(leaves: any[], fontSize: number): number {
    const maxLabelLen = Math.max(0, ...leaves.map(l => (l.data.name || '').length));
    return Math.min(maxLabelLen * fontSize * 0.55, 200);
  }

  private renderRectangular(
    root: any, plotArea: { width: number; height: number },
    labelSpace: number, branchColor: string, branchWidth: number,
    leafLabelSize: number, leafPadding: number,
    showBootstrap: boolean, bootstrapThreshold: number,
    showBranchLengths: boolean, colorByAttribute: string | undefined,
    animate: boolean, duration: number
  ): void {
    const treeWidth = plotArea.width - labelSpace - leafPadding;
    const treeHeight = plotArea.height;

    const clusterLayout = cluster<PhyloNode>()
      .size([treeHeight, treeWidth])
      .separation(() => 1);

    clusterLayout(root);

    if (showBranchLengths) {
      this.scaleBranchLengths(root, treeWidth);
    }

    const treeGroup = this.group.append('g').attr('class', 'katucharts-phylo-tree');

    const links = root.links();
    const linkPaths = treeGroup.selectAll('.katucharts-phylo-branch')
      .data(links)
      .join('path')
      .attr('class', 'katucharts-phylo-branch')
      .attr('d', (d: any) => {
        const sx = d.source.y;
        const sy = d.source.x;
        const tx = d.target.y;
        const ty = d.target.x;
        return `M${sx},${sy}V${ty}H${tx}`;
      })
      .attr('fill', 'none')
      .attr('stroke', (d: any) => {
        if (colorByAttribute && d.target.data.custom?.[colorByAttribute]) {
          return d.target.data.custom[colorByAttribute];
        }
        return d.target.data.custom?.color || branchColor;
      })
      .attr('stroke-width', branchWidth);

    if (animate) {
      linkPaths.attr('opacity', 0)
        .transition().duration(duration).ease(EASE_ENTRY)
        .attr('opacity', 1);
    }

    const leaves = root.leaves();
    const leafGroup = treeGroup.selectAll('.katucharts-phylo-leaf')
      .data(leaves)
      .join('g')
      .attr('class', 'katucharts-phylo-leaf')
      .attr('transform', (d: any) => `translate(${d.y},${d.x})`);

    leafGroup.append('circle')
      .attr('r', 3)
      .attr('fill', (d: any) => {
        if (colorByAttribute && d.data.custom?.[colorByAttribute]) {
          return d.data.custom[colorByAttribute];
        }
        return d.data.custom?.color || branchColor;
      });

    leafGroup.append('text')
      .attr('x', leafPadding)
      .attr('y', 0)
      .attr('text-anchor', 'start')
      .attr('dominant-baseline', 'central')
      .attr('font-size', `${leafLabelSize}px`)
      .attr('fill', DEFAULT_CHART_TEXT_COLOR)
      .text((d: any) => d.data.name || '')
      .style('cursor', 'default');

    if (animate) {
      leafGroup.attr('opacity', 0)
        .transition().duration(duration).ease(EASE_ENTRY)
        .attr('opacity', 1);
    }

    if (showBootstrap) {
      const internals = root.descendants().filter((d: any) => d.children && d.children.length > 0 && d.parent);
      treeGroup.selectAll('.katucharts-phylo-bootstrap')
        .data(internals)
        .join('text')
        .attr('class', 'katucharts-phylo-bootstrap')
        .attr('x', (d: any) => d.y - 5)
        .attr('y', (d: any) => d.x - 5)
        .attr('text-anchor', 'end')
        .attr('font-size', DEFAULT_CHART_TEXT_SIZE)
        .attr('fill', DEFAULT_CHART_TEXT_COLOR)
        .text((d: any) => {
          const bs = d.data.custom?.bootstrap;
          return (bs !== undefined && bs >= bootstrapThreshold) ? String(bs) : '';
        });
    }

    if (showBranchLengths) {
      this.renderScaleBar(treeGroup, treeWidth, treeHeight);
    }

    this.attachTreeEvents(leafGroup, leaves);
  }

  private renderRadial(
    root: any, plotArea: { width: number; height: number },
    branchColor: string, branchWidth: number,
    leafLabelSize: number, leafPadding: number,
    showBootstrap: boolean, bootstrapThreshold: number,
    showBranchLengths: boolean, colorByAttribute: string | undefined,
    animate: boolean, duration: number
  ): void {
    const radius = Math.min(plotArea.width, plotArea.height) / 2 - 60;
    const cx = plotArea.width / 2;
    const cy = plotArea.height / 2;

    const clusterLayout = cluster<PhyloNode>()
      .size([360, radius])
      .separation(() => 1);

    clusterLayout(root);

    if (showBranchLengths) {
      this.scaleBranchLengths(root, radius);
    }

    const treeGroup = this.group.append('g')
      .attr('class', 'katucharts-phylo-radial')
      .attr('transform', `translate(${cx},${cy})`);

    const toCartesian = (angle: number, r: number) => {
      const a = (angle - 90) * Math.PI / 180;
      return { x: r * Math.cos(a), y: r * Math.sin(a) };
    };

    const links = root.links();
    treeGroup.selectAll('.katucharts-phylo-branch')
      .data(links)
      .join('path')
      .attr('class', 'katucharts-phylo-branch')
      .attr('d', (d: any) => {
        const sAngle = d.source.x;
        const tAngle = d.target.x;
        const sRadius = d.source.y;
        const tRadius = d.target.y;

        const mid = toCartesian(tAngle, sRadius);
        const t = toCartesian(tAngle, tRadius);

        const angleDiff = Math.abs(tAngle - sAngle);
        const largeArc = angleDiff > 180 ? 1 : 0;
        const sweep = tAngle > sAngle ? 1 : 0;

        const sPoint = toCartesian(sAngle, sRadius);

        return `M${sPoint.x},${sPoint.y}A${sRadius},${sRadius} 0 ${largeArc} ${sweep} ${mid.x},${mid.y}L${t.x},${t.y}`;
      })
      .attr('fill', 'none')
      .attr('stroke', (d: any) => d.target.data.custom?.color || branchColor)
      .attr('stroke-width', branchWidth);

    const leaves = root.leaves();
    const leafGroup = treeGroup.selectAll('.katucharts-phylo-leaf')
      .data(leaves)
      .join('g')
      .attr('class', 'katucharts-phylo-leaf')
      .attr('transform', (d: any) => {
        const pos = toCartesian(d.x, d.y);
        return `translate(${pos.x},${pos.y})`;
      });

    leafGroup.append('circle')
      .attr('r', 3)
      .attr('fill', (d: any) => d.data.custom?.color || branchColor);

    leafGroup.append('text')
      .attr('x', (d: any) => (d.x < 180 ? leafPadding : -leafPadding))
      .attr('text-anchor', (d: any) => d.x < 180 ? 'start' : 'end')
      .attr('dominant-baseline', 'central')
      .attr('transform', (d: any) => `rotate(${d.x < 180 ? d.x - 90 : d.x + 90})`)
      .attr('font-size', `${leafLabelSize}px`)
      .attr('fill', DEFAULT_CHART_TEXT_COLOR)
      .text((d: any) => d.data.name || '');

    if (animate) {
      treeGroup.attr('opacity', 0)
        .transition().duration(duration).ease(EASE_ENTRY)
        .attr('opacity', 1);
    }

    this.attachTreeEvents(leafGroup, leaves);
  }

  private scaleBranchLengths(root: any, maxWidth: number): void {
    const maxDistance = this.getMaxDistance(root);
    if (maxDistance <= 0) return;

    const scale = maxWidth / maxDistance;
    root.each((node: any) => {
      const dist = this.getDistanceFromRoot(node);
      node.y = dist * scale;
    });
  }

  private getDistanceFromRoot(node: any): number {
    let dist = 0;
    let current = node;
    while (current.parent) {
      dist += current.data.branchLength ?? current.data.custom?.branchLength ?? 0;
      current = current.parent;
    }
    return dist;
  }

  private getMaxDistance(root: any): number {
    let max = 0;
    root.leaves().forEach((leaf: any) => {
      max = Math.max(max, this.getDistanceFromRoot(leaf));
    });
    return max;
  }

  private renderScaleBar(group: any, treeWidth: number, treeHeight: number): void {
    const barWidth = treeWidth * 0.15;
    const y = treeHeight + 20;

    group.append('line')
      .attr('x1', 0).attr('x2', barWidth)
      .attr('y1', y).attr('y2', y)
      .attr('stroke', '#333').attr('stroke-width', 1);

    group.append('text')
      .attr('x', barWidth / 2)
      .attr('y', y + 12)
      .attr('text-anchor', 'middle')
      .attr('font-size', DEFAULT_CHART_TEXT_SIZE)
      .attr('fill', DEFAULT_CHART_TEXT_COLOR)
      .text('0.1');
  }

  private attachTreeEvents(leafGroup: any, leaves: any[]): void {
    if (this.config.enableMouseTracking === false) return;

    leafGroup
      .on('mouseover', (event: MouseEvent, d: any) => {
        const target = event.currentTarget as SVGGElement;
        const c = target.querySelector('circle');
        if (c) {
          select(c).interrupt('hover')
            .transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER)
            .attr('r', 5);
        }

        const i = leaves.indexOf(d);
        this.context.events.emit('point:mouseover', {
          point: { name: d.data.name, custom: d.data.custom } as PointOptions,
          index: i, series: this, event,
          plotX: 0, plotY: 0,
        });
      })
      .on('mouseout', (event: MouseEvent, d: any) => {
        const target = event.currentTarget as SVGGElement;
        const c = target.querySelector('circle');
        if (c) {
          select(c).interrupt('hover')
            .transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER)
            .attr('r', 3);
        }

        const i = leaves.indexOf(d);
        this.context.events.emit('point:mouseout', {
          point: { name: d.data.name, custom: d.data.custom } as PointOptions,
          index: i, series: this, event,
        });
      })
      .on('click', (event: MouseEvent, d: any) => {
        const i = leaves.indexOf(d);
        this.context.events.emit('point:click', {
          point: { name: d.data.name, custom: d.data.custom } as PointOptions,
          index: i, series: this, event,
        });
      });
  }

  getDataExtents() {
    return { xMin: 0, xMax: 0, yMin: 0, yMax: 0 };
  }
}

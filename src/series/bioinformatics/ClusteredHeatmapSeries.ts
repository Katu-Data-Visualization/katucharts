/**
 * Clustered heatmap with row and column dendrograms.
 * Extends heatmap concepts with hierarchical clustering visualization
 * using d3-hierarchy cluster layout.
 */

import { scaleSequential } from 'd3-scale';
import { interpolateYlOrRd, interpolateRdBu } from 'd3-scale-chromatic';
import { hierarchy, cluster } from 'd3-hierarchy';
import 'd3-transition';
import { BaseSeries } from '../BaseSeries';
import type { InternalSeriesConfig, PointOptions } from '../../types/options';

interface DendrogramNode {
  children?: DendrogramNode[];
  height?: number;
  index?: number;
  name?: string;
}

export class ClusteredHeatmapSeries extends BaseSeries {
  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  render(): void {
    const { plotArea } = this.context;
    const animate = this.context.animate;
    const data = this.data;

    const rowDendro: DendrogramNode | undefined = this.config.rowDendrogram ?? (this.config as any).custom?.rowDendrogram;
    const colDendro: DendrogramNode | undefined = this.config.colDendrogram ?? (this.config as any).custom?.colDendrogram;

    const showRowDendro = (this.config.showRowDendrogram !== false) && !!rowDendro;
    const showColDendro = (this.config.showColDendrogram !== false) && !!colDendro;
    const dendroRowWidth = showRowDendro ? (this.config.dendrogramRowWidth ?? 80) : 0;
    const dendroColHeight = showColDendro ? (this.config.dendrogramColHeight ?? 80) : 0;
    const dendroColor = this.config.dendrogramColor ?? '#666';
    const dendroLineWidth = this.config.dendrogramLineWidth ?? 1;

    const heatmapArea = {
      x: dendroRowWidth,
      y: dendroColHeight,
      width: plotArea.width - dendroRowWidth,
      height: plotArea.height - dendroColHeight,
    };

    const values = data.map(d => (d as any).value ?? d.z ?? d.y ?? 0)
      .filter(v => v !== null && v !== undefined);
    const minVal = this.config.min ?? (values.length > 0 ? Math.min(...values) : 0);
    const maxVal = this.config.max ?? (values.length > 0 ? Math.max(...values) : 1);
    const nullColor = this.config.nullColor ?? '#e4e4e4';
    const colorInterpolator = this.config.diverging
      ? interpolateRdBu
      : interpolateYlOrRd;

    const colorScale = scaleSequential(colorInterpolator).domain([minVal, maxVal]);

    const xValues = [...new Set(data.map(d => d.x ?? 0))].sort((a, b) => a - b);
    const yValues = [...new Set(data.map(d => d.y ?? 0))].sort((a, b) => a - b);
    const nCols = xValues.length || 1;
    const nRows = yValues.length || 1;
    const cellWidth = heatmapArea.width / nCols;
    const cellHeight = heatmapArea.height / nRows;

    const animOpts = typeof this.config.animation === 'object' ? this.config.animation : {};
    const entryDur = animOpts.duration ?? 600;

    this.renderHeatmapCells(data, heatmapArea, xValues, yValues, cellWidth, cellHeight, colorScale, nullColor, !!animate, entryDur);

    if (showRowDendro && rowDendro) {
      this.renderRowDendrogram(rowDendro, dendroRowWidth, heatmapArea, dendroColor, dendroLineWidth, !!animate, entryDur);
    }

    if (showColDendro && colDendro) {
      this.renderColDendrogram(colDendro, dendroColHeight, heatmapArea, dendroColor, dendroLineWidth, !!animate, entryDur);
    }

    this.renderLabels(xValues, yValues, heatmapArea, cellWidth, cellHeight);

    if (animate) {
      this.emitAfterAnimate(entryDur + 200);
    }
  }

  private renderHeatmapCells(
    data: PointOptions[], area: { x: number; y: number; width: number; height: number },
    xValues: number[], yValues: number[],
    cellWidth: number, cellHeight: number,
    colorScale: (v: number) => string, nullColor: string,
    animate: boolean, duration: number
  ): void {
    const xIndex = new Map(xValues.map((v, i) => [v, i]));
    const yIndex = new Map(yValues.map((v, i) => [v, i]));
    const borderWidth = this.config.borderWidth ?? 1;
    const borderColor = this.config.borderColor ?? '#ffffff';
    const borderRadius = this.config.borderRadius ?? 4;

    const cellsGroup = this.group.append('g')
      .attr('class', 'katucharts-cheatmap-cells')
      .attr('transform', `translate(${area.x},${area.y})`);

    for (const d of data) {
      const xi = xIndex.get(d.x ?? 0) ?? 0;
      const yi = yIndex.get(d.y ?? 0) ?? 0;
      const val = (d as any).value ?? d.z ?? d.y ?? null;
      const fillColor = d.color || (val !== null ? colorScale(val) : nullColor);

      const cell = cellsGroup.append('rect')
        .attr('x', xi * cellWidth + borderWidth / 2)
        .attr('y', yi * cellHeight + borderWidth / 2)
        .attr('width', Math.max(0, cellWidth - borderWidth))
        .attr('height', Math.max(0, cellHeight - borderWidth))
        .attr('fill', fillColor)
        .attr('stroke', borderColor)
        .attr('stroke-width', borderWidth)
        .attr('rx', typeof borderRadius === 'number' ? borderRadius : 4)
        .style('cursor', 'pointer');

      if (animate) {
        cell.attr('opacity', 0)
          .transition().duration(duration)
          .attr('opacity', 1);
      }

      if (this.config.enableMouseTracking !== false) {
        const idx = data.indexOf(d);
        cell
          .on('mouseover', (event: MouseEvent) => {
            cell.attr('stroke', '#333').attr('stroke-width', 2);
            this.context.events.emit('point:mouseover', {
              point: d, index: idx, series: this, event,
              plotX: area.x + xi * cellWidth + cellWidth / 2,
              plotY: area.y + yi * cellHeight + cellHeight / 2,
            });
          })
          .on('mouseout', (event: MouseEvent) => {
            cell.attr('stroke', borderColor).attr('stroke-width', borderWidth);
            this.context.events.emit('point:mouseout', { point: d, index: idx, series: this, event });
          })
          .on('click', (event: MouseEvent) => {
            this.context.events.emit('point:click', { point: d, index: idx, series: this, event });
          });
      }
    }
  }

  private renderRowDendrogram(
    root: DendrogramNode, width: number,
    heatmapArea: { x: number; y: number; height: number },
    color: string, lineWidth: number,
    animate: boolean, duration: number
  ): void {
    const h = hierarchy(root);
    const clusterLayout = cluster<DendrogramNode>()
      .size([heatmapArea.height, width - 10]);

    clusterLayout(h);

    const dendroGroup = this.group.append('g')
      .attr('class', 'katucharts-cheatmap-row-dendro')
      .attr('transform', `translate(0,${heatmapArea.y})`);

    const links = dendroGroup.selectAll('.dendro-link')
      .data(h.links())
      .join('path')
      .attr('class', 'dendro-link')
      .attr('d', (d: any) => {
        const s = d.source;
        const t = d.target;
        const sx = width - 5 - s.y;
        const sy = s.x;
        const tx = width - 5 - t.y;
        const ty = t.x;
        return `M${tx},${ty}H${sx}V${sy}`;
      })
      .attr('fill', 'none')
      .attr('stroke', color)
      .attr('stroke-width', lineWidth);

    if (animate) {
      links.attr('opacity', 0)
        .transition().duration(duration)
        .attr('opacity', 1);
    }
  }

  private renderColDendrogram(
    root: DendrogramNode, height: number,
    heatmapArea: { x: number; y: number; width: number },
    color: string, lineWidth: number,
    animate: boolean, duration: number
  ): void {
    const h = hierarchy(root);
    const clusterLayout = cluster<DendrogramNode>()
      .size([heatmapArea.width, height - 10]);

    clusterLayout(h);

    const dendroGroup = this.group.append('g')
      .attr('class', 'katucharts-cheatmap-col-dendro')
      .attr('transform', `translate(${heatmapArea.x},0)`);

    const links = dendroGroup.selectAll('.dendro-link')
      .data(h.links())
      .join('path')
      .attr('class', 'dendro-link')
      .attr('d', (d: any) => {
        const s = d.source;
        const t = d.target;
        const sx = s.x;
        const sy = height - 5 - s.y;
        const tx = t.x;
        const ty = height - 5 - t.y;
        return `M${tx},${ty}V${sy}H${sx}`;
      })
      .attr('fill', 'none')
      .attr('stroke', color)
      .attr('stroke-width', lineWidth);

    if (animate) {
      links.attr('opacity', 0)
        .transition().duration(duration)
        .attr('opacity', 1);
    }
  }

  private renderLabels(
    xValues: number[], yValues: number[],
    area: { x: number; y: number; width: number; height: number },
    cellWidth: number, cellHeight: number
  ): void {
    const showLabels = this.config.showLabels !== false;
    if (!showLabels) return;

    const labelsGroup = this.group.append('g').attr('class', 'katucharts-cheatmap-labels');

    const xLabels = this.config.xLabels as string[] | undefined;
    if (xLabels) {
      for (let i = 0; i < Math.min(xLabels.length, xValues.length); i++) {
        labelsGroup.append('text')
          .attr('x', area.x + i * cellWidth + cellWidth / 2)
          .attr('y', area.y + area.height + 12)
          .attr('text-anchor', 'middle')
          .attr('font-size', '9px')
          .attr('fill', '#333')
          .text(xLabels[i]);
      }
    }

    const yLabels = this.config.yLabels as string[] | undefined;
    if (yLabels) {
      for (let i = 0; i < Math.min(yLabels.length, yValues.length); i++) {
        labelsGroup.append('text')
          .attr('x', area.x + area.width + 5)
          .attr('y', area.y + i * cellHeight + cellHeight / 2)
          .attr('text-anchor', 'start')
          .attr('dominant-baseline', 'central')
          .attr('font-size', '9px')
          .attr('fill', '#333')
          .text(yLabels[i]);
      }
    }
  }

  getDataExtents() {
    return { xMin: 0, xMax: 0, yMin: 0, yMax: 0 };
  }
}

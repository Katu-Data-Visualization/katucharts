/**
 * Circular Heatmap following circlize convention:
 * rows distribute in the CIRCULAR direction (angular sectors),
 * columns distribute in the RADIAL direction (concentric sub-rings).
 * Each cell is an arc at (row's angular sector, column's radial band).
 */

import { arc as d3Arc } from 'd3-shape';
import { scaleLinear } from 'd3-scale';
import { select } from 'd3-selection';
import 'd3-transition';
import { BaseSeries } from '../../BaseSeries';
import type { InternalSeriesConfig } from '../../../types/options';
import { getColorInterpolator } from './CircosColorScales';
import type { CircosColorScaleName } from './CircosTypes';
import {
  ENTRY_DURATION,
  ENTRY_STAGGER_PER_ITEM,
  HOVER_DURATION,
  EASE_ENTRY,
  EASE_HOVER,
} from '../../../core/animationConstants';

interface HeatmapRow {
  id: string;
  values: number[];
  color?: string;
}

export class CircosHeatmapSeries extends BaseSeries {
  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  render(): void {
    const { plotArea } = this.context;
    const animate = this.context.animate;
    const cfg = this.config as any;

    const centerCfg = cfg.center || ['50%', '50%'];
    const cx = this.resolvePercent(centerCfg[0], plotArea.width);
    const cy = this.resolvePercent(centerCfg[1], plotArea.height);

    const sizePct = cfg.size;
    const maxDim = sizePct
      ? this.resolvePercent(sizePct, Math.min(plotArea.width, plotArea.height))
      : Math.min(plotArea.width, plotArea.height);
    const labelMargin = Math.max(15, maxDim * 0.05);
    const outerRadius = maxDim / 2 - labelMargin;

    const columns: string[] = cfg.columns || this.data[0]?.custom?.columns || [];
    const rows: HeatmapRow[] = cfg.rows || this.data[0]?.custom?.rows || [];

    if (columns.length === 0 || rows.length === 0) return;

    const nCols = columns.length;
    const nRows = rows.length;
    const rowGapDeg: number = cfg.rowGap ?? 2;
    const rowGapRad = (rowGapDeg * Math.PI) / 180;
    const innerRadiusRatio: number = cfg.innerRadius ?? 0.3;
    const innerRadius = outerRadius * innerRadiusRatio;
    const labelSpace = Math.max(10, Math.min(18, maxDim * 0.03));
    const ringAreaOuter = outerRadius - labelSpace;
    const ringAreaInner = innerRadius;

    const colorScaleName: CircosColorScaleName | undefined = cfg.colorScale;
    const interpolator = getColorInterpolator(colorScaleName);

    const allValues = rows.flatMap(r => r.values);
    const domainMin = cfg.min ?? Math.min(...allValues);
    const domainMax = cfg.max ?? Math.max(...allValues);
    const valueScale = scaleLinear()
      .domain([domainMin, domainMax])
      .range([0, 1])
      .clamp(true);

    const totalRowGap = rowGapRad * nRows;
    const availableAngle = 2 * Math.PI - totalRowGap;
    const rowAngle = availableAngle / nRows;

    const colHeight = (ringAreaOuter - ringAreaInner) / nCols;

    const animOpts = typeof this.config.animation === 'object' ? this.config.animation : {};
    const entryDur = animOpts.duration ?? ENTRY_DURATION;

    const g = this.group.append('g')
      .attr('transform', `translate(${cx},${cy})`);

    for (let ri = 0; ri < nRows; ri++) {
      const row = rows[ri];
      const rowStartAngle = ri * (rowAngle + rowGapRad);
      const rowEndAngle = rowStartAngle + rowAngle;

      const rowGroup = g.append('g')
        .attr('class', `katucharts-circos-hm-row katucharts-circos-hm-row-${ri}`);

      for (let ci = 0; ci < nCols; ci++) {
        const val = ci < row.values.length ? row.values[ci] : 0;
        const cellInnerR = ringAreaInner + ci * colHeight;
        const cellOuterR = cellInnerR + colHeight - 0.5;

        const t = valueScale(val);
        const fillColor = interpolator(t);

        const arcGen = d3Arc<any>()
          .innerRadius(cellInnerR)
          .outerRadius(cellOuterR)
          .startAngle(rowStartAngle)
          .endAngle(rowEndAngle)
          .cornerRadius(2);

        const cell = rowGroup.append('path')
          .attr('class', 'katucharts-circos-hm-cell')
          .attr('d', arcGen({} as any)!)
          .attr('fill', fillColor)
          .attr('stroke', cfg.cellBorderColor ?? 'none')
          .attr('stroke-width', cfg.cellBorderWidth ?? 0)
          .style('cursor', 'pointer');

        if (animate) {
          const delay = ri * ENTRY_STAGGER_PER_ITEM;
          cell.attr('opacity', 0)
            .transition().duration(entryDur).ease(EASE_ENTRY).delay(delay)
            .attr('opacity', 1);
        }

        if (this.config.enableMouseTracking !== false) {
          this.attachCellEvents(cell, row, ri, ci, columns[ci], val, cx, cy);
        }
      }
    }

    this.renderRowLabels(g, rows, rowAngle, rowGapRad, ringAreaOuter + 6);
    this.renderColumnLabels(g, columns, ringAreaInner, colHeight);

    if (animate) {
      this.emitAfterAnimate(entryDur + 100);
    }
  }

  /**
   * Row labels around the outer edge (circular direction),
   * rotated like chromosome labels in standard circos.
   */
  private renderRowLabels(
    g: any,
    rows: HeatmapRow[],
    rowAngle: number,
    rowGapRad: number,
    labelR: number,
  ): void {
    for (let ri = 0; ri < rows.length; ri++) {
      const midAngle = ri * (rowAngle + rowGapRad) + rowAngle / 2;
      const angleDeg = midAngle * 180 / Math.PI - 90;
      const flip = angleDeg > 90 && angleDeg < 270;
      const a = midAngle - Math.PI / 2;
      const lx = labelR * Math.cos(a);
      const ly = labelR * Math.sin(a);

      g.append('text')
        .attr('class', 'katucharts-circos-hm-row-label')
        .attr('transform', `translate(${lx},${ly}) rotate(${flip ? angleDeg + 180 : angleDeg})`)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('font-size', '9px')
        .attr('fill', '#333')
        .style('pointer-events', 'none')
        .text(rows[ri].id);
    }
  }

  /**
   * Column labels as small text at the innermost ring edge,
   * positioned radially to indicate which radial band = which column.
   */
  private renderColumnLabels(
    g: any,
    columns: string[],
    innerR: number,
    colHeight: number,
  ): void {
    const refAngle = -Math.PI / 2;
    for (let ci = 0; ci < columns.length; ci++) {
      const midR = innerR + ci * colHeight + colHeight / 2;
      const lx = midR * Math.cos(refAngle) + 4;
      const ly = midR * Math.sin(refAngle);

      g.append('text')
        .attr('class', 'katucharts-circos-hm-col-label')
        .attr('x', lx)
        .attr('y', ly)
        .attr('text-anchor', 'start')
        .attr('dominant-baseline', 'central')
        .attr('font-size', Math.min(9, colHeight * 0.7) + 'px')
        .attr('fill', '#555')
        .style('pointer-events', 'none')
        .text(columns[ci]);
    }
  }

  private attachCellEvents(
    element: any,
    row: HeatmapRow,
    rowIdx: number,
    colIdx: number,
    colName: string,
    value: number,
    cx: number,
    cy: number,
  ): void {
    element
      .on('mouseover', (event: MouseEvent) => {
        const target = select(event.currentTarget as SVGPathElement);
        target.interrupt('hover')
          .transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER)
          .attr('opacity', 0.8);
        target.style('filter', 'drop-shadow(0 0 3px rgba(0,0,0,0.3))');
        this.context.events.emit('point:mouseover', {
          point: { name: colName, row: row.id, y: value, rowIndex: rowIdx, colIndex: colIdx },
          index: rowIdx * colIdx,
          series: this, event,
          plotX: cx, plotY: cy,
        });
      })
      .on('mouseout', (event: MouseEvent) => {
        const target = select(event.currentTarget as SVGPathElement);
        target.interrupt('hover')
          .transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER)
          .attr('opacity', 1);
        target.style('filter', '');
        this.context.events.emit('point:mouseout', {
          point: { name: colName, row: row.id, y: value, rowIndex: rowIdx, colIndex: colIdx },
          index: rowIdx * colIdx,
          series: this, event,
        });
      })
      .on('click', (event: MouseEvent) => {
        this.context.events.emit('point:click', {
          point: { name: colName, row: row.id, y: value, rowIndex: rowIdx, colIndex: colIdx },
          index: rowIdx * colIdx,
          series: this, event,
        });
        this.config.events?.click?.call(this, event);
      });
  }

  private resolvePercent(val: string | number, total: number): number {
    if (typeof val === 'string' && val.endsWith('%')) {
      return (parseFloat(val) / 100) * total;
    }
    return typeof val === 'number' ? val : parseFloat(val) || total / 2;
  }

  getDataExtents() {
    return { xMin: 0, xMax: 0, yMin: 0, yMax: 0 };
  }
}

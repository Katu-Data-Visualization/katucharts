import { Selection } from 'd3-selection';
import type { LegendOptions, PlotArea } from '../types/options';
import { EventBus } from '../core/EventBus';
import { templateFormat, stripHtmlTags } from '../utils/format';
import type { BaseSeries } from '../series/BaseSeries';

export class Legend {
  private config: LegendOptions;
  private group!: Selection<SVGGElement, unknown, null, undefined>;
  private events: EventBus;
  private series: BaseSeries[] = [];
  private scrollOffset = 0;
  private contentHeight = 0;
  private visibleHeight = 0;

  constructor(
    config: LegendOptions,
    svg: Selection<SVGSVGElement, unknown, null, undefined>,
    events: EventBus
  ) {
    this.config = config;
    this.events = events;

    if (config.enabled === false) return;

    this.group = svg.append('g')
      .attr('class', `katucharts-legend${config.className ? ' ' + config.className : ''}`);
  }

  private resolveLabel(s: BaseSeries): string {
    const color = s.getColor();
    let label: string;
    if (this.config.labelFormatter) {
      label = this.config.labelFormatter.call({
        name: s.config.name || '',
        color,
        percentage: (s as any).percentage,
        total: (s as any).total,
        index: s.config.index,
        legendIndex: s.config.legendIndex,
        options: s.config,
      });
    } else if (this.config.labelFormat) {
      const ctx = {
        name: s.config.name || '',
        color,
        index: s.config.index,
        legendIndex: s.config.legendIndex,
      };
      label = stripHtmlTags(templateFormat(this.config.labelFormat, ctx));
    } else {
      label = s.config.name || `Series ${s.config.index + 1}`;
    }

    if (this.config.valueSuffix) {
      label += ` ${this.config.valueSuffix}`;
    }
    if (this.config.valueDecimals !== undefined && this.config.valueDecimals >= 0) {
      const lastVal = s.data.length > 0 ? s.data[s.data.length - 1]?.y : undefined;
      if (typeof lastVal === 'number') {
        label += `: ${lastVal.toFixed(this.config.valueDecimals)}`;
      }
    }
    return label;
  }

  private computeAutoFontSize(_itemCount: number, baseFontSize: string): string {
    return baseFontSize || '12px';
  }

  private estimateTextWidth(text: string, fontSize: string): number {
    const size = parseInt(fontSize, 10);
    return text.length * size * 0.58;
  }

  static computeGridLayout(
    itemCount: number,
    labels: string[],
    availWidth: number,
    config: {
      symbolWidth: number;
      symbolPadding: number;
      fontSize: string;
      itemDistance: number;
      padding: number;
      itemWidth?: number;
    }
  ): { columns: number; itemWidth: number } {
    if (config.itemWidth) {
      const cols = Math.max(2, Math.floor(availWidth / config.itemWidth));
      return { columns: cols, itemWidth: config.itemWidth };
    }

    const fontPx = parseInt(config.fontSize, 10);
    let maxTextWidth = 0;
    for (const label of labels) {
      const w = label.length * fontPx * 0.58;
      if (w > maxTextWidth) maxTextWidth = w;
    }

    const computedItemWidth = config.symbolWidth + config.symbolPadding + maxTextWidth + 8;
    const cols = Math.min(8, Math.max(2, Math.floor(availWidth / computedItemWidth)));
    return { columns: cols, itemWidth: computedItemWidth };
  }

  render(series: BaseSeries[], layoutArea: { x: number; y: number; width: number; height: number }): void {
    if (this.config.enabled === false || !this.group) return;

    this.series = series;
    this.group.selectAll('*').remove();

    let visibleSeries = series.filter(s => s.config.showInLegend !== false);
    if (visibleSeries.length === 0) return;

    if (this.config.reversed) {
      visibleSeries = [...visibleSeries].reverse();
    }

    const layout = this.config.layout || 'horizontal';
    const padding = this.config.padding ?? 8;
    const symbolWidth = this.config.symbolWidth ?? 12;
    const symbolHeight = this.config.symbolHeight ?? 12;
    const symbolPadding = this.config.symbolPadding ?? 5;
    const symbolRadius = this.config.symbolRadius ?? 2;
    const squareSymbol = this.config.squareSymbol !== false;
    const itemDistance = this.config.itemDistance ?? 20;
    const itemStyle = this.config.itemStyle || {};
    const itemMarginTop = this.config.itemMarginTop ?? 0;
    const itemMarginBottom = this.config.itemMarginBottom ?? 4;
    const lineHeight = this.config.lineHeight ?? 16;
    const maxHeight = this.config.maxHeight;
    const legendWidth = this.config.width;

    const baseFontSize = itemStyle.fontSize as string || '12px';
    const effectiveFontSize = this.computeAutoFontSize(visibleSeries.length, baseFontSize);

    let offsetX = padding;
    let offsetY = padding;
    let maxRowWidth = 0;

    if (this.config.title?.text) {
      const titleStyle = this.config.title.style || {};
      this.group.append('text')
        .attr('class', 'katucharts-legend-title')
        .attr('x', padding)
        .attr('y', padding + 10)
        .attr('font-size', titleStyle.fontSize as string || '12px')
        .attr('font-weight', titleStyle.fontWeight as string || 'bold')
        .attr('fill', titleStyle.color as string || '#333')
        .text(this.config.title.text);
      offsetY += 20;
    }

    const contentStartY = offsetY;
    const availWidth = legendWidth || (layoutArea.width - padding * 2);
    const rowStep = lineHeight + itemMarginBottom + itemMarginTop;

    type LegendEntry = { label: string; color: string; series: BaseSeries; isLine: boolean };
    const entries: LegendEntry[] = [];
    for (const s of visibleSeries) {
      const multiItems = s.getMultiLegendItems();
      const isLine = ['line', 'spline', 'area', 'areaspline'].includes(s.config._internalType);
      if (multiItems) {
        for (const item of multiItems) {
          entries.push({ label: item.label, color: item.color, series: s, isLine });
        }
      } else {
        entries.push({ label: this.resolveLabel(s), color: s.getColor(), series: s, isLine });
      }
    }
    const labels = entries.map(e => e.label);

    const useGrid = layout === 'horizontal' && entries.length > 8;
    let gridColumns = 0;
    let gridItemWidth = 0;
    const maxGridRows = 6;
    let gridPage = 0;
    let totalGridRows = 0;

    if (useGrid) {
      const grid = Legend.computeGridLayout(
        entries.length,
        labels,
        availWidth,
        {
          symbolWidth,
          symbolPadding,
          fontSize: effectiveFontSize,
          itemDistance,
          padding,
          itemWidth: this.config.itemWidth,
        }
      );
      gridColumns = grid.columns;
      gridItemWidth = grid.itemWidth;
      totalGridRows = Math.ceil(entries.length / gridColumns);
    }

    const itemGroups: Selection<SVGGElement, unknown, null, undefined>[] = [];

    entries.forEach((entry, i) => {
      const s = entry.series;
      const color = entry.color;
      const isLine = entry.isLine;
      const label = entry.label;

      let itemX: number;
      let itemY: number;

      if (useGrid) {
        const col = i % gridColumns;
        const row = Math.floor(i / gridColumns);
        const gridTotalWidth = gridColumns * gridItemWidth;
        const gridOffsetX = Math.max(0, (availWidth - gridTotalWidth) / 2);
        itemX = padding + gridOffsetX + col * gridItemWidth;
        itemY = contentStartY + row * rowStep + itemMarginTop;
      } else if (layout === 'horizontal') {
        const textWidth = this.config.itemWidth || label.length * 7;
        const fullItemWidth = symbolWidth + symbolPadding + textWidth;

        if (i > 0 && offsetX + fullItemWidth > availWidth) {
          offsetX = padding;
          offsetY += rowStep;
        }
        itemX = offsetX;
        itemY = offsetY + itemMarginTop;
        maxRowWidth = Math.max(maxRowWidth, offsetX + fullItemWidth);
        offsetX += fullItemWidth + itemDistance;
      } else {
        const textWidth = this.config.itemWidth || label.length * 7;
        const fullItemWidth = symbolWidth + symbolPadding + textWidth;
        itemX = offsetX;
        itemY = offsetY + itemMarginTop;
        maxRowWidth = Math.max(maxRowWidth, offsetX + fullItemWidth);
        offsetX = padding;
        offsetY += rowStep;
      }

      const itemGroup = this.group.append('g')
        .attr('class', 'katucharts-legend-item')
        .attr('transform', `translate(${itemX},${itemY})`)
        .style('cursor', 'pointer');

      const customShape = s.getLegendSymbolShape();
      if (isLine) {
        itemGroup.append('line')
          .attr('x1', 0).attr('x2', symbolWidth)
          .attr('y1', 6).attr('y2', 6)
          .attr('stroke', color)
          .attr('stroke-width', 2);
        itemGroup.append('circle')
          .attr('cx', symbolWidth / 2)
          .attr('cy', 6)
          .attr('r', 3)
          .attr('fill', color);
      } else if (customShape) {
        const cx = symbolWidth / 2;
        const cy = symbolHeight / 2;
        const r = Math.min(symbolWidth, symbolHeight) / 2;
        if (customShape === 'circle') {
          itemGroup.append('circle').attr('cx', cx).attr('cy', cy).attr('r', r).attr('fill', color);
        } else if (customShape === 'square') {
          itemGroup.append('rect').attr('x', 0).attr('y', 0).attr('width', symbolWidth).attr('height', symbolHeight).attr('fill', color);
        } else if (customShape === 'diamond') {
          itemGroup.append('path').attr('d', `M ${cx} 0 L ${symbolWidth} ${cy} L ${cx} ${symbolHeight} L 0 ${cy} Z`).attr('fill', color);
        } else if (customShape === 'triangle') {
          itemGroup.append('path').attr('d', `M ${cx} 0 L ${symbolWidth} ${symbolHeight} L 0 ${symbolHeight} Z`).attr('fill', color);
        } else if (customShape === 'triangle-down') {
          itemGroup.append('path').attr('d', `M 0 0 L ${symbolWidth} 0 L ${cx} ${symbolHeight} Z`).attr('fill', color);
        } else if (customShape === 'cross') {
          itemGroup.append('path').attr('d', `M 0 ${cy} L ${symbolWidth} ${cy} M ${cx} 0 L ${cx} ${symbolHeight}`).attr('stroke', color).attr('stroke-width', 2);
        } else {
          itemGroup.append('circle').attr('cx', cx).attr('cy', cy).attr('r', r).attr('fill', color);
        }
      } else if (squareSymbol) {
        itemGroup.append('rect')
          .attr('x', 0).attr('y', 0)
          .attr('width', symbolWidth)
          .attr('height', symbolHeight)
          .attr('rx', symbolRadius)
          .attr('fill', color);
      } else {
        itemGroup.append('circle')
          .attr('cx', symbolWidth / 2)
          .attr('cy', symbolHeight / 2)
          .attr('r', Math.min(symbolWidth, symbolHeight) / 2)
          .attr('fill', color);
      }

      const textEl = itemGroup.append('text')
        .attr('x', symbolWidth + symbolPadding)
        .attr('y', 10)
        .attr('fill', s.visible ? (itemStyle.color as string || '#333333') : (this.config.itemHiddenStyle?.color as string || '#cccccc'))
        .attr('font-size', effectiveFontSize)
        .attr('font-weight', itemStyle.fontWeight as string || 'normal')
        .text(label);

      if (this.config.rtl) {
        textEl.attr('text-anchor', 'end')
          .attr('x', -(symbolPadding));
        itemGroup.select('rect, circle, line').attr('transform', `translate(${-(symbolWidth + symbolPadding)}, 0)`);
      }

      itemGroup.on('click', () => {
        const eventsConfig = this.config.events;
        if (eventsConfig?.itemClick) {
          const result = eventsConfig.itemClick.call(s, new Event('legendItemClick'));
          if (result === false) return;
        }

        s.toggleVisible();
        textEl.attr('fill', s.visible
          ? (itemStyle.color as string || '#333333')
          : (this.config.itemHiddenStyle?.color as string || '#cccccc')
        );
        const result = s.config.events?.legendItemClick?.call(s, new Event('legendItemClick'));
        if (result !== false) {
          this.events.emit('legend:itemClick', s, i);
        }
      });

      itemGroup.on('mouseover', () => {
        textEl.attr('fill', this.config.itemHoverStyle?.color as string || '#000000');
        this.events.emit('legend:itemHover', s);
      });
      itemGroup.on('mouseout', () => {
        textEl.attr('fill', s.visible
          ? (itemStyle.color as string || '#333333')
          : (this.config.itemHiddenStyle?.color as string || '#cccccc')
        );
        this.events.emit('legend:itemLeave');
      });

      itemGroups.push(itemGroup);
    });

    const showGridPage = (page: number, animate = false) => {
      const startRow = page * maxGridRows;
      const endRow = startRow + maxGridRows;
      itemGroups.forEach((g, i) => {
        const row = Math.floor(i / gridColumns);
        const visible = row >= startRow && row < endRow;
        if (visible) {
          const col = i % gridColumns;
          const gridTotalWidth = gridColumns * gridItemWidth;
          const gridOffsetX = Math.max(0, (availWidth - gridTotalWidth) / 2);
          const x = padding + gridOffsetX + col * gridItemWidth;
          const y = contentStartY + (row - startRow) * rowStep + (this.config.itemMarginTop ?? 0);
          g.style('display', 'block');
          if (animate) {
            g.style('opacity', '0')
              .attr('transform', `translate(${x},${y})`)
              .transition().duration(250).style('opacity', '1');
          } else {
            g.attr('transform', `translate(${x},${y})`).style('opacity', '1');
          }
        } else {
          if (animate) {
            g.transition().duration(150).style('opacity', '0')
              .on('end', function() { g.style('display', 'none'); });
          } else {
            g.style('display', 'none');
          }
        }
      });
    };

    let totalWidth: number;
    let totalHeight: number;

    if (useGrid) {
      const visibleRows = Math.min(totalGridRows, maxGridRows);
      totalWidth = availWidth + padding * 2;
      totalHeight = contentStartY + visibleRows * rowStep + padding;

      if (totalGridRows > maxGridRows) {
        showGridPage(0);
        const totalPages = Math.ceil(totalGridRows / maxGridRows);
        const arrowRightX = availWidth - 20;
        const arrowCenterY = contentStartY + (Math.min(totalGridRows, maxGridRows) * rowStep) / 2;

        const navGroup = this.group.append('g').attr('class', 'katucharts-legend-nav');
        const btnSize = 22;

        const upArrow = navGroup.append('g')
          .attr('transform', `translate(${arrowRightX},${arrowCenterY - btnSize - 2})`)
          .style('cursor', 'pointer')
          .style('opacity', '0.3');
        upArrow.append('rect')
          .attr('x', 0).attr('y', 0)
          .attr('width', btnSize).attr('height', btnSize)
          .attr('rx', 4).attr('fill', '#f0f0f0').attr('stroke', '#ccc').attr('stroke-width', 1);
        upArrow.append('path')
          .attr('d', `M${btnSize / 2 - 5},${btnSize / 2 + 2} L${btnSize / 2},${btnSize / 2 - 4} L${btnSize / 2 + 5},${btnSize / 2 + 2}`)
          .attr('fill', 'none').attr('stroke', '#555').attr('stroke-width', 2).attr('stroke-linecap', 'round');
        upArrow.on('mouseover', function() { upArrow.select('rect').attr('fill', '#e0e0e0'); });
        upArrow.on('mouseout', function() { upArrow.select('rect').attr('fill', '#f0f0f0'); });

        const downArrow = navGroup.append('g')
          .attr('transform', `translate(${arrowRightX},${arrowCenterY + 2})`)
          .style('cursor', 'pointer');
        downArrow.append('rect')
          .attr('x', 0).attr('y', 0)
          .attr('width', btnSize).attr('height', btnSize)
          .attr('rx', 4).attr('fill', '#f0f0f0').attr('stroke', '#ccc').attr('stroke-width', 1);
        downArrow.append('path')
          .attr('d', `M${btnSize / 2 - 5},${btnSize / 2 - 2} L${btnSize / 2},${btnSize / 2 + 4} L${btnSize / 2 + 5},${btnSize / 2 - 2}`)
          .attr('fill', 'none').attr('stroke', '#555').attr('stroke-width', 2).attr('stroke-linecap', 'round');
        downArrow.on('mouseover', function() { downArrow.select('rect').attr('fill', '#e0e0e0'); });
        downArrow.on('mouseout', function() { downArrow.select('rect').attr('fill', '#f0f0f0'); });

        upArrow.on('click', () => {
          if (gridPage > 0) {
            gridPage--;
            showGridPage(gridPage, true);
            upArrow.style('opacity', gridPage === 0 ? '0.3' : '1');
            downArrow.style('opacity', gridPage >= totalPages - 1 ? '0.3' : '1');
          }
        });
        downArrow.on('click', () => {
          if (gridPage < totalPages - 1) {
            gridPage++;
            showGridPage(gridPage, true);
            upArrow.style('opacity', gridPage === 0 ? '0.3' : '1');
            downArrow.style('opacity', gridPage >= totalPages - 1 ? '0.3' : '1');
          }
        });
      }
    } else if (layout === 'horizontal') {
      totalWidth = maxRowWidth + padding;
      totalHeight = offsetY + lineHeight + padding;
    } else {
      totalWidth = legendWidth || 150;
      totalHeight = offsetY + lineHeight + padding;
    }

    this.contentHeight = totalHeight;

    if (this.config.backgroundColor || this.config.borderWidth || this.config.shadow) {
      const bg = this.group.insert('rect', ':first-child')
        .attr('class', 'katucharts-legend-bg')
        .attr('x', 0).attr('y', 0)
        .attr('width', totalWidth)
        .attr('height', maxHeight ? Math.min(totalHeight, maxHeight) : totalHeight)
        .attr('rx', this.config.borderRadius ?? 0)
        .attr('fill', this.config.backgroundColor || 'none')
        .attr('stroke', this.config.borderColor || 'none')
        .attr('stroke-width', this.config.borderWidth ?? 0);

      if (this.config.shadow) {
        bg.attr('filter', 'drop-shadow(2px 2px 4px rgba(0,0,0,0.15))');
      }
    }

    if (maxHeight && totalHeight > maxHeight) {
      this.visibleHeight = maxHeight;
      const clipId = `katucharts-legend-clip-${Math.random().toString(36).slice(2, 8)}`;
      const defs = this.group.append('defs');
      defs.append('clipPath').attr('id', clipId)
        .append('rect')
        .attr('width', totalWidth)
        .attr('height', maxHeight);

      this.group.attr('clip-path', `url(#${clipId})`);

      if (this.config.navigation?.enabled !== false) {
        this.renderNavigationArrows(totalWidth, maxHeight);
      }
    }

    const clampedWidth = this.config.maxWidth ? Math.min(totalWidth, this.config.maxWidth) : totalWidth;

    let legendX = layoutArea.x;
    const align = this.config.align || 'center';
    if (align === 'center') legendX = layoutArea.x + (layoutArea.width - clampedWidth) / 2;
    else if (align === 'right') legendX = layoutArea.x + layoutArea.width - clampedWidth;

    const finalX = legendX + (this.config.x || 0);
    const finalY = layoutArea.y + (this.config.y || 0);

    this.group.attr('transform', `translate(${finalX},${finalY})`);

    if (this.config.floating) {
      this.group.style('pointer-events', 'all');
    }
  }

  private renderNavigationArrows(totalWidth: number, maxHeight: number): void {
    const nav = this.config.navigation || {};
    const activeColor = nav.activeColor || '#003399';
    const inactiveColor = nav.inactiveColor || '#cccccc';
    const arrowSize = nav.arrowSize ?? 12;

    const upArrow = this.group.append('g')
      .attr('class', 'katucharts-legend-nav-up')
      .attr('transform', `translate(${totalWidth / 2},${2})`)
      .style('cursor', 'pointer');

    upArrow.append('path')
      .attr('d', `M${-arrowSize / 2},${arrowSize / 2} L0,${-arrowSize / 2} L${arrowSize / 2},${arrowSize / 2}`)
      .attr('fill', this.scrollOffset > 0 ? activeColor : inactiveColor)
      .attr('stroke', 'none');

    upArrow.on('click', () => {
      if (this.scrollOffset > 0) {
        this.scrollOffset = Math.max(0, this.scrollOffset - 40);
        this.applyScroll();
      }
    });

    const downArrow = this.group.append('g')
      .attr('class', 'katucharts-legend-nav-down')
      .attr('transform', `translate(${totalWidth / 2},${maxHeight - 2})`)
      .style('cursor', 'pointer');

    downArrow.append('path')
      .attr('d', `M${-arrowSize / 2},${-arrowSize / 2} L0,${arrowSize / 2} L${arrowSize / 2},${-arrowSize / 2}`)
      .attr('fill', this.contentHeight > maxHeight + this.scrollOffset ? activeColor : inactiveColor)
      .attr('stroke', 'none');

    downArrow.on('click', () => {
      const maxScroll = this.contentHeight - this.visibleHeight;
      if (this.scrollOffset < maxScroll) {
        this.scrollOffset = Math.min(maxScroll, this.scrollOffset + 40);
        this.applyScroll();
      }
    });
  }

  private applyScroll(): void {
    const offset = this.scrollOffset;
    this.group.selectAll('.katucharts-legend-item')
      .each(function() {
        const el = this as SVGGElement;
        const current = el.getAttribute('transform') || '';
        const match = current.match(/translate\(([^,]+),([^)]+)\)/);
        if (match) {
          const origY = parseFloat(el.getAttribute('data-orig-y') || match[2]);
          if (!el.hasAttribute('data-orig-y')) {
            el.setAttribute('data-orig-y', match[2]);
          }
          el.setAttribute('transform', `translate(${match[1]},${origY - offset})`);
        }
      });
  }

  destroy(): void {
    if (this.group) this.group.remove();
  }
}

import { Selection } from 'd3-selection';
import type { LegendOptions, PlotArea } from '../types/options';
import { EventBus } from '../core/EventBus';
import { templateFormat, stripHtmlTags } from '../utils/format';
import type { BaseSeries } from '../series/BaseSeries';
import { DEFAULT_CHART_TEXT_COLOR, DEFAULT_CHART_TEXT_SIZE, parseFontSizePx, readableTextColor } from '../utils/chartText';

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

  /** Readable legend text color when none is configured — adapts to the chart background. */
  private autoText(): string {
    return readableTextColor((this.config as any)._backgroundColor);
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
    return baseFontSize || DEFAULT_CHART_TEXT_SIZE;
  }

  private estimateTextWidth(text: string, fontSize: string): number {
    const size = parseFontSizePx(fontSize);
    return text.length * size * 0.62;
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

    const fontPx = parseFontSizePx(config.fontSize);
    let maxTextWidth = 0;
    for (const label of labels) {
      const w = label.length * fontPx * 0.62;
      if (w > maxTextWidth) maxTextWidth = w;
    }

    const computedItemWidth = config.symbolWidth + config.symbolPadding + maxTextWidth + 8;
    const cols = Math.max(1, Math.floor(availWidth / computedItemWidth));
    return { columns: cols, itemWidth: computedItemWidth };
  }

  render(series: BaseSeries[], layoutArea: { x: number; y: number; width: number; height: number }): void {
    if (this.config.enabled === false || !this.group) return;

    this.series = series;
    this.group.selectAll('*').remove();

    /**
     * A series bound to another via `linkedTo` (e.g. an arearange band attached
     * to its line) is not listed in the legend — it shares the parent's entry,
     * matching the convention for linked series.
     */
    let visibleSeries = series.filter(s =>
      s.config.showInLegend !== false && !(s.config as any).linkedTo
    );
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

    const baseFontSize = itemStyle.fontSize as string || DEFAULT_CHART_TEXT_SIZE;
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
        .attr('font-size', titleStyle.fontSize as string || DEFAULT_CHART_TEXT_SIZE)
        .attr('font-weight', titleStyle.fontWeight as string || 'bold')
        .attr('fill', titleStyle.color as string || '#333')
        .text(this.config.title.text);
      offsetY += 20;
    }

    const contentStartY = offsetY;
    const availWidth = legendWidth || (layoutArea.width - padding * 2);
    const rowStep = lineHeight + itemMarginBottom + itemMarginTop;

    type LegendEntry = { label: string; color: string; series: BaseSeries; isLine: boolean; multiIndex?: number; visible: boolean };
    const entries: LegendEntry[] = [];
    for (const s of visibleSeries) {
      const multiItems = s.getMultiLegendItems();
      const isLine = ['line', 'spline', 'area', 'areaspline', 'radar', 'polar'].includes(s.config._internalType);
      if (multiItems) {
        multiItems.forEach((item, mi) => {
          entries.push({ label: item.label, color: item.color, series: s, isLine, multiIndex: mi, visible: item.visible !== false });
        });
      } else {
        entries.push({ label: this.resolveLabel(s), color: s.getColor(), series: s, isLine, visible: s.visible });
      }
    }
    const labels = entries.map(e => e.label);

    let naturalFlowWidth = 0;
    if (layout === 'horizontal') {
      for (let i = 0; i < labels.length; i++) {
        const w = symbolWidth + symbolPadding + this.estimateTextWidth(labels[i], effectiveFontSize);
        naturalFlowWidth += w + (i < labels.length - 1 ? itemDistance : 0);
      }
    }
    const useGrid = layout === 'horizontal'
      && entries.length > 8
      && naturalFlowWidth > availWidth;
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
      let curVisible = entry.visible;

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
        const textWidth = this.config.itemWidth || this.estimateTextWidth(label, effectiveFontSize);
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
        const textWidth = this.config.itemWidth || this.estimateTextWidth(label, effectiveFontSize);
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
        .attr('fill', curVisible ? (itemStyle.color as string || this.autoText()) : (this.config.itemHiddenStyle?.color as string || '#cccccc'))
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

        /**
         * Per-category legend items (multi-item series like item/classroom) hide
         * just their own category and let the series re-lay-out; everything else
         * toggles the whole series. `toggleLegendItem` returns null when the
         * series opts out, so the fallback preserves existing behavior.
         */
        const perItem = entry.multiIndex !== undefined ? s.toggleLegendItem(entry.multiIndex) : null;
        if (perItem === null) {
          s.toggleVisible();
          curVisible = s.visible;
        } else {
          curVisible = perItem;
        }
        textEl.attr('fill', curVisible
          ? (itemStyle.color as string || this.autoText())
          : (this.config.itemHiddenStyle?.color as string || '#cccccc')
        );
        const result = s.config.events?.legendItemClick?.call(s, new Event('legendItemClick'));
        if (result !== false) {
          this.events.emit('legend:itemClick', s, i);
        }
      });

      itemGroup.on('mouseover', () => {
        textEl.attr('fill', this.config.itemHoverStyle?.color as string || this.autoText());
        this.events.emit('legend:itemHover', s);
      });
      itemGroup.on('mouseout', () => {
        textEl.attr('fill', curVisible
          ? (itemStyle.color as string || this.autoText())
          : (this.config.itemHiddenStyle?.color as string || '#cccccc')
        );
        this.events.emit('legend:itemLeave');
      });

      itemGroups.push(itemGroup);
    });

    let bubbleWidth = 0;
    let bubbleHeight = 0;
    let bubbleStartX = 0;
    let bubbleTopY = 0;
    const bubbleInfo = this.config.bubbleLegend?.enabled
      ? series.map(s => s.getBubbleLegendInfo()).find((info): info is NonNullable<typeof info> => !!info)
      : undefined;
    if (bubbleInfo) {
      const separateHoriz = layout === 'horizontal' && this.config.bubbleLegend?.layout === 'separate';
      if (separateHoriz) {
        /**
         * Bottom legends with the separate layout read as a centered title with
         * the size bubbles beneath it: stack the cluster under the series row and
         * center both within the legend width.
         */
        bubbleTopY = entries.length ? offsetY + rowStep : contentStartY;
        const res = this.renderBubbleLegend(bubbleInfo, 0, bubbleTopY);
        bubbleWidth = res.width;
        bubbleHeight = res.height;

        const seriesRowWidth = entries.length ? Math.max(0, maxRowWidth - padding) : 0;
        const contentWidth = Math.max(seriesRowWidth, bubbleWidth);
        bubbleStartX = padding + Math.max(0, (contentWidth - bubbleWidth) / 2);
        this.group.select('.katucharts-bubble-legend').attr('transform', `translate(${bubbleStartX},0)`);

        const seriesDX = Math.max(0, (contentWidth - seriesRowWidth) / 2);
        if (seriesDX > 0) {
          for (const g of itemGroups) {
            const m = /translate\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/.exec(g.attr('transform') || '');
            if (m) g.attr('transform', `translate(${parseFloat(m[1]) + seriesDX},${m[2]})`);
          }
        }
      } else {
        /**
         * Horizontal legends place the size cluster to the right of the series
         * items; vertical legends stack it underneath them.
         */
        if (layout === 'horizontal') {
          bubbleStartX = entries.length ? maxRowWidth + itemDistance : padding;
          bubbleTopY = contentStartY;
        } else {
          bubbleStartX = padding;
          bubbleTopY = (entries.length ? offsetY + 6 : contentStartY);
        }
        const res = this.renderBubbleLegend(bubbleInfo, bubbleStartX, bubbleTopY);
        bubbleWidth = res.width;
        bubbleHeight = res.height;
      }
    }

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
      totalWidth = legendWidth || (maxRowWidth + padding) || 150;
      totalHeight = offsetY + lineHeight + padding;
    }

    if (bubbleInfo) {
      totalWidth = Math.max(totalWidth, bubbleStartX + bubbleWidth + padding);
      totalHeight = Math.max(totalHeight, bubbleTopY + bubbleHeight + padding);
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

    const align = this.config.align || 'center';
    const isSide = layout === 'vertical' && (align === 'left' || align === 'right');
    let legendX: number;
    if (isSide) {
      legendX = layoutArea.x + 2;
    } else if (align === 'center') {
      legendX = layoutArea.x + (layoutArea.width - clampedWidth) / 2;
    } else if (align === 'right') {
      legendX = layoutArea.x + layoutArea.width - clampedWidth;
    } else {
      legendX = layoutArea.x;
    }

    /**
     * A vertical legend aligned left/right is rendered as a side strip: its
     * content hugs the inner edge and is centered vertically against the plot.
     */
    let finalY = layoutArea.y + (this.config.y || 0);
    if (isSide || this.config.verticalAlign === 'middle') {
      finalY = layoutArea.y + Math.max(0, (layoutArea.height - totalHeight) / 2) + (this.config.y || 0);
    }

    const finalX = legendX + (this.config.x || 0);
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

  /**
   * Draws the size-reference circles for a bubble series: nested circles sharing
   * a common baseline, each with a connector line to its formatted z value. The
   * radii come straight from the series' own size scale so the legend matches the
   * rendered bubbles exactly.
   */
  private renderBubbleLegend(
    info: { sizeBy: 'area' | 'width'; color: string; ranges: { value: number; radius: number }[] },
    startX: number,
    topY: number
  ): { width: number; height: number } {
    const opts = this.config.bubbleLegend || {};
    if (opts.layout === 'separate') return this.renderBubbleLegendSeparate(info, startX, topY);
    const ranges = [...info.ranges].sort((a, b) => b.radius - a.radius);
    const maxRadius = ranges[0].radius;
    if (!(maxRadius > 0)) return { width: 0, height: 0 };

    const fontSize = (opts.labels?.style?.fontSize as string) || DEFAULT_CHART_TEXT_SIZE;
    const borderColor = opts.borderColor || info.color;
    const borderWidth = opts.borderWidth ?? 1.5;
    const fillColor = opts.color || 'rgba(0,0,0,0)';
    const connectorColor = opts.connectorColor || borderColor;
    const connectorWidth = opts.connectorWidth ?? 1;
    const connectorDistance = opts.connectorDistance ?? 16;
    const labelColor = (opts.labels?.style?.color as string) || DEFAULT_CHART_TEXT_COLOR;

    const g = this.group.append('g').attr('class', 'katucharts-bubble-legend');
    const cx = startX + maxRadius;
    const baseline = topY + 2 * maxRadius;
    const labelX = startX + 2 * maxRadius + connectorDistance;

    let maxLabelWidth = 0;
    for (const r of ranges) {
      const top = baseline - 2 * r.radius;
      g.append('circle')
        .attr('cx', cx).attr('cy', baseline - r.radius).attr('r', r.radius)
        .attr('fill', fillColor)
        .attr('stroke', borderColor)
        .attr('stroke-width', borderWidth);
      g.append('line')
        .attr('x1', cx).attr('y1', top)
        .attr('x2', labelX).attr('y2', top)
        .attr('stroke', connectorColor)
        .attr('stroke-width', connectorWidth)
        .attr('stroke-dasharray', '2,2');

      let text: string;
      if (opts.labels?.formatter) {
        text = opts.labels.formatter.call({ value: r.value });
      } else if (opts.labels?.format) {
        text = stripHtmlTags(templateFormat(opts.labels.format, { value: r.value }));
      } else {
        text = String(r.value);
      }
      g.append('text')
        .attr('x', labelX + 4).attr('y', top)
        .attr('dominant-baseline', 'middle')
        .attr('font-size', fontSize)
        .attr('fill', labelColor)
        .text(text);
      maxLabelWidth = Math.max(maxLabelWidth, this.estimateTextWidth(text, fontSize));
    }

    return {
      width: 2 * maxRadius + connectorDistance + maxLabelWidth + 8,
      height: 2 * maxRadius,
    };
  }

  /**
   * Alternative bubble-legend layout: each size reference is its own circle with
   * the value beside it, rather than nested concentric circles. Lays the items
   * out as a vertical list for side legends and as a baseline-aligned row for
   * bottom legends, so the size key reads cleanly in any placement.
   */
  private renderBubbleLegendSeparate(
    info: { sizeBy: 'area' | 'width'; color: string; ranges: { value: number; radius: number }[] },
    startX: number,
    topY: number
  ): { width: number; height: number } {
    const opts = this.config.bubbleLegend || {};
    const ranges = [...info.ranges].sort((a, b) => a.radius - b.radius);
    const maxRadius = ranges[ranges.length - 1].radius;
    if (!(maxRadius > 0)) return { width: 0, height: 0 };

    const fontSize = (opts.labels?.style?.fontSize as string) || DEFAULT_CHART_TEXT_SIZE;
    const fontPx = parseFloat(fontSize) || 12;
    const borderColor = opts.borderColor || info.color;
    const borderWidth = opts.borderWidth ?? 1.5;
    const fillColor = opts.color || 'rgba(0,0,0,0)';
    const labelColor = (opts.labels?.style?.color as string) || DEFAULT_CHART_TEXT_COLOR;
    const gap = opts.connectorDistance ?? 8;

    const fmt = (value: number): string => {
      if (opts.labels?.formatter) return opts.labels.formatter.call({ value });
      if (opts.labels?.format) return stripHtmlTags(templateFormat(opts.labels.format, { value }));
      return String(value);
    };

    const g = this.group.append('g').attr('class', 'katucharts-bubble-legend');
    const circle = (cx: number, cy: number, r: number) =>
      g.append('circle').attr('cx', cx).attr('cy', cy).attr('r', r)
        .attr('fill', fillColor).attr('stroke', borderColor).attr('stroke-width', borderWidth);

    if (this.config.layout === 'horizontal') {
      /**
       * Bottom legends read top-down: each value sits centered just above its own
       * bubble, and the bubbles share a baseline so they line up along the bottom.
       */
      const labelBand = fontPx + 6;
      const baseline = topY + labelBand + 2 * maxRadius;
      let x = startX;
      for (const r of ranges) {
        const cx = x + r.radius;
        const ballTop = baseline - 2 * r.radius;
        circle(cx, baseline - r.radius, r.radius);
        const text = fmt(r.value);
        g.append('text')
          .attr('x', cx).attr('y', ballTop - 4)
          .attr('text-anchor', 'middle')
          .attr('font-size', fontSize).attr('fill', labelColor)
          .text(text);
        const itemW = Math.max(2 * r.radius, this.estimateTextWidth(text, fontSize));
        x += itemW + gap + 6;
      }
      return { width: Math.max(0, x - startX - (gap + 6)), height: labelBand + 2 * maxRadius };
    }

    const cx = startX + maxRadius;
    const labelX = startX + 2 * maxRadius + gap;
    let y = topY;
    let maxLabelWidth = 0;
    const rowGap = 10;
    for (const r of ranges) {
      const cy = y + r.radius;
      circle(cx, cy, r.radius);
      const text = fmt(r.value);
      g.append('text')
        .attr('x', labelX).attr('y', cy)
        .attr('dominant-baseline', 'middle')
        .attr('font-size', fontSize).attr('fill', labelColor)
        .text(text);
      maxLabelWidth = Math.max(maxLabelWidth, this.estimateTextWidth(text, fontSize));
      y += 2 * r.radius + rowGap;
    }
    return { width: 2 * maxRadius + gap + maxLabelWidth + 8, height: Math.max(0, y - topY - rowGap) };
  }

  destroy(): void {
    if (this.group) this.group.remove();
  }
}

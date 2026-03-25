import { Selection } from 'd3-selection';
import type { LegendOptions, PlotArea } from '../types/options';
import { EventBus } from '../core/EventBus';
import { templateFormat } from '../utils/format';
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
    const symbolWidth = this.config.symbolWidth ?? 16;
    const symbolHeight = this.config.symbolHeight ?? 12;
    const symbolPadding = this.config.symbolPadding ?? 5;
    const symbolRadius = this.config.symbolRadius ?? 2;
    const squareSymbol = this.config.squareSymbol !== false;
    const itemDistance = this.config.itemDistance ?? 20;
    const itemStyle = this.config.itemStyle || {};
    const itemMarginTop = this.config.itemMarginTop ?? 0;
    const itemMarginBottom = this.config.itemMarginBottom ?? 0;
    const lineHeight = this.config.lineHeight ?? 16;
    const maxHeight = this.config.maxHeight;
    const legendWidth = this.config.width;

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

    visibleSeries.forEach((s, i) => {
      const itemGroup = this.group.append('g')
        .attr('class', 'katucharts-legend-item')
        .attr('transform', `translate(${offsetX},${offsetY + itemMarginTop})`)
        .style('cursor', 'pointer');

      const color = s.getColor();
      const isLine = ['line', 'spline', 'area', 'areaspline'].includes(s.config._internalType);

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
        label = templateFormat(this.config.labelFormat, ctx);
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

      const textEl = itemGroup.append('text')
        .attr('x', symbolWidth + symbolPadding)
        .attr('y', 10)
        .attr('fill', s.visible ? (itemStyle.color as string || '#333333') : (this.config.itemHiddenStyle?.color as string || '#cccccc'))
        .attr('font-size', itemStyle.fontSize as string || '12px')
        .attr('font-weight', itemStyle.fontWeight as string || 'bold')
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
      });
      itemGroup.on('mouseout', () => {
        textEl.attr('fill', s.visible
          ? (itemStyle.color as string || '#333333')
          : (this.config.itemHiddenStyle?.color as string || '#cccccc')
        );
      });

      const textWidth = this.config.itemWidth || label.length * 7;
      const itemWidth = symbolWidth + symbolPadding + textWidth;
      maxRowWidth = Math.max(maxRowWidth, offsetX + itemWidth);

      const availWidth = legendWidth || (layoutArea.width - padding * 2);
      const rowStep = lineHeight + 4 + itemMarginBottom + itemMarginTop;
      if (layout === 'horizontal') {
        offsetX += itemWidth + itemDistance;
        if (offsetX > availWidth && i < visibleSeries.length - 1) {
          offsetX = padding;
          offsetY += rowStep;
        }
      } else {
        offsetX = padding;
        offsetY += rowStep;
      }
    });

    const totalWidth = layout === 'horizontal' ? maxRowWidth + padding : (legendWidth || 150);
    const totalHeight = offsetY + 16 + padding;
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

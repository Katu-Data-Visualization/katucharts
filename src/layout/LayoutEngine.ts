/**
 * Computes the plot area by measuring title, subtitle, axes, and legend space.
 */

import type { InternalConfig, PlotArea } from '../types/options';
import { DEFAULT_CHART_TEXT_SIZE } from '../utils/chartText';

export interface LayoutResult {
  plotArea: PlotArea;
  titleArea: { x: number; y: number; width: number; height: number };
  subtitleArea: { x: number; y: number; width: number; height: number };
  legendArea: { x: number; y: number; width: number; height: number };
}

export class LayoutEngine {
  compute(config: InternalConfig, chartWidth: number, chartHeight: number): LayoutResult {
    const spacing = this.getSpacing(config);
    let top = spacing.top;
    let bottom = spacing.bottom;
    const left = spacing.left;
    const right = spacing.right;

    const titleWidthAdjust = config.title?.widthAdjust ?? -44;
    const titleAvailableWidth = chartWidth + titleWidthAdjust;
    const titleStyle = config.title?.style?.fontSize ? config.title.style : { ...config.title?.style, fontSize: '18px' };
    const titleTextHeight = config.title?.text
      ? this.estimateWrappedTextHeight(config.title.text, titleStyle, titleAvailableWidth)
      : 0;
    const titleMargin = config.title?.margin ?? 8;
    const subtitleTextHeight = config.subtitle?.text
      ? this.estimateWrappedTextHeight(config.subtitle.text, config.subtitle.style, titleAvailableWidth)
      : 0;

    if (titleTextHeight > 0) {
      top = spacing.top + titleTextHeight + (subtitleTextHeight > 0 ? 3 : titleMargin);
    }
    if (subtitleTextHeight > 0) {
      top += subtitleTextHeight + titleMargin;
    }

    const hasHeatmap = config.series.some(s => s._internalType === 'heatmap');
    // For heatmaps, the color axis serves as the legend and is rendered within the plot group
    const legendHeight = hasHeatmap ? 0 : this.estimateLegendHeight(config, chartWidth);
    const legendPosition = config.legend?.verticalAlign || 'bottom';
    if (legendPosition === 'bottom') {
      bottom = Math.max(bottom, spacing.bottom) + legendHeight;
    } else if (legendPosition === 'top') {
      top += legendHeight;
    }

    const isNonCartesian = this.isNonCartesian(config);
    const inv = !!config.chart.inverted;

    const layoutConfig = inv
      ? { ...config, xAxis: config.yAxis, yAxis: config.xAxis } as InternalConfig
      : config;
    const yAxisLeftWidth = isNonCartesian ? 0 : this.estimateAxisWidth(layoutConfig, true);
    const yAxisRightWidth = isNonCartesian ? 0 : this.estimateAxisWidth(layoutConfig, false);
    const xAxisBottomHeight = isNonCartesian ? 0 : this.estimateAxisHeight(layoutConfig);

    let colorAxisRightWidth = 0;
    if (hasHeatmap && config.colorAxis?.length > 0 && config.legend?.layout === 'vertical') {
      colorAxisRightWidth = 55;
    }

    const plotX = left + yAxisLeftWidth;
    const plotY = top;
    const plotWidth = Math.max(0, chartWidth - left - right - yAxisLeftWidth - yAxisRightWidth - colorAxisRightWidth);
    const hasExplicitMarginBottom = config.chart?.marginBottom !== undefined;
    const plotHeight = Math.max(0, chartHeight - top - bottom - (hasExplicitMarginBottom ? 0 : xAxisBottomHeight));

    return {
      plotArea: { x: plotX, y: plotY, width: plotWidth, height: plotHeight },
      titleArea: {
        x: spacing.left,
        y: spacing.top,
        width: chartWidth - spacing.left - spacing.right,
        height: titleTextHeight + titleMargin,
      },
      subtitleArea: {
        x: spacing.left,
        y: spacing.top + titleTextHeight + titleMargin,
        width: chartWidth - spacing.left - spacing.right,
        height: subtitleTextHeight,
      },
      legendArea: {
        x: 0,
        y: legendPosition === 'top' ? top - legendHeight : chartHeight - bottom,
        width: chartWidth,
        height: legendHeight,
      },
    };
  }

  private isNonCartesian(config: InternalConfig): boolean {
    const noAxesTypes = new Set([
      'pie', 'donut', 'sunburst', 'treemap', 'sankey', 'dependencywheel',
      'networkgraph', 'gauge', 'solidgauge', 'polar', 'radar', 'funnel',
      'pyramid', 'timeline', 'map', 'barchartrace', 'venn',
      'clusteredheatmap', 'phylotree', 'circos',
      'circosChord', 'circosHeatmap', 'circosComparative', 'circosSpiral',
    ]);
    return config.series.length > 0 &&
      config.series.every(s => noAxesTypes.has(s._internalType));
  }

  private getSpacing(config: InternalConfig) {
    const chart = config.chart;
    if (chart.margin !== undefined) {
      const m = chart.margin;
      if (typeof m === 'number') {
        return { top: m, right: m, bottom: m, left: m };
      }
      if (Array.isArray(m)) {
        return {
          top: m[0] ?? 10,
          right: m[1] ?? 10,
          bottom: m[2] ?? 15,
          left: m[3] ?? 10,
        };
      }
    }
    const s = chart.spacing || [10, 10, 15, 10];
    const hasExportButton = config.exporting?.enabled !== false;
    const defaultRight = hasExportButton ? 40 : (s[1] ?? 10);
    return {
      top: chart.marginTop ?? chart.spacingTop ?? s[0],
      right: chart.marginRight ?? chart.spacingRight ?? defaultRight,
      bottom: chart.marginBottom ?? chart.spacingBottom ?? s[2],
      left: chart.marginLeft ?? chart.spacingLeft ?? s[3],
    };
  }

  private estimateTextHeight(style?: Record<string, any>): number {
    const fontSize = parseInt(style?.fontSize || '12', 10);
    return fontSize * 1.4;
  }

  private estimateWrappedTextHeight(text: string, style?: Record<string, any>, availableWidth?: number): number {
    const fontSize = parseInt(style?.fontSize || '12', 10);
    const lineHeight = fontSize * 1.4;
    if (!availableWidth || availableWidth <= 0) return lineHeight;
    const avgCharWidth = fontSize * 0.55;
    const charsPerLine = Math.floor(availableWidth / avgCharWidth);
    if (charsPerLine <= 0) return lineHeight;
    const lines = Math.ceil(text.length / charsPerLine);
    return lineHeight * Math.max(lines, 1);
  }

  private computeAutoFontSize(_itemCount: number, baseFontSize: string): string {
    return baseFontSize || '12px';
  }

  private estimateLegendHeight(config: InternalConfig, chartWidth: number): number {
    if (!config.legend?.enabled) return 0;
    const visibleSeries = config.series.filter(s => s.showInLegend !== false);
    const numSeries = visibleSeries.length;
    if (numSeries === 0) return 0;

    const margin = config.legend.margin ?? 8;
    const layout = config.legend.layout || 'horizontal';
    const itemStyle = config.legend.itemStyle || {};
    const baseFontSize = itemStyle.fontSize as string || DEFAULT_CHART_TEXT_SIZE;
    const effectiveFontSize = this.computeAutoFontSize(numSeries, baseFontSize);
    const lineHeight = config.legend.lineHeight ?? 16;
    const itemMarginBottom = config.legend.itemMarginBottom ?? 2;
    const itemMarginTop = config.legend.itemMarginTop ?? 0;
    const rowStep = lineHeight + itemMarginBottom + itemMarginTop;

    if (layout === 'horizontal') {
      const padding = config.legend.padding ?? 4;
      const symbolWidth = config.legend.symbolWidth ?? 10;
      const symbolPadding = config.legend.symbolPadding ?? 5;
      const itemDistance = config.legend.itemDistance ?? 20;
      const spacing = this.getSpacing(config);
      const availWidth = config.legend.width || (chartWidth - spacing.left - spacing.right - padding * 2);

      const useGrid = numSeries > 8;

      if (useGrid) {
        const labels = visibleSeries.map((s, i) => s.name || `Series ${i + 1}`);
        const fontPx = parseInt(effectiveFontSize, 10);
        let maxTextWidth = 0;
        for (const label of labels) {
          const w = label.length * fontPx * 0.58;
          if (w > maxTextWidth) maxTextWidth = w;
        }

        let gridItemWidth: number;
        let columns: number;
        if (config.legend.itemWidth) {
          gridItemWidth = config.legend.itemWidth;
          columns = Math.max(2, Math.floor(availWidth / gridItemWidth));
        } else {
          const computed = symbolWidth + symbolPadding + maxTextWidth + 8;
          columns = Math.max(2, Math.floor(availWidth / computed));
          gridItemWidth = availWidth / columns;
        }

        const rows = Math.ceil(numSeries / columns);
        const height = rows * rowStep + padding * 2;
        const maxHeight = config.legend.maxHeight;
        return (maxHeight ? Math.min(height, maxHeight) : height) + margin;
      }

      let offsetX = padding;
      let rows = 1;
      for (let i = 0; i < numSeries; i++) {
        const name = visibleSeries[i].name || `Series ${i + 1}`;
        const textWidth = config.legend.itemWidth || name.length * 7;
        const itemWidth = symbolWidth + symbolPadding + textWidth;

        if (i > 0 && offsetX + itemWidth > availWidth) {
          rows++;
          offsetX = padding;
        }
        offsetX += itemWidth + itemDistance;
      }

      const height = rows * rowStep + padding * 2;
      const maxHeight = config.legend.maxHeight;
      return (maxHeight ? Math.min(height, maxHeight) : height) + margin;
    }

    return numSeries * rowStep + (config.legend.padding ?? 8) * 2 + margin;
  }

  private estimateAxisWidth(config: InternalConfig, isLeft: boolean): number {
    const axes = config.yAxis.filter(a => isLeft ? !a.opposite : a.opposite);
    if (axes.length === 0) return 0;

    let width = 0;
    for (const axis of axes) {
      if (axis.visible === false) continue;
      const hasLabels = axis.labels?.enabled !== false;
      const hasTitle = axis.title?.text;
      const labelWidth = hasLabels ? this.estimateLabelWidth(axis) : 0;
      width += labelWidth + (hasTitle ? 30 : 0) + (axis.offset || 0);
    }
    return width || 30;
  }

  private estimateLabelWidth(axis: InternalConfig['yAxis'][0]): number {
    if (axis.categories && axis.categories.length > 0) {
      let maxLen = 0;
      for (const cat of axis.categories) {
        if (cat.length > maxLen) maxLen = cat.length;
      }
      const fontSize = parseInt(axis.labels?.style?.fontSize as string || DEFAULT_CHART_TEXT_SIZE, 10);
      return Math.max(25, Math.min(maxLen * fontSize * 0.6, 150));
    }
    const min = axis.min ?? null;
    const max = axis.max ?? null;
    if (min != null && max != null) {
      const maxAbsStr = String(Math.round(Math.max(Math.abs(min), Math.abs(max))));
      const charCount = maxAbsStr.length + (min < 0 ? 1 : 0);
      return Math.max(20, charCount * 7 + 10);
    }
    return 25;
  }

  private estimateAxisHeight(config: InternalConfig): number {
    const axes = config.xAxis.filter(a => !a.opposite);
    if (axes.length === 0) return 0;

    let height = 0;
    for (const axis of axes) {
      if (axis.visible === false) continue;
      const hasLabels = axis.labels?.enabled !== false;
      const hasTitle = axis.title?.text;
      const hasExplicitRotation = !!(axis.labels?.rotation);

      let labelHeight = 30;
      if (hasLabels) {
        if (hasExplicitRotation && axis.categories && axis.categories.length > 0) {
          let maxLen = 0;
          for (const cat of axis.categories) {
            if (cat.length > maxLen) maxLen = cat.length;
          }
          const fontSize = parseInt(axis.labels?.style?.fontSize as string || DEFAULT_CHART_TEXT_SIZE, 10);
          const angleRad = Math.abs(axis.labels!.rotation!) * (Math.PI / 180);
          const rotatedHeight = Math.min(maxLen * fontSize * 0.55 * Math.sin(angleRad), 150);
          labelHeight = Math.max(30, rotatedHeight);
        } else if (hasExplicitRotation) {
          labelHeight = 45;
        } else if (axis.categories && axis.categories.length > 0) {
          let maxLen = 0;
          for (const cat of axis.categories) {
            if (cat.length > maxLen) maxLen = cat.length;
          }
          const fontSize = parseInt(axis.labels?.style?.fontSize as string || DEFAULT_CHART_TEXT_SIZE, 10);
          const wouldOverlap = axis.categories.length > 6 || maxLen > 8;
          if (wouldOverlap) {
            const rotatedHeight = Math.min(maxLen * fontSize * 0.4 * Math.sin(Math.PI / 4), 120);
            labelHeight = Math.max(30, rotatedHeight);
          }
        }
      } else {
        labelHeight = 0;
      }

      const tickSpace = hasLabels ? (axis.tickLength || 10) : 5;
      height += labelHeight + (hasTitle ? 25 : 0) + tickSpace;
    }
    return height || 40;
  }
}

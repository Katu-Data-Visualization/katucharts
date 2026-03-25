/**
 * Computes the plot area by measuring title, subtitle, axes, and legend space.
 */

import type { InternalConfig, PlotArea } from '../types/options';

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
    const titleHeight = config.title?.text
      ? this.estimateWrappedTextHeight(config.title.text, config.title.style, titleAvailableWidth) + (config.title.margin || 15)
      : 0;
    const subtitleHeight = config.subtitle?.text
      ? this.estimateWrappedTextHeight(config.subtitle.text, config.subtitle.style, titleAvailableWidth) + 5
      : 0;

    top += titleHeight + subtitleHeight;

    const legendHeight = this.estimateLegendHeight(config);
    const legendPosition = config.legend?.verticalAlign || 'bottom';
    if (legendPosition === 'bottom') {
      bottom += legendHeight;
    } else if (legendPosition === 'top') {
      top += legendHeight;
    }

    const isNonCartesian = this.isNonCartesian(config);

    const yAxisLeftWidth = isNonCartesian ? 0 : this.estimateAxisWidth(config, true);
    const yAxisRightWidth = isNonCartesian ? 0 : this.estimateAxisWidth(config, false);
    const xAxisBottomHeight = isNonCartesian ? 0 : this.estimateAxisHeight(config);

    const plotX = left + yAxisLeftWidth;
    const plotY = top;
    const plotWidth = Math.max(0, chartWidth - left - right - yAxisLeftWidth - yAxisRightWidth);
    const plotHeight = Math.max(0, chartHeight - top - bottom - xAxisBottomHeight);

    return {
      plotArea: { x: plotX, y: plotY, width: plotWidth, height: plotHeight },
      titleArea: {
        x: spacing.left,
        y: spacing.top,
        width: chartWidth - spacing.left - spacing.right,
        height: titleHeight,
      },
      subtitleArea: {
        x: spacing.left,
        y: spacing.top + titleHeight,
        width: chartWidth - spacing.left - spacing.right,
        height: subtitleHeight,
      },
      legendArea: {
        x: left,
        y: legendPosition === 'top' ? top - legendHeight : chartHeight - bottom,
        width: chartWidth - left - right,
        height: legendHeight,
      },
    };
  }

  private isNonCartesian(config: InternalConfig): boolean {
    const noAxesTypes = new Set([
      'pie', 'donut', 'sunburst', 'treemap', 'sankey', 'dependencywheel',
      'networkgraph', 'gauge', 'solidgauge', 'polar', 'radar', 'funnel',
      'pyramid', 'timeline', 'map', 'heatmap', 'barchartrace', 'venn',
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

  private estimateLegendHeight(config: InternalConfig): number {
    if (!config.legend?.enabled) return 0;
    const numSeries = config.series.filter(s => s.showInLegend !== false).length;
    if (numSeries === 0) return 0;

    const layout = config.legend.layout || 'horizontal';
    if (layout === 'horizontal') {
      return 30 + (config.legend.margin || 15);
    }
    return numSeries * 20 + (config.legend.margin || 15);
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
      width += labelWidth + (hasTitle ? 25 : 0) + (axis.offset || 0);
    }
    return width || 30;
  }

  private estimateLabelWidth(axis: InternalConfig['yAxis'][0]): number {
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
      const labelHeight = hasLabels
        ? (hasExplicitRotation ? 45 : 30)
        : 0;
      const tickSpace = hasLabels ? (axis.tickLength || 10) : 5;
      height += labelHeight + (hasTitle ? 25 : 0) + tickSpace;
    }
    return height || 40;
  }
}

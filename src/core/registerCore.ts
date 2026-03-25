/**
 * Registers only the most common series types for minimal bundle size.
 */

import { SeriesRegistry } from './Registry';
import { LineSeries } from '../series/cartesian/LineSeries';
import { SplineSeries } from '../series/cartesian/SplineSeries';
import { AreaSeries, AreaSplineSeries } from '../series/cartesian/AreaSeries';
import { ColumnSeries, BarSeries } from '../series/cartesian/ColumnSeries';
import { ScatterSeries } from '../series/cartesian/ScatterSeries';
import { BubbleSeries } from '../series/cartesian/BubbleSeries';
import { PieSeries } from '../series/pie/PieSeries';
import { HeatmapSeries } from '../series/heatmap/HeatmapSeries';
import { BoxPlotSeries } from '../series/cartesian/BoxPlotSeries';

export function registerCoreSeriesTypes(): void {
  SeriesRegistry.registerType('line', LineSeries);
  SeriesRegistry.registerType('spline', SplineSeries);
  SeriesRegistry.registerType('area', AreaSeries);
  SeriesRegistry.registerType('areaspline', AreaSplineSeries);
  SeriesRegistry.registerType('column', ColumnSeries);
  SeriesRegistry.registerType('bar', BarSeries);
  SeriesRegistry.registerType('scatter', ScatterSeries);
  SeriesRegistry.registerType('bubble', BubbleSeries);
  SeriesRegistry.registerType('pie', PieSeries);
  SeriesRegistry.registerType('donut', PieSeries);
  SeriesRegistry.registerType('heatmap', HeatmapSeries);
  SeriesRegistry.registerType('boxplot', BoxPlotSeries);
}

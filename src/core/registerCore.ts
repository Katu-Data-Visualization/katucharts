/**
 * Registers only the most common series types for minimal bundle size.
 */

import { ChartRegistry } from './Registry';
import { LineChart } from '../series/cartesian/LineChart';
import { SplineChart } from '../series/cartesian/SplineChart';
import { AreaChart, AreaSplineChart } from '../series/cartesian/AreaChart';
import { ColumnChart, BarChart } from '../series/cartesian/ColumnChart';
import { ScatterChart } from '../series/cartesian/ScatterChart';
import { BubbleChart } from '../series/cartesian/BubbleChart';
import { PieChart } from '../series/pie/PieChart';
import { HeatmapChart } from '../series/heatmap/HeatmapChart';
import { BoxPlotChart } from '../series/cartesian/BoxPlotChart';

export function registerCoreSeriesTypes(): void {
  ChartRegistry.registerType('line', LineChart);
  ChartRegistry.registerType('spline', SplineChart);
  ChartRegistry.registerType('area', AreaChart);
  ChartRegistry.registerType('areaspline', AreaSplineChart);
  ChartRegistry.registerType('column', ColumnChart);
  ChartRegistry.registerType('bar', BarChart);
  ChartRegistry.registerType('scatter', ScatterChart);
  ChartRegistry.registerType('bubble', BubbleChart);
  ChartRegistry.registerType('pie', PieChart);
  ChartRegistry.registerType('donut', PieChart);
  ChartRegistry.registerType('heatmap', HeatmapChart);
  ChartRegistry.registerType('boxplot', BoxPlotChart);
}

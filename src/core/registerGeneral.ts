/**
 * Registers general-purpose series types not covered by core/financial/flow.
 */

import { ChartRegistry } from './Registry';
import { WaterfallChart } from '../series/cartesian/WaterfallChart';
import { FunnelChart, PyramidChart } from '../series/pie/PieChart';
import { TreemapChart } from '../series/hierarchical/TreemapChart';
import { SunburstChart } from '../series/hierarchical/SunburstChart';
import { GaugeChart, SolidGaugeChart } from '../series/gauge/GaugeChart';
import { PolarChart } from '../series/polar/PolarChart';
import { TimelineChart, GanttChart } from '../series/timeline/TimelineChart';
import { MapChart } from '../series/map/MapChart';
import { VennChart } from '../series/venn/VennChart';
import { BarRaceChart } from '../series/race/BarRaceChart';

export function registerGeneralSeriesTypes(): void {
  ChartRegistry.registerType('waterfall', WaterfallChart);
  ChartRegistry.registerType('funnel', FunnelChart);
  ChartRegistry.registerType('pyramid', PyramidChart);
  ChartRegistry.registerType('treemap', TreemapChart);
  ChartRegistry.registerType('sunburst', SunburstChart);
  ChartRegistry.registerType('gauge', GaugeChart);
  ChartRegistry.registerType('solidgauge', SolidGaugeChart);
  ChartRegistry.registerType('polar', PolarChart);
  ChartRegistry.registerType('radar', PolarChart);
  ChartRegistry.registerType('timeline', TimelineChart);
  ChartRegistry.registerType('gantt', GanttChart);
  ChartRegistry.registerType('map', MapChart);
  ChartRegistry.registerType('venn', VennChart);
  ChartRegistry.registerType('barchartrace', BarRaceChart);
}

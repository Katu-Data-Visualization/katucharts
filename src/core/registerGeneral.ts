/**
 * Registers general-purpose series types not covered by core/financial/flow.
 */

import { SeriesRegistry } from './Registry';
import { WaterfallSeries } from '../series/cartesian/WaterfallSeries';
import { FunnelSeries, PyramidSeries } from '../series/pie/PieSeries';
import { TreemapSeries } from '../series/hierarchical/TreemapSeries';
import { SunburstSeries } from '../series/hierarchical/SunburstSeries';
import { GaugeSeries, SolidGaugeSeries } from '../series/gauge/GaugeSeries';
import { PolarSeries } from '../series/polar/PolarSeries';
import { TimelineSeries, GanttSeries } from '../series/timeline/TimelineSeries';
import { MapSeries } from '../series/map/MapSeries';
import { VennSeries } from '../series/venn/VennSeries';
import { BarChartRaceSeries } from '../series/race/BarChartRaceSeries';

export function registerGeneralSeriesTypes(): void {
  SeriesRegistry.registerType('waterfall', WaterfallSeries);
  SeriesRegistry.registerType('funnel', FunnelSeries);
  SeriesRegistry.registerType('pyramid', PyramidSeries);
  SeriesRegistry.registerType('treemap', TreemapSeries);
  SeriesRegistry.registerType('sunburst', SunburstSeries);
  SeriesRegistry.registerType('gauge', GaugeSeries);
  SeriesRegistry.registerType('solidgauge', SolidGaugeSeries);
  SeriesRegistry.registerType('polar', PolarSeries);
  SeriesRegistry.registerType('radar', PolarSeries);
  SeriesRegistry.registerType('timeline', TimelineSeries);
  SeriesRegistry.registerType('gantt', GanttSeries);
  SeriesRegistry.registerType('map', MapSeries);
  SeriesRegistry.registerType('venn', VennSeries);
  SeriesRegistry.registerType('barchartrace', BarChartRaceSeries);
}

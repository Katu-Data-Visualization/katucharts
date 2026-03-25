/**
 * Registers finance module series types as a plugin.
 */

import { SeriesRegistry } from './Registry';
import { HeikinAshiSeries } from '../series/financial/HeikinAshiSeries';
import { HollowCandlestickSeries } from '../series/financial/HollowCandlestickSeries';
import { VolumeSeries } from '../series/financial/VolumeSeries';
import { AreaRangeSeries } from '../series/financial/AreaRangeSeries';
import { BaselineSeries } from '../series/financial/BaselineSeries';
import { FlagsSeries } from '../series/financial/FlagsSeries';
import { RenkoSeries } from '../series/financial/RenkoSeries';
import { KagiSeries } from '../series/financial/KagiSeries';
import { PointAndFigureSeries } from '../series/financial/PointAndFigureSeries';
import { LineBreakSeries } from '../series/financial/LineBreakSeries';

export function registerFinanceSeriesTypes(): void {
  SeriesRegistry.registerType('heikinashi', HeikinAshiSeries);
  SeriesRegistry.registerType('hollowcandlestick', HollowCandlestickSeries);
  SeriesRegistry.registerType('volume', VolumeSeries);
  SeriesRegistry.registerType('arearange', AreaRangeSeries);
  SeriesRegistry.registerType('baseline', BaselineSeries);
  SeriesRegistry.registerType('flags', FlagsSeries);
  SeriesRegistry.registerType('renko', RenkoSeries);
  SeriesRegistry.registerType('kagi', KagiSeries);
  SeriesRegistry.registerType('pointandfigure', PointAndFigureSeries);
  SeriesRegistry.registerType('linebreak', LineBreakSeries);
}

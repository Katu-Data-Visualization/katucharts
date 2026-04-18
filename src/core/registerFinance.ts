/**
 * Registers finance module series types as a plugin.
 */

import { ChartRegistry } from './Registry';
import { HeikinAshiChart } from '../series/financial/HeikinAshiChart';
import { HollowCandlestickChart } from '../series/financial/HollowCandlestickChart';
import { VolumeChart } from '../series/financial/VolumeChart';
import { AreaRangeChart } from '../series/financial/AreaRangeChart';
import { BaselineChart } from '../series/financial/BaselineChart';
import { FlagsChart } from '../series/financial/FlagsChart';
import { RenkoChart } from '../series/financial/RenkoChart';
import { KagiChart } from '../series/financial/KagiChart';
import { PointAndFigureChart } from '../series/financial/PointAndFigureChart';
import { LineBreakChart } from '../series/financial/LineBreakChart';

export function registerFinanceSeriesTypes(): void {
  ChartRegistry.registerType('heikinashi', HeikinAshiChart);
  ChartRegistry.registerType('hollowcandlestick', HollowCandlestickChart);
  ChartRegistry.registerType('volume', VolumeChart);
  ChartRegistry.registerType('arearange', AreaRangeChart);
  ChartRegistry.registerType('baseline', BaselineChart);
  ChartRegistry.registerType('flags', FlagsChart);
  ChartRegistry.registerType('renko', RenkoChart);
  ChartRegistry.registerType('kagi', KagiChart);
  ChartRegistry.registerType('pointandfigure', PointAndFigureChart);
  ChartRegistry.registerType('linebreak', LineBreakChart);
}

/**
 * Registers financial series types as a plugin.
 */

import { SeriesRegistry } from './Registry';
import { CandlestickSeries, OHLCSeries } from '../series/financial/CandlestickSeries';

export function registerFinancialSeriesTypes(): void {
  SeriesRegistry.registerType('candlestick', CandlestickSeries);
  SeriesRegistry.registerType('ohlc', OHLCSeries);
}

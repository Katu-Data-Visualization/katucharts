/**
 * Registers financial series types as a plugin.
 */

import { ChartRegistry } from './Registry';
import { CandlestickChart, OHLCChart } from '../series/financial/CandlestickChart';

export function registerFinancialSeriesTypes(): void {
  ChartRegistry.registerType('candlestick', CandlestickChart);
  ChartRegistry.registerType('ohlc', OHLCChart);
}

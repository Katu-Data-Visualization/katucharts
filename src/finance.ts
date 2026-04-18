/**
 * KatuCharts — Finance charts plugin.
 *
 * Import this module to register all finance series types:
 *   import 'katucharts/finance';
 *
 * Or import named exports for manual control:
 *   import { registerFinanceSeriesTypes, HeikinAshiChart, SMA } from 'katucharts/finance';
 */

import { registerFinanceSeriesTypes } from './core/registerFinance';

registerFinanceSeriesTypes();

// Registration
export { registerFinanceSeriesTypes } from './core/registerFinance';

// Series types
export { CandlestickChart, OHLCChart } from './series/financial/CandlestickChart';
export { HeikinAshiChart } from './series/financial/HeikinAshiChart';
export { HollowCandlestickChart } from './series/financial/HollowCandlestickChart';
export { VolumeChart } from './series/financial/VolumeChart';
export { AreaRangeChart } from './series/financial/AreaRangeChart';
export { BaselineChart } from './series/financial/BaselineChart';
export { FlagsChart } from './series/financial/FlagsChart';
export { RenkoChart } from './series/financial/RenkoChart';
export { KagiChart } from './series/financial/KagiChart';
export { PointAndFigureChart } from './series/financial/PointAndFigureChart';
export { LineBreakChart } from './series/financial/LineBreakChart';

// Indicators — base
export { Indicator } from './indicators/Indicator';
export type { OHLCVPoint, IndicatorResult } from './indicators/Indicator';
export { IndicatorRegistry } from './indicators/registry';

// Indicators — moving averages
export { SMA, SMAIndicator } from './indicators/moving-averages/SMA';
export { EMA, EMAIndicator } from './indicators/moving-averages/EMA';
export { WMA, WMAIndicator } from './indicators/moving-averages/WMA';

// Indicators — oscillators
export { RSI, RSIIndicator } from './indicators/oscillators/RSI';
export { Stochastic, StochasticIndicator } from './indicators/oscillators/Stochastic';
export { MACD, MACDIndicator } from './indicators/oscillators/MACD';

// Indicators — volatility
export { BollingerBands, BollingerBandsIndicator } from './indicators/volatility/BollingerBands';
export { ATR, ATRIndicator } from './indicators/volatility/ATR';

// Indicators — volume
export { VWAP, VWAPIndicator } from './indicators/volume/VWAP';
export { OBV, OBVIndicator } from './indicators/volume/OBV';

// Indicators — trend
export { IchimokuCloud, IchimokuCloudIndicator } from './indicators/trend/IchimokuCloud';

// Streaming / live update
export { StreamAdapter } from './streaming/StreamAdapter';
export type { StreamSubscription } from './streaming/StreamAdapter';
export { CircularBuffer } from './utils/CircularBuffer';
export { UpdateScheduler, UpdateBatch } from './core/UpdateScheduler';

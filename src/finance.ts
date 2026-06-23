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

export { registerFinanceSeriesTypes } from './core/registerFinance';

export { CandlestickChart, OHLCChart } from './series/financial/CandlestickChart';
export { HeikinAshiChart } from './series/financial/HeikinAshiChart';
export { HollowCandlestickChart } from './series/financial/HollowCandlestickChart';
export { VolumeChart } from './series/financial/VolumeChart';
export { AreaRangeChart, AreaSplineRangeChart } from './series/financial/AreaRangeChart';
export { ColumnRangeChart } from './series/financial/ColumnRangeChart';
export { VBPChart } from './series/financial/VBPChart';
export { BaselineChart } from './series/financial/BaselineChart';
export { FlagsChart } from './series/financial/FlagsChart';
export { RenkoChart } from './series/financial/RenkoChart';
export { KagiChart } from './series/financial/KagiChart';
export { PointAndFigureChart } from './series/financial/PointAndFigureChart';
export { LineBreakChart } from './series/financial/LineBreakChart';

export { Indicator } from './indicators/Indicator';
export type { OHLCVPoint, IndicatorResult } from './indicators/Indicator';
export { IndicatorRegistry } from './indicators/registry';

export { SMA, SMAIndicator } from './indicators/moving-averages/SMA';
export { EMA, EMAIndicator } from './indicators/moving-averages/EMA';
export { WMA, WMAIndicator } from './indicators/moving-averages/WMA';
export { DEMA, DEMAIndicator } from './indicators/moving-averages/DEMA';
export { TEMA, TEMAIndicator } from './indicators/moving-averages/TEMA';

export { RSI, RSIIndicator } from './indicators/oscillators/RSI';
export { Stochastic, StochasticIndicator } from './indicators/oscillators/Stochastic';
export { MACD, MACDIndicator } from './indicators/oscillators/MACD';
export { CCI, CCIIndicator } from './indicators/oscillators/CCI';
export { ROC, ROCIndicator } from './indicators/oscillators/ROC';
export { Momentum, MomentumIndicator } from './indicators/oscillators/Momentum';

export { BollingerBands, BollingerBandsIndicator } from './indicators/volatility/BollingerBands';
export { ATR, ATRIndicator } from './indicators/volatility/ATR';

export { VWAP, VWAPIndicator } from './indicators/volume/VWAP';
export { OBV, OBVIndicator } from './indicators/volume/OBV';
export { VBP, VBPIndicator } from './indicators/volume/VBP';

export { IchimokuCloud, IchimokuCloudIndicator } from './indicators/trend/IchimokuCloud';
export { ADX, ADXIndicator } from './indicators/trend/ADX';
export { PSAR, PSARIndicator } from './indicators/trend/PSAR';

export { StreamAdapter } from './streaming/StreamAdapter';
export type { StreamSubscription } from './streaming/StreamAdapter';
export { CircularBuffer } from './utils/CircularBuffer';
export { UpdateScheduler, UpdateBatch } from './core/UpdateScheduler';

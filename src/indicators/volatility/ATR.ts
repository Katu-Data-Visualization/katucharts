import { Indicator, OHLCVPoint, IndicatorResult } from '../Indicator';
import type { PointOptions } from '../../types/options';
import { IndicatorRegistry } from '../registry';

export class ATRIndicator extends Indicator {
  readonly name = 'atr';

  /**
   * Calculates Average True Range using Wilder's smoothing.
   * ATR measures market volatility by decomposing the full range
   * of a bar including gap openings.
   */
  calculate(data: OHLCVPoint[], params: Record<string, number>): IndicatorResult {
    const period = params.period ?? 14;
    const values: PointOptions[] = new Array(data.length);

    values[0] = { x: data[0].x, y: null };

    const trueRanges: number[] = new Array(data.length);
    trueRanges[0] = data[0].high - data[0].low;

    for (let i = 1; i < data.length; i++) {
      const high = data[i].high;
      const low = data[i].low;
      const prevClose = data[i - 1].close;

      trueRanges[i] = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose),
      );
    }

    for (let i = 1; i < period; i++) {
      values[i] = { x: data[i].x, y: null };
    }

    let atr = 0;
    for (let i = 0; i < period; i++) {
      atr += trueRanges[i];
    }
    atr /= period;

    values[period - 1] = { x: data[period - 1].x, y: atr };

    for (let i = period; i < data.length; i++) {
      atr = (atr * (period - 1) + trueRanges[i]) / period;
      values[i] = { x: data[i].x, y: atr };
    }

    return { values };
  }
}

export const ATR = new ATRIndicator();
IndicatorRegistry.register(ATR);

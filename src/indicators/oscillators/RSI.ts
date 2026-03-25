import { Indicator, OHLCVPoint, IndicatorResult } from '../Indicator';
import type { PointOptions } from '../../types/options';
import { IndicatorRegistry } from '../registry';

export class RSIIndicator extends Indicator {
  readonly name = 'rsi';

  /**
   * Calculates the Relative Strength Index using Wilder's smoothing method.
   * RSI oscillates between 0 and 100; values above 70 suggest overbought,
   * below 30 suggest oversold conditions.
   */
  calculate(data: OHLCVPoint[], params: Record<string, number>): IndicatorResult {
    const period = params.period ?? 14;
    const values: PointOptions[] = new Array(data.length);

    for (let i = 0; i < period; i++) {
      values[i] = { x: data[i].x, y: null };
    }

    let avgGain = 0;
    let avgLoss = 0;

    for (let i = 1; i <= period; i++) {
      const delta = data[i].close - data[i - 1].close;
      avgGain += Math.max(0, delta);
      avgLoss += Math.max(0, -delta);
    }

    avgGain /= period;
    avgLoss /= period;

    const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    values[period] = {
      x: data[period].x,
      y: avgLoss === 0 ? 100 : 100 - 100 / (1 + rs),
    };

    for (let i = period + 1; i < data.length; i++) {
      const delta = data[i].close - data[i - 1].close;
      const gain = Math.max(0, delta);
      const loss = Math.max(0, -delta);

      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;

      const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
      values[i] = { x: data[i].x, y: rsi };
    }

    return { values };
  }
}

export const RSI = new RSIIndicator();
IndicatorRegistry.register(RSI);

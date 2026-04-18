import { Indicator, IndicatorResult, OHLCVPoint } from '../Indicator';
import { IndicatorRegistry } from '../registry';

export class WMAIndicator extends Indicator {
  readonly name = 'wma';

  /**
   * Calculates the Weighted Moving Average over closing prices.
   * Uses linear weighting where the most recent price in the window
   * receives the highest weight: weight_i = i + 1.
   * Points with insufficient history produce y: null.
   */
  calculate(data: OHLCVPoint[], params: Record<string, number>): IndicatorResult {
    const period = params.period ?? 14;
    const divisor = (period * (period + 1)) / 2;
    const values = new Array(data.length);

    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        values[i] = { x: data[i].x, y: null };
        continue;
      }

      let weightedSum = 0;
      for (let j = 0; j < period; j++) {
        weightedSum += data[i - period + 1 + j].close * (j + 1);
      }

      values[i] = { x: data[i].x, y: weightedSum / divisor };
    }

    return { values };
  }
}

export const WMA = new WMAIndicator();
IndicatorRegistry.register(WMA);

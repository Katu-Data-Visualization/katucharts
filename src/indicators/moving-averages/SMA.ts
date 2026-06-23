import { Indicator, IndicatorResult, OHLCVPoint } from '../Indicator';
import { IndicatorRegistry } from '../registry';

export class SMAIndicator extends Indicator {
  readonly name = 'sma';

  /**
   * Calculates the Simple Moving Average over closing prices.
   * SMA = sum of last `period` closes / period.
   * Points with insufficient history produce y: null.
   */
  calculate(data: OHLCVPoint[], params: Record<string, number>): IndicatorResult {
    const period = params.period ?? 14;
    const values = new Array(data.length);

    let windowSum = 0;

    for (let i = 0; i < data.length; i++) {
      windowSum += data[i].close;

      if (i >= period) {
        windowSum -= data[i - period].close;
      }

      if (i < period - 1) {
        values[i] = { x: data[i].x, y: null };
      } else {
        values[i] = { x: data[i].x, y: windowSum / period };
      }
    }

    return { values };
  }
}

export const SMA = new SMAIndicator();
IndicatorRegistry.register(SMA);

import { Indicator, IndicatorResult, OHLCVPoint } from '../Indicator';
import { IndicatorRegistry } from '../registry';

export class EMAIndicator extends Indicator {
  readonly name = 'ema';

  /**
   * Calculates the Exponential Moving Average over closing prices.
   * Uses multiplier k = 2 / (period + 1). The first EMA value is
   * seeded with the SMA of the first `period` points.
   * Points with insufficient history produce y: null.
   */
  calculate(data: OHLCVPoint[], params: Record<string, number>): IndicatorResult {
    const period = params.period ?? 14;
    const k = 2 / (period + 1);
    const values = new Array(data.length);

    let ema = 0;
    let seedSum = 0;

    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        seedSum += data[i].close;
        values[i] = { x: data[i].x, y: null };
      } else if (i === period - 1) {
        seedSum += data[i].close;
        ema = seedSum / period;
        values[i] = { x: data[i].x, y: ema };
      } else {
        ema = data[i].close * k + ema * (1 - k);
        values[i] = { x: data[i].x, y: ema };
      }
    }

    return { values };
  }
}

export const EMA = new EMAIndicator();
IndicatorRegistry.register(EMA);

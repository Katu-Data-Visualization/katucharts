import { Indicator, IndicatorResult, OHLCVPoint } from '../Indicator';
import { IndicatorRegistry } from '../registry';
import { emaArray } from '../util';

export class DEMAIndicator extends Indicator {
  readonly name = 'dema';

  /**
   * Double Exponential Moving Average: 2*EMA - EMA(EMA). Reduces the lag of a
   * single EMA while keeping smoothing.
   */
  calculate(data: OHLCVPoint[], params: Record<string, number>): IndicatorResult {
    const period = params.period ?? 14;
    const close = data.map(d => d.close);
    const ema1 = emaArray(close, period);
    const ema2 = emaArray(ema1, period);

    const values = data.map((d, i) => {
      const a = ema1[i], b = ema2[i];
      return { x: d.x, y: a !== null && b !== null ? 2 * a - b : null };
    });

    return { values };
  }
}

export const DEMA = new DEMAIndicator();
IndicatorRegistry.register(DEMA);

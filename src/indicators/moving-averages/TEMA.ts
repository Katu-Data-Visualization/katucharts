import { Indicator, IndicatorResult, OHLCVPoint } from '../Indicator';
import { IndicatorRegistry } from '../registry';
import { emaArray } from '../util';

export class TEMAIndicator extends Indicator {
  readonly name = 'tema';

  /**
   * Triple Exponential Moving Average: 3*EMA - 3*EMA(EMA) + EMA(EMA(EMA)).
   * Lower lag than DEMA for the same period.
   */
  calculate(data: OHLCVPoint[], params: Record<string, number>): IndicatorResult {
    const period = params.period ?? 14;
    const close = data.map(d => d.close);
    const ema1 = emaArray(close, period);
    const ema2 = emaArray(ema1, period);
    const ema3 = emaArray(ema2, period);

    const values = data.map((d, i) => {
      const a = ema1[i], b = ema2[i], c = ema3[i];
      return { x: d.x, y: a !== null && b !== null && c !== null ? 3 * a - 3 * b + c : null };
    });

    return { values };
  }
}

export const TEMA = new TEMAIndicator();
IndicatorRegistry.register(TEMA);

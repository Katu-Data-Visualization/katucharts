import { Indicator, IndicatorResult, OHLCVPoint } from '../Indicator';
import { IndicatorRegistry } from '../registry';

export class MomentumIndicator extends Indicator {
  readonly name = 'momentum';

  /**
   * Momentum: the absolute price change over `period` bars
   * (close - close[i-period]).
   */
  calculate(data: OHLCVPoint[], params: Record<string, number>): IndicatorResult {
    const period = params.period ?? 14;
    const values = data.map((d, i) => {
      if (i < period) return { x: d.x, y: null };
      return { x: d.x, y: d.close - data[i - period].close };
    });
    return { values };
  }
}

export const Momentum = new MomentumIndicator();
IndicatorRegistry.register(Momentum);

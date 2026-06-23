import { Indicator, IndicatorResult, OHLCVPoint } from '../Indicator';
import { IndicatorRegistry } from '../registry';

export class ROCIndicator extends Indicator {
  readonly name = 'roc';

  /**
   * Rate of Change: percentage change of close versus the close `period` bars
   * ago. ROC = 100 * (close - close[i-period]) / close[i-period].
   */
  calculate(data: OHLCVPoint[], params: Record<string, number>): IndicatorResult {
    const period = params.period ?? 9;
    const values = data.map((d, i) => {
      if (i < period) return { x: d.x, y: null };
      const prev = data[i - period].close;
      return { x: d.x, y: prev === 0 ? 0 : ((d.close - prev) / prev) * 100 };
    });
    return { values };
  }
}

export const ROC = new ROCIndicator();
IndicatorRegistry.register(ROC);

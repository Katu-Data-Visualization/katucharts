import { Indicator, OHLCVPoint, IndicatorResult } from '../Indicator';
import { IndicatorRegistry } from '../registry';
import type { PointOptions } from '../../types/options';

export class OBVIndicator extends Indicator {
  readonly name = 'obv';

  /**
   * Calculates On Balance Volume.
   * Accumulates volume on up-closes and subtracts on down-closes.
   * Unchanged closes carry the previous OBV forward.
   */
  calculate(data: OHLCVPoint[], _params: Record<string, number>): IndicatorResult {
    const values: PointOptions[] = new Array(data.length);

    if (data.length === 0) return { values: [] };

    let obv = 0;
    values[0] = { x: data[0].x, y: obv };

    for (let i = 1; i < data.length; i++) {
      const vol = data[i].volume ?? 0;

      if (data[i].close > data[i - 1].close) {
        obv += vol;
      } else if (data[i].close < data[i - 1].close) {
        obv -= vol;
      }

      values[i] = { x: data[i].x, y: obv };
    }

    return { values };
  }
}

export const OBV = new OBVIndicator();
IndicatorRegistry.register(OBV);

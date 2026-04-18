import { Indicator, OHLCVPoint, IndicatorResult } from '../Indicator';
import { IndicatorRegistry } from '../registry';
import type { PointOptions } from '../../types/options';

export class VWAPIndicator extends Indicator {
  readonly name = 'vwap';

  /**
   * Calculates Volume Weighted Average Price.
   * Accumulates (Typical Price * Volume) / cumulative Volume
   * from the first data point. Points with zero or missing volume
   * carry forward the previous VWAP value.
   */
  calculate(data: OHLCVPoint[], _params: Record<string, number>): IndicatorResult {
    const values: PointOptions[] = new Array(data.length);

    let cumulativeTPV = 0;
    let cumulativeVolume = 0;
    let lastVwap: number | null = null;

    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      const vol = d.volume ?? 0;

      if (vol > 0) {
        const tp = (d.high + d.low + d.close) / 3;
        cumulativeTPV += tp * vol;
        cumulativeVolume += vol;
        lastVwap = cumulativeTPV / cumulativeVolume;
      }

      values[i] = { x: d.x, y: lastVwap };
    }

    return { values };
  }
}

export const VWAP = new VWAPIndicator();
IndicatorRegistry.register(VWAP);

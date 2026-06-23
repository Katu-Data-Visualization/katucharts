import { Indicator, IndicatorResult, OHLCVPoint } from '../Indicator';
import { IndicatorRegistry } from '../registry';

export class CCIIndicator extends Indicator {
  readonly name = 'cci';

  /**
   * Commodity Channel Index. Measures deviation of the typical price
   * ((high+low+close)/3) from its SMA, scaled by mean absolute deviation:
   * CCI = (TP - SMA(TP)) / (0.015 * meanDeviation).
   */
  calculate(data: OHLCVPoint[], params: Record<string, number>): IndicatorResult {
    const period = params.period ?? 20;
    const tp = data.map(d => (d.high + d.low + d.close) / 3);
    const values = new Array(data.length);

    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        values[i] = { x: data[i].x, y: null };
        continue;
      }
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += tp[j];
      const sma = sum / period;

      let devSum = 0;
      for (let j = i - period + 1; j <= i; j++) devSum += Math.abs(tp[j] - sma);
      const meanDev = devSum / period;

      values[i] = { x: data[i].x, y: meanDev === 0 ? 0 : (tp[i] - sma) / (0.015 * meanDev) };
    }

    return { values };
  }
}

export const CCI = new CCIIndicator();
IndicatorRegistry.register(CCI);

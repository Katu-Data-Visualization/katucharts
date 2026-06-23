import { Indicator, OHLCVPoint, IndicatorResult } from '../Indicator';
import type { PointOptions } from '../../types/options';
import { IndicatorRegistry } from '../registry';

export class BollingerBandsIndicator extends Indicator {
  readonly name = 'bollingerbands';

  /**
   * Calculates Bollinger Bands: a middle SMA band with upper and lower bands
   * offset by a configurable number of standard deviations. Useful for
   * identifying volatility and potential price breakouts.
   */
  calculate(data: OHLCVPoint[], params: Record<string, number>): IndicatorResult {
    const period = params.period ?? 20;
    const stdDevMultiplier = params.stdDev ?? 2;

    const values: PointOptions[] = new Array(data.length);
    const upper: PointOptions[] = new Array(data.length);
    const middle: PointOptions[] = new Array(data.length);
    const lower: PointOptions[] = new Array(data.length);

    for (let i = 0; i < data.length; i++) {
      const x = data[i].x;

      if (i < period - 1) {
        values[i] = { x, y: null };
        upper[i] = { x, y: null };
        middle[i] = { x, y: null };
        lower[i] = { x, y: null };
        continue;
      }

      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sum += data[j].close;
      }
      const sma = sum / period;

      let squaredDiffSum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        const diff = data[j].close - sma;
        squaredDiffSum += diff * diff;
      }
      const stdDev = Math.sqrt(squaredDiffSum / period);

      const upperVal = sma + stdDevMultiplier * stdDev;
      const lowerVal = sma - stdDevMultiplier * stdDev;

      values[i] = { x, y: sma };
      upper[i] = { x, y: upperVal };
      middle[i] = { x, y: sma };
      lower[i] = { x, y: lowerVal };
    }

    return {
      values,
      bands: { upper, middle, lower },
    };
  }
}

export const BollingerBands = new BollingerBandsIndicator();
IndicatorRegistry.register(BollingerBands);

import { Indicator, OHLCVPoint, IndicatorResult } from '../Indicator';
import type { PointOptions } from '../../types/options';
import { IndicatorRegistry } from '../registry';

export class StochasticIndicator extends Indicator {
  readonly name = 'stochastic';

  /**
   * Calculates the Stochastic Oscillator (%K and %D lines).
   * %K measures momentum by comparing the close to the high-low range
   * over kPeriod, smoothed by smoothK. %D is the SMA signal of %K.
   */
  calculate(data: OHLCVPoint[], params: Record<string, number>): IndicatorResult {
    const kPeriod = params.kPeriod ?? 14;
    const dPeriod = params.dPeriod ?? 3;
    const smoothK = params.smoothK ?? 3;

    const rawK = this.computeRawK(data, kPeriod);
    const smoothedK = this.sma(rawK, smoothK);
    const dLine = this.sma(smoothedK, dPeriod);

    const values: PointOptions[] = new Array(data.length);
    const signal: PointOptions[] = new Array(data.length);

    for (let i = 0; i < data.length; i++) {
      values[i] = { x: data[i].x, y: smoothedK[i] };
      signal[i] = { x: data[i].x, y: dLine[i] };
    }

    return { values, signal };
  }

  /**
   * Computes raw %K values: 100 * (close - lowestLow) / (highestHigh - lowestLow).
   */
  private computeRawK(data: OHLCVPoint[], period: number): (number | null)[] {
    const result: (number | null)[] = new Array(data.length);

    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        result[i] = null;
        continue;
      }

      let lowestLow = Infinity;
      let highestHigh = -Infinity;

      for (let j = i - period + 1; j <= i; j++) {
        if (data[j].low < lowestLow) lowestLow = data[j].low;
        if (data[j].high > highestHigh) highestHigh = data[j].high;
      }

      const range = highestHigh - lowestLow;
      result[i] = range === 0 ? 50 : 100 * (data[i].close - lowestLow) / range;
    }

    return result;
  }

  /**
   * Computes a Simple Moving Average over a nullable numeric array,
   * returning null for positions with insufficient non-null predecessors.
   */
  private sma(source: (number | null)[], period: number): (number | null)[] {
    const result: (number | null)[] = new Array(source.length).fill(null);
    const nonNullIndices: number[] = [];

    for (let i = 0; i < source.length; i++) {
      if (source[i] !== null) {
        nonNullIndices.push(i);
      }

      if (nonNullIndices.length >= period) {
        let sum = 0;
        for (let j = nonNullIndices.length - period; j < nonNullIndices.length; j++) {
          sum += source[nonNullIndices[j]] as number;
        }
        result[i] = sum / period;
      }
    }

    return result;
  }
}

export const Stochastic = new StochasticIndicator();
IndicatorRegistry.register(Stochastic);

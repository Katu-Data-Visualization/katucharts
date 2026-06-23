import { Indicator, OHLCVPoint, IndicatorResult } from '../Indicator';
import type { PointOptions } from '../../types/options';
import { IndicatorRegistry } from '../registry';

export class MACDIndicator extends Indicator {
  readonly name = 'macd';

  /**
   * Calculates MACD (Moving Average Convergence Divergence).
   * Returns the MACD line (fast EMA - slow EMA), a signal line
   * (EMA of MACD), and a histogram (MACD - signal).
   */
  calculate(data: OHLCVPoint[], params: Record<string, number>): IndicatorResult {
    const fastPeriod = params.fastPeriod ?? 12;
    const slowPeriod = params.slowPeriod ?? 26;
    const signalPeriod = params.signalPeriod ?? 9;

    const closes = data.map((d) => d.close);
    const fastEMA = this.ema(closes, fastPeriod);
    const slowEMA = this.ema(closes, slowPeriod);

    const macdLine: (number | null)[] = new Array(data.length);
    for (let i = 0; i < data.length; i++) {
      if (fastEMA[i] === null || slowEMA[i] === null) {
        macdLine[i] = null;
      } else {
        macdLine[i] = (fastEMA[i] as number) - (slowEMA[i] as number);
      }
    }

    const macdNonNull = this.extractNonNull(macdLine);
    const signalRaw = this.ema(macdNonNull.values, signalPeriod);

    const values: PointOptions[] = new Array(data.length);
    const signal: PointOptions[] = new Array(data.length);
    const histogram: PointOptions[] = new Array(data.length);

    let nonNullIdx = 0;
    for (let i = 0; i < data.length; i++) {
      const x = data[i].x;

      if (macdLine[i] === null) {
        values[i] = { x, y: null };
        signal[i] = { x, y: null };
        histogram[i] = { x, y: null };
      } else {
        const macdVal = macdLine[i] as number;
        const sigVal = signalRaw[nonNullIdx];
        values[i] = { x, y: macdVal };
        signal[i] = { x, y: sigVal };
        histogram[i] = { x, y: sigVal === null ? null : macdVal - sigVal };
        nonNullIdx++;
      }
    }

    return { values, signal, histogram };
  }

  /**
   * Calculates Exponential Moving Average.
   * Uses SMA for the seed value, then applies the recursive EMA formula.
   */
  private ema(source: number[], period: number): (number | null)[] {
    const result: (number | null)[] = new Array(source.length).fill(null);

    if (source.length < period) return result;

    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += source[i];
    }

    const k = 2 / (period + 1);
    result[period - 1] = sum / period;

    for (let i = period; i < source.length; i++) {
      result[i] = source[i] * k + (result[i - 1] as number) * (1 - k);
    }

    return result;
  }

  /**
   * Extracts non-null values and their original indices from a sparse array.
   */
  private extractNonNull(arr: (number | null)[]): { values: number[]; indices: number[] } {
    const values: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] !== null) {
        values.push(arr[i] as number);
        indices.push(i);
      }
    }
    return { values, indices };
  }
}

export const MACD = new MACDIndicator();
IndicatorRegistry.register(MACD);

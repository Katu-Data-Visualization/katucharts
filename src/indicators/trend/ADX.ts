import { Indicator, IndicatorResult, OHLCVPoint } from '../Indicator';
import { IndicatorRegistry } from '../registry';

export class ADXIndicator extends Indicator {
  readonly name = 'adx';

  /**
   * Average Directional Index (Wilder). Quantifies trend strength from the
   * smoothed directional movement (+DM/-DM) relative to true range. Returns the
   * ADX line; values below the first valid window are null.
   */
  calculate(data: OHLCVPoint[], params: Record<string, number>): IndicatorResult {
    const period = params.period ?? 14;
    const n = data.length;
    const values: { x: number; y: number | null }[] = data.map(d => ({ x: d.x, y: null }));
    if (n < period * 2) return { values };

    const plusDM: number[] = new Array(n).fill(0);
    const minusDM: number[] = new Array(n).fill(0);
    const tr: number[] = new Array(n).fill(0);

    for (let i = 1; i < n; i++) {
      const upMove = data[i].high - data[i - 1].high;
      const downMove = data[i - 1].low - data[i].low;
      plusDM[i] = upMove > downMove && upMove > 0 ? upMove : 0;
      minusDM[i] = downMove > upMove && downMove > 0 ? downMove : 0;
      tr[i] = Math.max(
        data[i].high - data[i].low,
        Math.abs(data[i].high - data[i - 1].close),
        Math.abs(data[i].low - data[i - 1].close)
      );
    }

    let smPlus = 0, smMinus = 0, smTR = 0;
    for (let i = 1; i <= period; i++) { smPlus += plusDM[i]; smMinus += minusDM[i]; smTR += tr[i]; }

    const dx: number[] = new Array(n).fill(NaN);
    const computeDX = (i: number) => {
      const plusDI = smTR === 0 ? 0 : 100 * smPlus / smTR;
      const minusDI = smTR === 0 ? 0 : 100 * smMinus / smTR;
      const sum = plusDI + minusDI;
      dx[i] = sum === 0 ? 0 : 100 * Math.abs(plusDI - minusDI) / sum;
    };
    computeDX(period);

    for (let i = period + 1; i < n; i++) {
      smPlus = smPlus - smPlus / period + plusDM[i];
      smMinus = smMinus - smMinus / period + minusDM[i];
      smTR = smTR - smTR / period + tr[i];
      computeDX(i);
    }

    let adx = 0;
    const firstAdxIdx = period * 2 - 1;
    let dxSum = 0;
    for (let i = period; i <= firstAdxIdx; i++) dxSum += dx[i];
    adx = dxSum / period;
    values[firstAdxIdx] = { x: data[firstAdxIdx].x, y: adx };

    for (let i = firstAdxIdx + 1; i < n; i++) {
      adx = (adx * (period - 1) + dx[i]) / period;
      values[i] = { x: data[i].x, y: adx };
    }

    return { values };
  }
}

export const ADX = new ADXIndicator();
IndicatorRegistry.register(ADX);

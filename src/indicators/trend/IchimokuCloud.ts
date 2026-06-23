import { Indicator, OHLCVPoint, IndicatorResult } from '../Indicator';
import { IndicatorRegistry } from '../registry';
import type { PointOptions } from '../../types/options';

export class IchimokuCloudIndicator extends Indicator {
  readonly name = 'ichimoku';

  /**
   * Calculates the full Ichimoku Cloud system: Tenkan-sen, Kijun-sen,
   * Senkou Span A/B (displaced forward), and Chikou Span (displaced backward).
   */
  calculate(data: OHLCVPoint[], params: Record<string, number>): IndicatorResult {
    const tenkanPeriod = params.tenkanPeriod ?? 9;
    const kijunPeriod = params.kijunPeriod ?? 26;
    const senkouBPeriod = params.senkouBPeriod ?? 52;
    const displacement = params.displacement ?? 26;

    const len = data.length;
    if (len === 0) {
      return { values: [], signal: [], bands: { upper: [], lower: [], middle: [] } };
    }

    const tenkan: (number | null)[] = new Array(len);
    const kijun: (number | null)[] = new Array(len);
    const senkouBRaw: (number | null)[] = new Array(len);

    for (let i = 0; i < len; i++) {
      tenkan[i] = i >= tenkanPeriod - 1 ? this.midpoint(data, i - tenkanPeriod + 1, tenkanPeriod) : null;
      kijun[i] = i >= kijunPeriod - 1 ? this.midpoint(data, i - kijunPeriod + 1, kijunPeriod) : null;
      senkouBRaw[i] = i >= senkouBPeriod - 1 ? this.midpoint(data, i - senkouBPeriod + 1, senkouBPeriod) : null;
    }

    const avgInterval = len > 1 ? (data[len - 1].x - data[0].x) / (len - 1) : 0;

    const values: PointOptions[] = new Array(len);
    const signal: PointOptions[] = new Array(len);

    for (let i = 0; i < len; i++) {
      values[i] = { x: data[i].x, y: tenkan[i] };
      signal[i] = { x: data[i].x, y: kijun[i] };
    }

    const senkouLen = len + displacement;
    const upper: PointOptions[] = new Array(senkouLen);
    const lower: PointOptions[] = new Array(senkouLen);

    for (let i = 0; i < senkouLen; i++) {
      const srcIdx = i - displacement;
      const x = srcIdx >= 0 && srcIdx < len
        ? data[srcIdx].x + displacement * avgInterval
        : data[0].x + i * avgInterval;

      let spanA: number | null = null;
      if (srcIdx >= 0 && srcIdx < len && tenkan[srcIdx] !== null && kijun[srcIdx] !== null) {
        spanA = ((tenkan[srcIdx] as number) + (kijun[srcIdx] as number)) / 2;
      }

      let spanB: number | null = null;
      if (srcIdx >= 0 && srcIdx < len) {
        spanB = senkouBRaw[srcIdx];
      }

      upper[i] = { x, y: spanA };
      lower[i] = { x, y: spanB };
    }

    const middle: PointOptions[] = new Array(len);
    for (let i = 0; i < len; i++) {
      const displacedX = data[i].x - displacement * avgInterval;
      middle[i] = { x: displacedX, y: data[i].close };
    }

    return {
      values,
      signal,
      bands: { upper, lower, middle },
    };
  }

  /**
   * Returns (highest high + lowest low) / 2 over a contiguous range of data.
   */
  private midpoint(data: OHLCVPoint[], start: number, length: number): number {
    let high = -Infinity;
    let low = Infinity;
    const end = start + length;

    for (let i = start; i < end; i++) {
      if (data[i].high > high) high = data[i].high;
      if (data[i].low < low) low = data[i].low;
    }

    return (high + low) / 2;
  }
}

export const IchimokuCloud = new IchimokuCloudIndicator();
IndicatorRegistry.register(IchimokuCloud);

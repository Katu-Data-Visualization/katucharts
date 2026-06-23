import { Indicator, IndicatorResult, OHLCVPoint } from '../Indicator';
import { IndicatorRegistry } from '../registry';

export class VBPIndicator extends Indicator {
  readonly name = 'vbp';

  /**
   * Volume by Price: splits the price range into `ranges` horizontal bins and
   * sums the volume traded while the close fell in each bin. Each result point
   * carries the bin's price band (low/high) and its total/up volume, consumed
   * by the VBP renderer as horizontal bars.
   */
  calculate(data: OHLCVPoint[], params: Record<string, number>): IndicatorResult {
    const ranges = Math.max(1, params.ranges ?? 12);
    if (data.length === 0) return { values: [] };

    let lo = Infinity, hi = -Infinity;
    for (const d of data) {
      lo = Math.min(lo, d.low ?? d.close);
      hi = Math.max(hi, d.high ?? d.close);
    }
    const binSize = (hi - lo) / ranges || 1;

    const total = new Array(ranges).fill(0);
    const up = new Array(ranges).fill(0);

    for (const d of data) {
      let idx = Math.floor((d.close - lo) / binSize);
      if (idx < 0) idx = 0;
      if (idx >= ranges) idx = ranges - 1;
      const vol = d.volume ?? 0;
      total[idx] += vol;
      if (d.close >= d.open) up[idx] += vol;
    }

    const values = total.map((vol, i) => ({
      x: i,
      y: lo + (i + 0.5) * binSize,
      low: lo + i * binSize,
      high: lo + (i + 1) * binSize,
      volume: vol,
      volumeUp: up[i],
    })) as any;

    return { values };
  }
}

export const VBP = new VBPIndicator();
IndicatorRegistry.register(VBP);

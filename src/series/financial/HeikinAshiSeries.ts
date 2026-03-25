import { CandlestickSeries } from './CandlestickSeries';
import type { InternalSeriesConfig } from '../../types/options';

export class HeikinAshiSeries extends CandlestickSeries {
  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  /**
   * Transforms raw OHLC data into Heikin-Ashi candles before rendering.
   * HA values smooth out price action by averaging open/close and
   * adjusting high/low to the HA range.
   */
  processData(): void {
    super.processData();

    if (this.data.length === 0) return;

    const haData: any[] = [];

    for (let i = 0; i < this.data.length; i++) {
      const d = this.data[i] as any;
      const open = d.open ?? d.y ?? 0;
      const high = d.high ?? open;
      const low = d.low ?? open;
      const close = d.close ?? open;

      const haClose = (open + high + low + close) / 4;

      let haOpen: number;
      if (i === 0) {
        haOpen = (open + close) / 2;
      } else {
        const prev = haData[i - 1];
        haOpen = (prev.open + prev.close) / 2;
      }

      const haHigh = Math.max(high, haOpen, haClose);
      const haLow = Math.min(low, haOpen, haClose);

      haData.push({
        ...d,
        open: haOpen,
        high: haHigh,
        low: haLow,
        close: haClose,
        y: haClose,
      });
    }

    this.data = haData;
  }
}

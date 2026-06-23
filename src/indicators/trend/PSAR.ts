import { Indicator, IndicatorResult, OHLCVPoint } from '../Indicator';
import { IndicatorRegistry } from '../registry';

export class PSARIndicator extends Indicator {
  readonly name = 'psar';

  /**
   * Parabolic SAR (stop-and-reverse). Tracks a trailing stop that accelerates
   * toward price as a trend extends. `increment` steps the acceleration factor
   * up to `maximum` each time a new extreme point is made.
   */
  calculate(data: OHLCVPoint[], params: Record<string, number>): IndicatorResult {
    const step = params.increment ?? 0.02;
    const maxAf = params.maximum ?? 0.2;
    const n = data.length;
    const values: { x: number; y: number | null }[] = data.map(d => ({ x: d.x, y: null }));
    if (n < 2) return { values };

    let up = data[1].close >= data[0].close;
    let sar = up ? data[0].low : data[0].high;
    let ep = up ? data[0].high : data[0].low;
    let af = step;
    values[0] = { x: data[0].x, y: sar };

    for (let i = 1; i < n; i++) {
      let nextSar = sar + af * (ep - sar);

      if (up) {
        nextSar = Math.min(nextSar, data[i - 1].low, i >= 2 ? data[i - 2].low : data[i - 1].low);
        if (data[i].low < nextSar) {
          up = false;
          nextSar = ep;
          ep = data[i].low;
          af = step;
        } else if (data[i].high > ep) {
          ep = data[i].high;
          af = Math.min(af + step, maxAf);
        }
      } else {
        nextSar = Math.max(nextSar, data[i - 1].high, i >= 2 ? data[i - 2].high : data[i - 1].high);
        if (data[i].high > nextSar) {
          up = true;
          nextSar = ep;
          ep = data[i].high;
          af = step;
        } else if (data[i].low < ep) {
          ep = data[i].low;
          af = Math.min(af + step, maxAf);
        }
      }

      sar = nextSar;
      values[i] = { x: data[i].x, y: sar };
    }

    return { values };
  }
}

export const PSAR = new PSARIndicator();
IndicatorRegistry.register(PSAR);

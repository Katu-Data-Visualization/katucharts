import { CandlestickChart, type CandleStyleContext } from './CandlestickChart';

/**
 * Hollow candlesticks: fill and stroke are driven by the trend direction
 * (close vs the previous candle's close) rather than the intra-candle
 * open/close relationship. Bullish (up-trend) candles are hollow.
 *
 * Reuses CandlestickChart's render pipeline entirely, overriding only the
 * per-candle coloring rule.
 */
export class HollowCandlestickChart extends CandlestickChart {
  protected getCandleStyle(ctx: CandleStyleContext): { fill: string; stroke: string; wick: string } {
    const prevClose = ctx.index > 0
      ? (ctx.data[ctx.index - 1].close ?? ctx.data[ctx.index - 1].y ?? 0)
      : ctx.open;
    const trendUp = ctx.close > prevClose;
    const trendColor = trendUp ? ctx.upColor : ctx.downColor;
    return {
      fill: trendUp ? 'none' : ctx.downColor,
      stroke: trendColor,
      wick: trendColor,
    };
  }

  protected getCandleClass(): string {
    return 'katucharts-candlestick katucharts-hollow-candlestick';
  }
}

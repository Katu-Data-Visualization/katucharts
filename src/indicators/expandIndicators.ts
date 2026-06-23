/**
 * Expands declarative technical-indicator series (the
 * `{ type: 'sma', linkedTo: 'id', params: { period } }`) into concrete
 * line / arearange / column series, computed from the linked series' data.
 *
 * This keeps the indicator math in the existing IndicatorRegistry calculators
 * and reuses the standard renderers, so an indicator is just a derived series.
 * Runs after option normalization, so the linked series' OHLC data is available.
 */

import type { InternalSeriesConfig, PointOptions } from '../types/options';
import type { OHLCVPoint, IndicatorResult } from './Indicator';
import { IndicatorRegistry } from './registry';

/** Series `type` aliases that resolve to a registered indicator calculator. */
const INDICATOR_ALIASES: Record<string, string> = {
  sma: 'sma', ema: 'ema', wma: 'wma',
  rsi: 'rsi', macd: 'macd', stochastic: 'stochastic', stoch: 'stochastic',
  bb: 'bollingerbands', bollinger: 'bollingerbands', bollingerbands: 'bollingerbands',
  atr: 'atr', vwap: 'vwap', obv: 'obv', vbp: 'vbp',
  ichimoku: 'ichimoku', ikh: 'ichimoku',
  cci: 'cci', roc: 'roc', momentum: 'momentum', mom: 'momentum',
  dema: 'dema', tema: 'tema', adx: 'adx', psar: 'psar',
};

export const INDICATOR_TYPES = new Set(Object.keys(INDICATOR_ALIASES));

export function isIndicatorType(type: string | undefined): boolean {
  return !!type && INDICATOR_TYPES.has(type.toLowerCase());
}

const DEFAULT_LINE = '#7798BF';
const SIGNAL_COLOR = '#f15c80';
const HIST_COLOR = '#90ed7d';

function buildOHLCV(data: PointOptions[]): OHLCVPoint[] {
  return data.map((d, i) => {
    const close = (d as any).close ?? d.y ?? 0;
    return {
      x: d.x ?? i,
      open: (d as any).open ?? close,
      high: (d as any).high ?? close,
      low: (d as any).low ?? close,
      close,
      volume: (d as any).volume ?? (d as any).z,
    };
  });
}

function resolveLinked(
  series: InternalSeriesConfig,
  all: InternalSeriesConfig[]
): InternalSeriesConfig | null {
  const linkedTo = (series as any).linkedTo;
  if (typeof linkedTo === 'string') {
    const byId = all.find(s => s.id === linkedTo);
    if (byId) return byId;
  }
  if (typeof linkedTo === 'number' && all[linkedTo]) return all[linkedTo];
  return all.find(s => s !== series && !isIndicatorType(s._internalType)) ?? null;
}

const DISPLAY_NAMES: Record<string, string> = {
  sma: 'SMA', ema: 'EMA', wma: 'WMA', rsi: 'RSI', macd: 'MACD',
  stochastic: 'Stochastic', bollingerbands: 'Bollinger Bands', atr: 'ATR',
  vwap: 'VWAP', obv: 'OBV', ichimoku: 'Ichimoku', cci: 'CCI', roc: 'ROC',
  momentum: 'Momentum', dema: 'DEMA', tema: 'TEMA', adx: 'ADX', psar: 'PSAR',
};

function paramLabel(name: string, params: Record<string, number>): string {
  const display = DISPLAY_NAMES[name] || name.toUpperCase();
  const period = params.period;
  return period ? `${display} (${period})` : display;
}

/** Builds a derived series config inheriting axis/visibility/zIndex from the base. */
function derive(
  base: InternalSeriesConfig,
  type: string,
  data: PointOptions[],
  overrides: Partial<InternalSeriesConfig>
): InternalSeriesConfig {
  return {
    ...base,
    type: type as any,
    _internalType: type as any,
    _processedData: data,
    data,
    params: undefined,
    linkedTo: undefined,
    ...overrides,
  } as InternalSeriesConfig;
}

function bandData(upper: PointOptions[], lower: PointOptions[]): PointOptions[] {
  return upper.map((u, i) => ({
    x: u.x,
    low: lower[i]?.y ?? null,
    high: u.y ?? null,
  })) as PointOptions[];
}

/**
 * Converts one indicator's computed result into concrete renderable series,
 * dispatching on the indicator's output shape.
 */
function toConcreteSeries(
  base: InternalSeriesConfig,
  name: string,
  result: IndicatorResult,
  params: Record<string, number>
): InternalSeriesConfig[] {
  const out: InternalSeriesConfig[] = [];
  const color = base.color || DEFAULT_LINE;
  const lineWidth = base.lineWidth ?? 1.5;
  const label = (base as any).name || paramLabel(name, params);

  if (result.bands) {
    out.push(derive(base, 'arearange', bandData(result.bands.upper, result.bands.lower), {
      name: `${label} band`,
      color: base.color || DEFAULT_LINE,
      fillOpacity: (base as any).fillOpacity ?? 0.15,
      lineWidth: 0,
      showInLegend: false,
      enableMouseTracking: false,
    }));

    if (name === 'ichimoku') {
      out.push(derive(base, 'line', result.values, { name: `${label} Tenkan`, color, lineWidth, marker: { enabled: false } }));
      if (result.signal) {
        out.push(derive(base, 'line', result.signal, { name: `${label} Kijun`, color: SIGNAL_COLOR, lineWidth, marker: { enabled: false } }));
      }
    } else {
      const middle = result.bands.middle ?? result.values;
      out.push(derive(base, 'line', middle, { name: label, color, lineWidth, marker: { enabled: false } }));
    }
    return out;
  }

  if (result.histogram) {
    out.push(derive(base, 'column', result.histogram, {
      name: `${label} Histogram`, color: HIST_COLOR, showInLegend: false, enableMouseTracking: false,
    }));
    out.push(derive(base, 'line', result.values, { name: label, color, lineWidth, marker: { enabled: false } }));
    if (result.signal) {
      out.push(derive(base, 'line', result.signal, { name: `${label} Signal`, color: SIGNAL_COLOR, lineWidth, marker: { enabled: false } }));
    }
    return out;
  }

  if (result.signal) {
    out.push(derive(base, 'line', result.values, { name: `${label} %K`, color, lineWidth, marker: { enabled: false } }));
    out.push(derive(base, 'line', result.signal, { name: `${label} %D`, color: SIGNAL_COLOR, lineWidth, marker: { enabled: false } }));
    return out;
  }

  if (name === 'vbp') {
    out.push(derive(base, 'vbp', result.values, {
      name: label, showInLegend: base.showInLegend ?? false,
    }));
    return out;
  }

  if (name === 'psar') {
    out.push(derive(base, 'scatter', result.values, {
      name: label, color, marker: { enabled: true, radius: 2, symbol: 'circle' },
    }));
    return out;
  }

  out.push(derive(base, 'line', result.values, { name: label, color, lineWidth, marker: { enabled: false } }));
  return out;
}

/**
 * Replaces indicator series in-place with their computed concrete series.
 * Non-indicator series pass through untouched. Indices are reassigned so the
 * downstream color/clip logic stays consistent after fan-out.
 */
export function expandIndicatorSeries(seriesList: InternalSeriesConfig[]): InternalSeriesConfig[] {
  if (!seriesList.some(s => isIndicatorType(s._internalType))) return seriesList;

  const expanded: InternalSeriesConfig[] = [];

  for (const series of seriesList) {
    const typeKey = (series._internalType || '').toLowerCase();
    if (!isIndicatorType(typeKey)) {
      expanded.push(series);
      continue;
    }

    const calc = IndicatorRegistry.get(INDICATOR_ALIASES[typeKey]);
    const linked = resolveLinked(series, seriesList);

    if (!calc || !linked) {
      expanded.push({ ...series, type: 'line' as any, _internalType: 'line' as any, _processedData: [], data: [] } as InternalSeriesConfig);
      continue;
    }

    const params = ((series as any).params || {}) as Record<string, number>;
    const result = calc.calculate(buildOHLCV(linked._processedData || []), params);
    expanded.push(...toConcreteSeries(series, INDICATOR_ALIASES[typeKey], result, params));
  }

  return expanded.map((s, i) => ({ ...s, index: i }));
}

/**
 * Pipeline: validate → deepMerge with defaults → normalize shorthands → toInternal.
 */

import type {
  KatuChartsOptions, InternalConfig, InternalSeriesConfig, InternalAxisConfig,
  AxisOptions, SeriesOptions, PointOptions, SeriesType, CreditsOptions,
} from '../types/options';
import { defaultOptions } from '../options/defaults';
import { NO_AXES_TYPES } from './chartTypes';
import { deepMerge } from '../utils/deepMerge';
import { getPalette, getTheme } from '../utils/color';
import { LicenseManager } from '../license/LicenseManager';
import { expandIndicatorSeries } from '../indicators/expandIndicators';

let globalOptions: Partial<KatuChartsOptions> = {};

export function setGlobalOptions(options: Partial<KatuChartsOptions>): void {
  globalOptions = deepMerge(globalOptions as any, options as any);
}

export function getGlobalOptions(): Partial<KatuChartsOptions> {
  return globalOptions;
}

export class OptionsParser {
  parse(userOptions: KatuChartsOptions): InternalConfig {
    if (userOptions.chart?.palette && !userOptions.colors) {
      userOptions = { ...userOptions, colors: getPalette(userOptions.chart.palette) };
    }
    const themeFragment = userOptions.theme ? getTheme(userOptions.theme) : undefined;
    const merged = this.mergeWithDefaults(userOptions, themeFragment);
    const normalized = this.normalize(merged);
    return this.toInternal(normalized);
  }

  /**
   * Layers, lowest to highest precedence: built-in defaults, global options, the
   * resolved `theme` fragment, then the user's explicit options. A theme thus
   * overwrites every default color surface while any option the caller sets
   * directly still wins over it.
   */
  private mergeWithDefaults(
    userOptions: KatuChartsOptions,
    themeFragment?: Partial<KatuChartsOptions>
  ): KatuChartsOptions {
    return deepMerge(
      deepMerge({} as any, defaultOptions),
      globalOptions as any,
      (themeFragment ?? {}) as any,
      userOptions as any
    );
  }

  private normalize(options: KatuChartsOptions): KatuChartsOptions {
    const result = { ...options };

    if (result.xAxis && !Array.isArray(result.xAxis)) {
      result.xAxis = [result.xAxis];
    }
    if (result.yAxis && !Array.isArray(result.yAxis)) {
      result.yAxis = [result.yAxis];
    }
    if (result.colorAxis && !Array.isArray(result.colorAxis)) {
      result.colorAxis = [result.colorAxis];
    }

    if (!result.xAxis || (Array.isArray(result.xAxis) && result.xAxis.length === 0)) {
      result.xAxis = [deepMerge({} as any, defaultOptions.xAxis as any)];
    }
    if (!result.yAxis || (Array.isArray(result.yAxis) && result.yAxis.length === 0)) {
      result.yAxis = [deepMerge({} as any, defaultOptions.yAxis as any)];
    }

    for (const axes of [result.xAxis, result.yAxis]) {
      if (Array.isArray(axes)) {
        for (const ax of axes) {
          if (ax.categories && ax.categories.length > 0) {
            ax.type = 'category';
          }
        }
      }
    }

    if (result.series && !Array.isArray(result.series)) {
      result.series = [result.series as unknown as SeriesOptions];
    }
    const chartType = result.chart?.type || 'line';
    const hasBarType = chartType === 'bar' || (Array.isArray(result.series) && result.series.some(s => s.type === 'bar'));
    if (result.chart) {
      if (hasBarType) {
        result.chart.inverted = true;
        (result.chart as { _invertedFromBar?: boolean })._invertedFromBar = true;
      } else if ((result.chart as { _invertedFromBar?: boolean })._invertedFromBar) {
        result.chart.inverted = false;
        delete (result.chart as { _invertedFromBar?: boolean })._invertedFromBar;
      }
    }

    /**
     * Manhattan plots label the x-axis with their own chromosome names beneath the plot
     * (ManhattanChart.renderChromosomeLabels); the underlying x values are raw genomic indices, so the
     * default numeric axis labels and ticks are meaningless AND render in the same band as the chromosome
     * labels, overlapping them. Suppress the numeric labels/ticks whenever those chromosome labels are
     * actually drawn — but if the consumer turned them off (showChromosomeLabels: false) keep the numeric
     * axis so the x-axis isn't left blank. (We can't gate on labels.enabled here: defaults already merged
     * it to true, so an "unset" user value is indistinguishable from an explicit one at this point.)
     */
    const isManhattan = chartType === 'manhattan' ||
      (Array.isArray(result.series) && result.series.some(s => s.type === 'manhattan'));
    if (isManhattan && Array.isArray(result.xAxis)) {
      const manhattanShowsChrLabels = !Array.isArray(result.series) ||
        result.series.some(s =>
          (s.type === 'manhattan' || (!s.type && chartType === 'manhattan')) &&
          (s as any).showChromosomeLabels !== false
        );
      if (manhattanShowsChrLabels) {
        for (const ax of result.xAxis as any[]) {
          ax.labels = { ...ax.labels, enabled: false };
          ax.tickLength = 0;
        }
      }
    }
    /**
     * Pictorial charts render a silhouette gauge, not a plotted grid, so axis
     * gridlines (the y-axis ones plus the category x-axis verticals) only show
     * through the shape as stray lines. Suppress them on both axes.
     */
    const isPictorial = chartType === 'pictorial' ||
      (Array.isArray(result.series) && result.series.some(s => s.type === 'pictorial'));
    if (isPictorial) {
      for (const axes of [result.xAxis, result.yAxis]) {
        if (Array.isArray(axes)) {
          for (const ax of axes as any[]) ax.gridLineWidth = 0;
        }
      }
    }

    const hasPolar = !!(result.chart as any)?.polar;
    const chartTypeForPolar = result.chart?.type;
    if (hasPolar && Array.isArray(result.series)) {
      result.series = result.series.map(s => {
        const originalType = s.type || chartTypeForPolar || 'line';
        const isLineLike = !s.type || s.type === 'line' || s.type === 'spline';
        const isLineFromChart = !s.type && (chartTypeForPolar === 'line' || chartTypeForPolar === 'spline');
        const out: any = {
          ...s,
          type: isLineLike ? 'radar' : s.type,
        };
        if (s.type === 'line' || s.type === 'spline' || isLineFromChart) {
          out._polarSubType = 'line';
        } else if (originalType === 'column' || originalType === 'bar') {
          out._polarSubType = 'column';
        }
        return out;
      });
    }
    const chartColorAxis = Array.isArray(result.colorAxis) ? result.colorAxis[0] : result.colorAxis;
    if (Array.isArray(result.series)) {
      result.series = result.series.map(s => {
        const normalized = this.normalizeSeries(s, hasPolar && (!s.type || s.type === 'line' || s.type === 'spline') ? 'radar' : chartType, result.plotOptions);
        if ((normalized.type === 'heatmap' || normalized.type === 'treemap') && chartColorAxis && !(normalized as any).colorAxis) {
          (normalized as any).colorAxis = chartColorAxis;
        }
        if (normalized.type === 'map' || normalized.type === 'mappoint' || normalized.type === 'flowmap') {
          this.applyMapTopLevelOptions(normalized as any, result, chartColorAxis);
        }
        return normalized;
      });
    }

    this.applyAutoHeight(result);

    return result;
  }

  /**
   * Derives a sensible chart height when the consumer left it unset (`null`/`undefined`):
   * inverted (bar) charts with many categories grow their internal scroll area so rows stay
   * legible instead of being crammed into a fixed height. Circular relationship charts
   * (dependency wheel / network graph) are NOT forced to a fixed pixel height here — doing so
   * overrode an explicitly sized container and overflowed it. They instead fall back to a
   * square canvas via `Chart.getDefaultHeightAspectRatio()`, which only applies when the
   * container itself has no measurable height.
   */
  private applyAutoHeight(config: any): void {
    const chart = config.chart as any;
    if (!chart) return;

    /**
     * Undo a scroll area we previously auto-derived so switching away from an
     * inverted/many-category layout (e.g. bar → column on update) can't leave a
     * stale tall scroll region behind. A scroll area the consumer set stays put.
     */
    if (chart._autoScrollMinHeight != null) {
      const spa = chart.scrollablePlotArea;
      if (spa && typeof spa === 'object' && spa.minHeight === chart._autoScrollMinHeight) {
        const rest = { ...spa };
        delete rest.minHeight;
        chart.scrollablePlotArea = Object.keys(rest).length ? rest : undefined;
      }
      delete chart._autoScrollMinHeight;
    }

    if (chart.height != null) return;

    if (chart.inverted) {
      const axes = Array.isArray(config.xAxis) ? config.xAxis : (config.xAxis ? [config.xAxis as any] : []);
      let count = 0;
      for (const ax of axes) {
        const n = ax?.categories?.length ?? 0;
        if (n > count) count = n;
      }
      if (count > 12) {
        /**
         * Keep the chart box the same size as its siblings and scroll the plot internally instead
         * of growing the whole chart very tall. Each row gets ~26px so long category labels stay
         * legible (16px crammed the names) — the plot scrolls when the rows exceed the box.
         */
        const minHeight = Math.min(count * 26 + 130, 9000);
        const spa = (chart.scrollablePlotArea && typeof chart.scrollablePlotArea === 'object') ? chart.scrollablePlotArea : {};
        chart.scrollablePlotArea = { ...spa, minHeight };
        chart._autoScrollMinHeight = minHeight;
        return;
      }
    }
  }

  /**
   * Bridges top-level map options onto the map series so a config that places
   * them at the chart level works unchanged: `colorAxis`, `mapView.projection`,
   * `mapNavigation`, and `chart.map`. Series-level options always take
   * precedence; when `series.colorAxis` is an axis index (number/boolean)
   * rather than a full config object we fall back to the top-level colorAxis.
   */
  private applyMapTopLevelOptions(series: any, root: any, topColorAxis: any): void {
    if (topColorAxis && (!series.colorAxis || typeof series.colorAxis !== 'object')) {
      series.colorAxis = topColorAxis;
    }
    if (series.mapNavigation == null && root.mapNavigation != null) {
      series.mapNavigation = root.mapNavigation;
    }
    if (series.projection == null && root.mapView?.projection != null) {
      series.projection = root.mapView.projection;
    }
    if (series.mapData == null && root.chart?.map != null) {
      series.mapData = root.chart.map;
    }
  }

  /**
   * Merges `dataLabels` layers (least → most specific) preserving array form.
   * Single-object layers broadcast across every entry, so a default such as
   * `{enabled:true}` refines each label instead of replacing a user array.
   */
  private static mergeDataLabels(layers: any[]): any {
    let acc: any = undefined;
    for (const layer of layers) {
      if (layer === undefined) continue;
      acc = OptionsParser.mergeTwoDataLabels(acc, layer);
    }
    return acc;
  }

  private static mergeTwoDataLabels(base: any, override: any): any {
    if (base === undefined) return override;
    if (override === undefined) return base;
    const baseArr = Array.isArray(base) ? base : [base];
    const overrideArr = Array.isArray(override) ? override : [override];
    const len = Math.max(baseArr.length, overrideArr.length);
    const out: any[] = [];
    for (let i = 0; i < len; i++) {
      const b = baseArr[i] ?? baseArr[0] ?? {};
      const o = overrideArr[i] ?? overrideArr[0] ?? {};
      out.push(deepMerge({} as any, b, o));
    }
    return (out.length === 1 && !Array.isArray(base) && !Array.isArray(override)) ? out[0] : out;
  }

  private normalizeSeries(
    series: SeriesOptions,
    chartType: SeriesType,
    plotOptions?: KatuChartsOptions['plotOptions']
  ): SeriesOptions {
    let result = { ...series };
    if (!result.type) {
      result.type = chartType;
      (result as any)._typeFromChart = true;
    } else {
      delete (result as any)._typeFromChart;
    }

    if (plotOptions) {
      const globalPlot = plotOptions.series || {};
      const typePlot = plotOptions[result.type] || {};
      const polarSubType = (result as any)._polarSubType as string | undefined;
      const polarBasePlot = polarSubType ? (plotOptions as any)[polarSubType] || {} : {};

      /**
       * `dataLabels` may be an array (several label sets per point, e.g. a pie's
       * name outside + percentage inside). Plain deepMerge lets a later object
       * layer — like a type default `{enabled:true}` — replace the array wholesale
       * and drop the user's per-entry format/distance. Merge it array-aware so
       * single-object layers refine every entry instead of clobbering the set.
       */
      const dlMerged = OptionsParser.mergeDataLabels(
        [globalPlot, polarBasePlot, typePlot, result].map(l => (l as any).dataLabels)
      );
      result = deepMerge({} as any, globalPlot, polarBasePlot, typePlot, result);
      if (dlMerged !== undefined) (result as any).dataLabels = dlMerged;
    }

    if (Array.isArray(result.data)) {
      const turboThreshold = result.turboThreshold ?? 1000;
      if (result.data.length > turboThreshold) {
        const first = result.data[0];
        if (first !== null && typeof first === 'object' && !Array.isArray(first)) {
          console.warn(
            `KatuCharts: series data length (${result.data.length}) exceeds turboThreshold (${turboThreshold}). ` +
            'Use array format (numbers or [x,y] pairs) for better performance.'
          );
        }
        if (typeof first === 'number' || (Array.isArray(first) && typeof first[0] === 'number')) {
          result.data = this.normalizeDataBulk(result.data as (number | [number, number] | [number, number, number])[], result);
          return result;
        }
      }
      result.data = result.data.map((d, i) => this.normalizeDataPoint(d, i, result));
    } else if (result.data != null) {
      result.data = [];
    }

    return result;
  }

  /**
   * Series whose numeric-array shorthand maps onto OHLC fields rather than x/y/z.
   */
  private static readonly OHLC_TYPES = new Set(['candlestick', 'ohlc', 'heikinashi', 'hollowcandlestick']);

  /**
   * Series whose numeric-array shorthand maps onto low/high range fields.
   */
  private static readonly RANGE_TYPES = new Set(['arearange', 'areasplinerange', 'columnrange']);

  /**
   * Array shorthand keys for OHLC and range series. The
   * leading x value is optional, so the variant is chosen by the array length:
   * `[o,h,l,c]`/`[x,o,h,l,c]` for OHLC, `[low,high]`/`[x,low,high]` for ranges.
   */
  private defaultArrayKeys(type: SeriesType | undefined, len: number): string[] | null {
    if (!type) return null;
    if (OptionsParser.OHLC_TYPES.has(type)) {
      return len >= 5 ? ['x', 'open', 'high', 'low', 'close'] : ['open', 'high', 'low', 'close'];
    }
    if (OptionsParser.RANGE_TYPES.has(type)) {
      return len >= 3 ? ['x', 'low', 'high'] : ['low', 'high'];
    }
    return null;
  }

  private normalizeDataPoint(
    d: number | [number, number] | [number, number, number] | [string, number] | PointOptions | null,
    index: number,
    series: SeriesOptions
  ): PointOptions {
    if (d === null) {
      return { x: (series.pointStart ?? 0) + index * (series.pointInterval ?? 1), y: null };
    }

    if (typeof d === 'number') {
      return { x: (series.pointStart ?? 0) + index * (series.pointInterval ?? 1), y: d };
    }

    if (Array.isArray(d) && (d as any[]).length === 5 && series.type === 'boxplot') {
      const arr = d as any as number[];
      return {
        x: (series.pointStart ?? 0) + index * (series.pointInterval ?? 1),
        low: arr[0], q1: arr[1], median: arr[2], q3: arr[3], high: arr[4],
      };
    }

    if (Array.isArray(d) && series.type === 'flowmap') {
      return { from: d[0], to: d[1], weight: d[2] } as PointOptions;
    }

    if (Array.isArray(d)) {
      if (series.keys && series.keys.length > 0) {
        const point: PointOptions = {};
        for (let k = 0; k < series.keys.length && k < d.length; k++) {
          (point as any)[series.keys[k]] = d[k];
        }
        if (point.x === undefined && (!NO_AXES_TYPES.has(series.type as string) || !point.name)) {
          point.x = (series.pointStart ?? 0) + index * (series.pointInterval ?? 1);
        }
        return point;
      }
      const ohlcKeys = this.defaultArrayKeys(series.type, d.length);
      if (ohlcKeys) {
        const point: PointOptions = {};
        for (let k = 0; k < ohlcKeys.length && k < d.length; k++) {
          (point as any)[ohlcKeys[k]] = d[k];
        }
        if (point.x === undefined) {
          point.x = (series.pointStart ?? 0) + index * (series.pointInterval ?? 1);
        }
        if ((point as any).close !== undefined && point.y === undefined) {
          point.y = (point as any).close;
        }
        return point;
      }
      if (typeof d[0] === 'string') {
        const point: PointOptions = { name: d[0] as string, y: d[1] as number };
        if (!NO_AXES_TYPES.has(series.type as string)) {
          point.x = (series.pointStart ?? 0) + index * (series.pointInterval ?? 1);
        }
        return point;
      }
      if (d.length >= 3) {
        return { x: d[0] as number, y: d[1] as number, z: d[2] as number };
      }
      return { x: d[0] as number, y: d[1] as number };
    }

    if (typeof d === 'object') {
      const point = { ...d };
      /**
       * Map-family series are geographic, not cartesian: assigning an auto x
       * here pollutes the tooltip key (it would surface as a stray "0", "1"…
       * in the default `{point.key}` header) and is never used for placement.
       */
      const isMapFamily = series.type === 'map' || series.type === 'mappoint' || series.type === 'flowmap';
      /**
       * Cartesian series place each point along the x axis by its index, even
       * when the point carries a name (the name becomes the category label).
       * Identity-based types (pie, sankey, map…) keep x unset so the name stays
       * the sole key.
       */
      const cartesian = !NO_AXES_TYPES.has(series.type as string);
      if (!isMapFamily && point.x === undefined && (cartesian || !point.name)) {
        point.x = (series.pointStart ?? 0) + index * (series.pointInterval ?? 1);
      }
      return point;
    }

    return { y: null };
  }

  private normalizeDataBulk(
    data: (number | [number, number] | [number, number, number])[],
    series: SeriesOptions
  ): PointOptions[] {
    const len = data.length;
    const result = new Array<PointOptions>(len);
    const start = series.pointStart ?? 0;
    const interval = series.pointInterval ?? 1;
    const first = data[0];

    if (typeof first === 'number') {
      for (let i = 0; i < len; i++) {
        result[i] = { x: start + i * interval, y: data[i] as number };
      }
    } else {
      const ohlcKeys = Array.isArray(first) ? this.defaultArrayKeys(series.type, first.length) : null;
      if (ohlcKeys) {
        for (let i = 0; i < len; i++) {
          const d = data[i] as number[];
          const point: PointOptions = {};
          for (let k = 0; k < ohlcKeys.length && k < d.length; k++) {
            (point as any)[ohlcKeys[k]] = d[k];
          }
          if (point.x === undefined) point.x = start + i * interval;
          if ((point as any).close !== undefined && point.y === undefined) {
            point.y = (point as any).close;
          }
          result[i] = point;
        }
      } else {
        for (let i = 0; i < len; i++) {
          const d = data[i] as number[];
          if (d.length >= 3) {
            result[i] = { x: d[0], y: d[1], z: d[2] };
          } else {
            result[i] = { x: d[0], y: d[1] };
          }
        }
      }
    }

    return result;
  }

  private enforceCredits(credits: CreditsOptions): CreditsOptions {
    if (LicenseManager.isLicensed()) return credits;
    return {
      ...credits,
      enabled: true,
      text: (!credits.text || !credits.text.trim()) ? 'Powered by: KatuCharts' : credits.text,
    };
  }

  private toInternal(options: KatuChartsOptions): InternalConfig {
    const inverted = !!options.chart?.inverted;
    const backgroundColor = options.chart?.backgroundColor;

    const xAxis = (options.xAxis as AxisOptions[]).map((a, i) => ({
      ...a,
      index: i,
      isX: true,
      _inverted: inverted,
      _backgroundColor: backgroundColor,
    } as InternalAxisConfig));

    const yAxis = (options.yAxis as AxisOptions[]).map((a, i) => ({
      ...a,
      index: i,
      isX: false,
      _inverted: inverted,
      _backgroundColor: backgroundColor,
    } as InternalAxisConfig));

    const series = (options.series || []).map((s, i) => {
      const xAxisIdx = typeof s.xAxis === 'number' ? s.xAxis : 0;
      const yAxisIdx = typeof s.yAxis === 'number' ? s.yAxis : 0;

      const seriesType = (s.type || options.chart?.type || 'line') as SeriesType;
      const hidesLegendByDefault =
        seriesType === 'pie' ||
        seriesType === 'donut' ||
        seriesType === 'sankey';

      return {
        ...s,
        index: i,
        _internalType: seriesType,
        _xAxisIndex: xAxisIdx,
        _yAxisIndex: yAxisIdx,
        _xAxis: xAxis[xAxisIdx] || xAxis[0],
        _yAxis: yAxis[yAxisIdx] || yAxis[0],
        _processedData: (s.data as PointOptions[]) || [],
        ...(hidesLegendByDefault && s.showInLegend === undefined ? { showInLegend: false } : {}),
      } as InternalSeriesConfig;
    });

    const expandedSeries = expandIndicatorSeries(series);

    return {
      chart: {
        width: null,
        height: null,
        backgroundColor: '#ffffff',
        animation: true,
        reflow: true,
        ...options.chart,
      } as InternalConfig['chart'],
      title: options.title || {},
      subtitle: options.subtitle || {},
      caption: options.caption || {},
      xAxis,
      yAxis,
      colorAxis: (options.colorAxis as any[]) || [],
      series: expandedSeries,
      tooltip: options.tooltip || {},
      legend: { ...(options.legend || {}), _backgroundColor: options.chart?.backgroundColor } as any,
      plotOptions: options.plotOptions || {},
      credits: this.enforceCredits(options.credits || {}),
      exporting: options.exporting || {},
      loading: options.loading || {},
      navigator: options.navigator || {},
      rangeSelector: options.rangeSelector || {},
      drilldown: options.drilldown || {},
      responsive: options.responsive || {},
      accessibility: options.accessibility || {},
      colors: options.colors || [],
      time: options.time || {},
    };
  }
}

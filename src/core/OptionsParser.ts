/**
 * Pipeline: validate → deepMerge with defaults → normalize shorthands → toInternal.
 */

import type {
  KatuChartsOptions, InternalConfig, InternalSeriesConfig, InternalAxisConfig,
  AxisOptions, SeriesOptions, PointOptions, SeriesType, CreditsOptions,
} from '../types/options';
import { defaultOptions } from '../options/defaults';
import { deepMerge } from '../utils/deepMerge';
import { getPalette } from '../utils/color';
import { LicenseManager } from '../license/LicenseManager';

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
    const merged = this.mergeWithDefaults(userOptions);
    const normalized = this.normalize(merged);
    return this.toInternal(normalized);
  }

  private mergeWithDefaults(userOptions: KatuChartsOptions): KatuChartsOptions {
    return deepMerge(
      deepMerge({} as any, defaultOptions),
      globalOptions as any,
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

    const chartType = result.chart?.type || 'line';
    const hasBarType = chartType === 'bar' || (result.series?.some(s => s.type === 'bar') ?? false);
    if (hasBarType && result.chart) {
      result.chart.inverted = true;
    }
    const chartColorAxis = Array.isArray(result.colorAxis) ? result.colorAxis[0] : result.colorAxis;
    if (result.series) {
      result.series = result.series.map(s => {
        const normalized = this.normalizeSeries(s, chartType, result.plotOptions);
        if ((normalized.type === 'heatmap') && chartColorAxis && !(normalized as any).colorAxis) {
          (normalized as any).colorAxis = chartColorAxis;
        }
        return normalized;
      });
    }

    return result;
  }

  private normalizeSeries(
    series: SeriesOptions,
    chartType: SeriesType,
    plotOptions?: KatuChartsOptions['plotOptions']
  ): SeriesOptions {
    let result = { ...series };
    result.type = result.type || chartType;

    if (plotOptions) {
      const globalPlot = plotOptions.series || {};
      const typePlot = plotOptions[result.type] || {};
      result = deepMerge({} as any, globalPlot, typePlot, result);
    }

    if (result.data) {
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
    }

    return result;
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

    if (Array.isArray(d)) {
      if (series.keys && series.keys.length > 0) {
        const point: PointOptions = {};
        for (let k = 0; k < series.keys.length && k < d.length; k++) {
          (point as any)[series.keys[k]] = d[k];
        }
        if (point.x === undefined && !point.name) {
          point.x = (series.pointStart ?? 0) + index * (series.pointInterval ?? 1);
        }
        return point;
      }
      if (typeof d[0] === 'string') {
        return { name: d[0] as string, y: d[1] as number };
      }
      if (d.length >= 3) {
        return { x: d[0] as number, y: d[1] as number, z: d[2] as number };
      }
      return { x: d[0] as number, y: d[1] as number };
    }

    if (typeof d === 'object') {
      const point = { ...d };
      if (point.x === undefined && !point.name) {
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
      for (let i = 0; i < len; i++) {
        const d = data[i] as number[];
        if (d.length >= 3) {
          result[i] = { x: d[0], y: d[1], z: d[2] };
        } else {
          result[i] = { x: d[0], y: d[1] };
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

    const xAxis = (options.xAxis as AxisOptions[]).map((a, i) => ({
      ...a,
      index: i,
      isX: true,
      _inverted: inverted,
    } as InternalAxisConfig));

    const yAxis = (options.yAxis as AxisOptions[]).map((a, i) => ({
      ...a,
      index: i,
      isX: false,
      _inverted: inverted,
    } as InternalAxisConfig));

    const series = (options.series || []).map((s, i) => {
      const xAxisIdx = typeof s.xAxis === 'number' ? s.xAxis : 0;
      const yAxisIdx = typeof s.yAxis === 'number' ? s.yAxis : 0;

      const seriesType = (s.type || options.chart?.type || 'line') as SeriesType;
      const isPieLike = seriesType === 'pie' || seriesType === 'donut';

      return {
        ...s,
        index: i,
        _internalType: seriesType,
        _xAxisIndex: xAxisIdx,
        _yAxisIndex: yAxisIdx,
        _processedData: (s.data as PointOptions[]) || [],
        ...(isPieLike && s.showInLegend === undefined ? { showInLegend: false } : {}),
      } as InternalSeriesConfig;
    });

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
      xAxis,
      yAxis,
      colorAxis: (options.colorAxis as any[]) || [],
      series,
      tooltip: options.tooltip || {},
      legend: options.legend || {},
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
    };
  }
}

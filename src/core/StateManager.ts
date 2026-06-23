/**
 * Holds normalized config and series data, routes mutations through events.
 */

import type { InternalConfig, InternalSeriesConfig, AxisOptions, SeriesOptions } from '../types/options';
import { EventBus } from './EventBus';
import { deepMerge, deepClone } from '../utils/deepMerge';

export class StateManager {
  private config: InternalConfig;
  readonly events: EventBus;

  constructor(config: InternalConfig, events: EventBus) {
    this.config = config;
    this.events = events;
  }

  getConfig(): InternalConfig {
    return this.config;
  }

  updateConfig(partial: Partial<InternalConfig>): void {
    this.config = deepMerge(this.config, partial as any);
    this.events.emit('state:configChanged', this.config);
  }

  getSeries(): InternalSeriesConfig[] {
    return this.config.series;
  }

  getSeriesById(id: string): InternalSeriesConfig | undefined {
    return this.config.series.find(s => s.id === id);
  }

  getSeriesByIndex(index: number): InternalSeriesConfig | undefined {
    return this.config.series[index];
  }

  addSeries(series: InternalSeriesConfig): void {
    this.config.series = [...this.config.series, series];
    this.events.emit('state:seriesAdded', series);
  }

  removeSeries(index: number): InternalSeriesConfig | undefined {
    const removed = this.config.series[index];
    if (removed) {
      this.config.series = this.config.series.filter((_, i) => i !== index);
      this.events.emit('state:seriesRemoved', removed, index);
    }
    return removed;
  }

  updateSeries(index: number, updates: Partial<SeriesOptions>): void {
    const existing = this.config.series[index];
    if (existing) {
      this.config.series[index] = deepMerge(existing, updates as any);
      this.events.emit('state:seriesUpdated', this.config.series[index], index);
    }
  }

  getXAxes(): AxisOptions[] {
    return this.config.xAxis;
  }

  getYAxes(): AxisOptions[] {
    return this.config.yAxis;
  }

  updateAxis(isX: boolean, index: number, updates: Partial<AxisOptions>): void {
    const axes = isX ? this.config.xAxis : this.config.yAxis;
    if (axes[index]) {
      axes[index] = deepMerge(axes[index], updates as any);
      this.events.emit('state:axisUpdated', { isX, index, config: axes[index] });
    }
  }
}

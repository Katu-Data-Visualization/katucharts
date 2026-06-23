/**
 * Wires the stock UI — RangeSelector buttons/inputs and the Navigator brush —
 * to the chart's x-axis. Both translate user intent into an x-domain change and
 * trigger a re-render, a standard stock-chart interaction. Kept separate from
 * Chart so the stock concern stays self-contained.
 */

import type { Selection } from 'd3-selection';
import type { EventBus } from '../core/EventBus';
import type { LayoutResult } from '../layout/LayoutEngine';
import type { AxisInstance } from '../axis/Axis';
import type { BaseSeries } from '../series/BaseSeries';
import type { InternalConfig } from '../types/options';
import { Navigator } from './Navigator';
import { RangeSelector } from './RangeSelector';

export interface StockHost {
  getOptions(): InternalConfig;
  getContainer(): HTMLElement;
  getEvents(): EventBus;
  getSvg(): Selection<SVGSVGElement, unknown, null, undefined>;
  getLayout(): LayoutResult;
  getChartHeight(): number;
  getXAxes(): AxisInstance[];
  getSeriesInstances(): BaseSeries[];
  rerender(): void;
}

const DEFAULT_BUTTONS = [
  { type: 'month', count: 1, text: '1m' },
  { type: 'month', count: 3, text: '3m' },
  { type: 'month', count: 6, text: '6m' },
  { type: 'ytd', text: 'YTD' },
  { type: 'year', count: 1, text: '1y' },
  { type: 'all', text: 'All' },
];

const UNIT_MS: Record<string, number> = {
  millisecond: 1,
  second: 1000,
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 604_800_000,
  month: 2_592_000_000,
  year: 31_536_000_000,
};

export class StockController {
  private navigator: Navigator | null = null;
  private rangeSelector: RangeSelector | null = null;
  private xMin = 0;
  private xMax = 0;

  constructor(private host: StockHost) {}

  setup(): void {
    const opts = this.host.getOptions();
    const navEnabled = (opts as any).navigator?.enabled;
    const rsEnabled = (opts as any).rangeSelector?.enabled;
    if (!navEnabled && !rsEnabled) return;

    const baseData = this.getBaseSeriesData();
    if (baseData.length > 0) {
      this.xMin = baseData[0].x;
      this.xMax = baseData[baseData.length - 1].x;
    }

    const events = this.host.getEvents();

    const rsCfg = (opts as any).rangeSelector;

    if (rsEnabled) {
      this.rangeSelector = new RangeSelector(rsCfg, this.host.getContainer(), events);
      this.placeRangeSelectorOnTop();
      events.on('rangeSelector:selected', (sel: any) => this.applyButton(sel));
      events.on('rangeSelector:dateRange', (r: any) => this.applyXRange(r.from, r.to));
    }

    if (navEnabled) {
      this.navigator = new Navigator(
        (opts as any).navigator,
        this.host.getSvg(),
        this.host.getLayout().plotArea,
        this.host.getChartHeight(),
        events,
        baseData,
      );
      events.on('navigator:brushed', (sel: { x0: number; x1: number }) => {
        const span = this.xMax - this.xMin;
        this.applyXRange(this.xMin + sel.x0 * span, this.xMin + sel.x1 * span);
      });
    }

    if (rsEnabled) {
      const selectedIdx = rsCfg.selected;
      if (selectedIdx !== undefined && selectedIdx !== null) {
        const btn = (rsCfg.buttons || DEFAULT_BUTTONS)[selectedIdx];
        if (btn) this.applyButton(btn);
      }
    }

    events.on('chart:afterZoom', () => {
      const ax = this.host.getXAxes()[0];
      if (ax) {
        const [min, max] = ax.scale.domain() as [number, number];
        this.syncNavigator(+min, +max);
      }
    });
  }

  /**
   * Extracts {x, y} data from the base series, using close price for OHLC points.
   */
  private getBaseSeriesData(): { x: number; y: number }[] {
    const series = this.host.getSeriesInstances();
    if (series.length === 0) return [];
    const base = series[0];
    return base.data
      .map((d: any) => ({ x: d.x ?? 0, y: d.close ?? d.y ?? 0 }))
      .filter(d => d.y !== null && d.y !== undefined && Number.isFinite(d.x));
  }

  private placeRangeSelectorOnTop(): void {
    const container = this.host.getContainer();
    const el = container.querySelector('.katucharts-range-selector');
    if (el && container.firstChild && el !== container.firstChild) {
      container.insertBefore(el, container.firstChild);
    }
  }

  /**
   * Resolves a range-selector button (type/count) to an x-axis domain range.
   */
  private applyButton(sel: { type: string; count?: number }): void {
    const type = sel.type;
    const count = sel.count ?? 1;

    if (type === 'all') {
      this.applyXRange(this.xMin, this.xMax);
      return;
    }
    if (type === 'ytd') {
      const d = new Date(this.xMax);
      const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
      this.applyXRange(Math.max(this.xMin, yearStart), this.xMax);
      return;
    }
    const unit = UNIT_MS[type];
    if (unit) {
      this.applyXRange(Math.max(this.xMin, this.xMax - count * unit), this.xMax);
    }
  }

  private applyXRange(min: number, max: number): void {
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return;
    for (const ax of this.host.getXAxes()) {
      ax.updateDomain({ min, max });
    }
    this.host.rerender();
    this.syncNavigator(min, max);
  }

  /**
   * Syncs the navigator brush to reflect the current visible [min, max] x-axis window.
   */
  private syncNavigator(min: number, max: number): void {
    if (!this.navigator) return;
    const span = this.xMax - this.xMin;
    if (span <= 0) return;
    this.navigator.setSelection((min - this.xMin) / span, (max - this.xMin) / span);
  }

  destroy(): void {
    this.navigator?.destroy();
    this.rangeSelector?.destroy();
  }
}

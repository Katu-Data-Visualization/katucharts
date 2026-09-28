/**
 * Owns the chart's user-interaction behaviors: drilldown (with its history
 * stack and transition), zoom/pan, series hover-dimming, and the accessibility
 * module. Extracted from `Chart`; it reaches chart state through a narrow host
 * interface and performs rebuilds/re-renders via host callbacks so it never
 * touches the chart's private render internals directly.
 *
 * Note: responsive rules, reflow and the ResizeObserver intentionally remain on
 * `Chart` — they belong to the sizing lifecycle (the public `reflow()`/`setSize`
 * path) and share the ResizeObserver with the export/full-screen feature.
 */

import type { SVGRenderer } from './SVGRenderer';
import type { EventBus } from './EventBus';
import type { LayoutResult } from '../layout/LayoutEngine';
import type { BaseSeries } from '../series/BaseSeries';
import type { AxisInstance } from '../axis/Axis';
import type { InternalConfig, InternalSeriesConfig } from '../types/options';
import { OptionsParser } from './OptionsParser';
import { Drilldown } from '../interaction/Drilldown';
import { Zoom, type ZoomConfig, type ZoomType, type SelectionEvent } from '../interaction/Zoom';
import { handledClicks } from '../series/BaseSeries';
import { A11yModule } from '../accessibility/A11yModule';

type Group = ReturnType<SVGRenderer['createGroup']>;

export interface InteractionHost {
  getOptions(): InternalConfig;
  getContainer(): HTMLElement;
  getEvents(): EventBus;
  getRenderer(): SVGRenderer;
  getSeriesGroup(): Group;
  getPlotGroup(): Group;
  getLayout(): LayoutResult;
  getXAxes(): AxisInstance[];
  getYAxes(): AxisInstance[];
  getSeriesInstances(): BaseSeries[];
  /** Replace the active (internal) series config — used by drilldown. */
  setSeries(series: InternalSeriesConfig[]): void;
  /** Destroy series instances, rebuild axes + series, and render everything. */
  rebuild(): void;
  /** Re-render axes and series for new axis extremes (keeps the layout). */
  redrawExtremes(): void;
  fireEvent(name: string, ...args: any[]): void;
  /** The chart instance, `this` in chart event callbacks. */
  getChart(): any;
  getChartSize(): { width: number; height: number };
}

export class InteractionController {
  private drilldown: Drilldown | null = null;
  private zoom: Zoom | null = null;
  private a11yModule: A11yModule | null = null;
  private zoomConfig: ZoomConfig = {};
  private chartClickCleanup: (() => void) | null = null;

  constructor(private host: InteractionHost) {}

  setup(): void {
    this.setupSeriesDimming();
    this.setupDrilldown();
    this.setupZoom();
    this.setupChartClick();
    this.setupAccessibility();
  }

  destroy(): void {
    this.drilldown?.destroy();
    this.zoom?.destroy();
    this.chartClickCleanup?.();
  }

  private setupSeriesDimming(): void {
    const events = this.host.getEvents();
    const inactiveOpacity = this.host.getOptions().plotOptions?.series?.states?.inactive?.opacity ?? 0.2;
    let restoreTimer: ReturnType<typeof setTimeout> | null = null;

    /**
     * Resolves a series' link-group root by following `linkedTo`
     * (`:previous`/`:next`/id). Series in the same group (e.g. a line and its
     * linked area band) are treated as one unit, so hovering one does not dim
     * the others.
     */
    const linkRoot = (list: BaseSeries[], i: number): number => {
      let idx = i;
      for (let guard = 0; guard < list.length; guard++) {
        const lt = list[idx]?.config.linkedTo;
        if (lt == null) break;
        let parent = -1;
        if (lt === ':previous') parent = idx - 1;
        else if (lt === ':next') parent = idx + 1;
        else parent = list.findIndex(s => s.config.id === lt);
        if (parent < 0 || parent === idx) break;
        idx = parent;
      }
      return idx;
    };

    const dimOtherSeries = (hoveredSeries: BaseSeries) => {
      if (restoreTimer) {
        clearTimeout(restoreTimer);
        restoreTimer = null;
      }
      const list = this.host.getSeriesInstances();
      const hoveredIdx = list.indexOf(hoveredSeries);
      const hoveredRoot = hoveredIdx >= 0 ? linkRoot(list, hoveredIdx) : -1;
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        s['group']?.interrupt?.('seriesDim');
        const sameGroup = hoveredIdx >= 0 && linkRoot(list, i) === hoveredRoot;
        if (!sameGroup && s.visible) {
          s['group']?.transition?.('seriesDim')?.duration?.(200)?.attr?.('opacity', inactiveOpacity);
        } else {
          s['group']?.attr?.('opacity', s.config.opacity ?? 1);
        }
      }
    };

    const restoreAllSeries = () => {
      if (restoreTimer) clearTimeout(restoreTimer);
      restoreTimer = setTimeout(() => {
        for (const s of this.host.getSeriesInstances()) {
          s['group']?.interrupt?.('seriesDim');
          s['group']?.transition?.('seriesDim')?.duration?.(200)?.attr?.('opacity', s.config.opacity ?? 1);
        }
        restoreTimer = null;
      }, 50);
    };

    events.on('series:mouseenter', dimOtherSeries);
    events.on('series:mouseleave', restoreAllSeries);
    events.on('legend:itemHover', dimOtherSeries);
    events.on('legend:itemLeave', restoreAllSeries);
  }

  private setupDrilldown(): void {
    const options = this.host.getOptions();
    const cfg = options.drilldown;
    if (!cfg?.series?.length) return;

    const events = this.host.getEvents();
    const seriesGroup = this.host.getSeriesGroup();
    this.drilldown = new Drilldown(cfg, events, this.host.getContainer());

    const drilldownStack: InternalSeriesConfig[][] = [];
    const parser = new OptionsParser();

    const drillAnimCfg = cfg.animation;
    const drillDuration = typeof drillAnimCfg === 'object' ? (drillAnimCfg.duration ?? 400) : (drillAnimCfg !== false ? 400 : 0);

    events.on('drilldown:drilldown', (data: any) => {
      drilldownStack.push([...this.host.getOptions().series]);
      this.clearUserExtremes();

      if (drillDuration > 0) {
        seriesGroup.transition().duration(drillDuration / 2)
          .style('opacity', '0')
          .on('end', () => {
            this.performDrillSwap(data, parser);
            seriesGroup.style('opacity', '0')
              .transition().duration(drillDuration / 2)
              .style('opacity', '1');
          });
      } else {
        this.performDrillSwap(data, parser);
      }
      this.host.fireEvent('drilldown', data);
    });

    events.on('drilldown:drillup', () => {
      const prev = drilldownStack.pop();
      if (prev) {
        this.host.setSeries(prev);
      }
      this.clearUserExtremes();

      if (drillDuration > 0) {
        seriesGroup.transition().duration(drillDuration / 2)
          .style('opacity', '0')
          .on('end', () => {
            this.host.rebuild();
            seriesGroup.style('opacity', '0')
              .transition().duration(drillDuration / 2)
              .style('opacity', '1');
          });
      } else {
        this.host.rebuild();
      }
      this.host.fireEvent('drillup');
    });
  }

  private performDrillSwap(data: any, parser: OptionsParser): void {
    const options = this.host.getOptions();
    const newSeries = data.seriesOptions;
    const parsed = parser.parse({
      chart: options.chart,
      xAxis: options.xAxis,
      yAxis: options.yAxis,
      series: [newSeries],
    });
    this.host.setSeries(parsed.series);
    this.host.rebuild();
  }

  /**
   * Reads the Highcharts zoom/pan options: `chart.zooming` (or the older
   * `chart.zoomType`), plus `chart.panning` / `chart.panKey` (also accepted
   * inside `zooming`, where earlier versions of this library read them).
   */
  private resolveZoomConfig(): ZoomConfig {
    const chart: any = this.host.getOptions().chart;
    const zooming = typeof chart.zooming === 'object' && chart.zooming ? chart.zooming : {};
    const type: ZoomType | undefined = zooming.type
      ?? (typeof chart.zooming === 'string' ? chart.zooming : undefined)
      ?? chart.zoomType ?? undefined;
    const panning = chart.panning ?? zooming.panning;
    return {
      type,
      key: zooming.key,
      mouseWheel: chart.scrollablePlotArea ? false : zooming.mouseWheel,
      pinchType: zooming.pinchType ?? chart.pinchType,
      resetButton: zooming.resetButton ?? chart.resetZoomButton,
      panning,
      panKey: chart.panKey ?? zooming.panKey,
      selectionMarkerFill: chart.selectionMarkerFill,
    };
  }

  private setupZoom(): void {
    this.zoomConfig = this.resolveZoomConfig();
    const pan = this.zoomConfig.panning;
    const panOn = typeof pan === 'object' ? pan?.enabled !== false : pan === true;
    if (!this.zoomConfig.type && !panOn) return;
    this.ensureZoom();
  }

  private ensureZoom(): Zoom {
    if (this.zoom) return this.zoom;
    const renderer = this.host.getRenderer();
    this.zoom = new Zoom(this.zoomConfig, {
      svg: renderer.svg.node() as SVGSVGElement,
      container: this.host.getContainer(),
      getPlotGroup: () => (this.host.getPlotGroup() as any).node?.() ?? null,
      getPlotArea: () => this.host.getLayout().plotArea,
      getChartSize: () => this.host.getChartSize(),
      getXAxes: () => this.host.getXAxes(),
      getYAxes: () => this.host.getYAxes(),
      isInverted: () => !!this.host.getOptions().chart.inverted,
      fireSelection: (e) => this.fireSelection(e),
      redraw: () => this.host.redrawExtremes(),
      onReset: () => this.zoomOut(),
    });
    return this.zoom;
  }

  /**
   * Calls `chart.events.selection` (`this` = chart). Returning false or
   * calling `preventDefault()` cancels the zoom, as in Highcharts.
   */
  private fireSelection(e: SelectionEvent): boolean {
    this.host.getEvents().emit('chart:selection', e);
    const handler = this.host.getOptions().chart.events?.selection;
    if (typeof handler !== 'function') return true;
    return handler.call(this.host.getChart(), e) !== false;
  }

  /** Highcharts `chart.zoomOut()`: fires `selection` with `resetSelection`, then clears every axis range. */
  zoomOut(): void {
    let prevented = false;
    const e: SelectionEvent = {
      type: 'selection',
      resetSelection: true,
      xAxis: [],
      yAxis: [],
      preventDefault: () => { prevented = true; },
    };
    if (!this.fireSelection(e) || prevented) return;
    for (const axis of [...this.host.getXAxes(), ...this.host.getYAxes()]) {
      if (axis.hasUserExtremes()) axis.setExtremes(null, null, false, undefined, { trigger: 'zoom' });
    }
    this.zoom?.setResetButtonVisible(false);
    this.host.redrawExtremes();
  }

  /** Drilling swaps the data (and categories), so any zoom from the previous level no longer applies. */
  private clearUserExtremes(): void {
    for (const axis of [...this.host.getXAxes(), ...this.host.getYAxes()]) {
      if (!axis.hasUserExtremes()) continue;
      axis.userMin = axis.userMax = null;
      axis.chart?.storeUserExtremes?.(axis);
    }
    this.zoom?.setResetButtonVisible(false);
  }

  showResetZoom(): void {
    this.ensureZoom().setResetButtonVisible(true);
  }

  /** Keeps the reset button placed on the plot and hidden once nothing is zoomed. */
  syncResetButton(): void {
    if (!this.zoom) return;
    this.zoom.positionResetButton();
    const zoomed = [...this.host.getXAxes(), ...this.host.getYAxes()].some(a => a.hasUserExtremes());
    if (!zoomed) this.zoom.setResetButtonVisible(false);
  }

  /**
   * Highcharts `chart.events.click`: a click inside the plot area that no
   * point handled. The event gains `xAxis`/`yAxis` arrays of
   * `{ axis, value }` plus `chartX`/`chartY`. Listening on the container
   * lets every svg-level point handler run first; a drag's trailing click is
   * already swallowed by the zoom's capture listener.
   */
  private setupChartClick(): void {
    const container = this.host.getContainer();
    const onClick = (event: MouseEvent) => {
      const handler = this.host.getOptions().chart.events?.click;
      if (typeof handler !== 'function' || handledClicks.has(event)) return;
      const svg = this.host.getRenderer().svg.node() as SVGSVGElement | null;
      const plot = (this.host.getPlotGroup() as any).node?.() as SVGGElement | null;
      const target = event.target as Node | null;
      if (!svg || !plot || !target) return;
      /** Empty plot space hits the chart background rect (or the bare svg); anything else must be inside the plot. */
      const onBackground = target === svg || (target as Element).classList?.contains('katucharts-background');
      if (!onBackground && !plot.contains(target)) return;

      const ctm = plot.getScreenCTM();
      if (!ctm) return;
      const pt = svg.createSVGPoint();
      pt.x = event.clientX;
      pt.y = event.clientY;
      const local = pt.matrixTransform(ctm.inverse());
      const pa = this.host.getLayout().plotArea;
      if (local.x < 0 || local.x > pa.width || local.y < 0 || local.y > pa.height) return;

      const inverted = !!this.host.getOptions().chart.inverted;
      const valueOn = (axis: AxisInstance) => {
        const horizontal = !!axis.config.isX !== inverted;
        return { axis, value: axis.toValue(horizontal ? local.x : local.y) };
      };
      const define = (key: string, value: unknown) =>
        Object.defineProperty(event, key, { value, configurable: true, writable: true });
      define('xAxis', this.host.getXAxes().map(valueOn));
      define('yAxis', this.host.getYAxes().map(valueOn));
      define('chartX', local.x + pa.x);
      define('chartY', local.y + pa.y);
      handler.call(this.host.getChart(), event);
    };
    container.addEventListener('click', onClick);
    this.chartClickCleanup = () => container.removeEventListener('click', onClick);
  }

  private setupAccessibility(): void {
    const options = this.host.getOptions();
    const cfg = options.accessibility;
    if (!cfg || cfg.enabled === false) return;

    this.a11yModule = new A11yModule(cfg);
    this.a11yModule.apply(
      this.host.getRenderer().svg,
      this.host.getSeriesInstances(),
      options.title?.text ?? undefined
    );
  }
}

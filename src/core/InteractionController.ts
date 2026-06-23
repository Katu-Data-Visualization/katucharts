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
import { Zoom, type ZoomConfig, type ZoomType } from '../interaction/Zoom';
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
  /** Re-render axes, series and legend after a zoom/pan domain change. */
  renderAfterZoom(): void;
  fireEvent(name: string, ...args: any[]): void;
}

export class InteractionController {
  private drilldown: Drilldown | null = null;
  private zoom: Zoom | null = null;
  private a11yModule: A11yModule | null = null;
  private origXDomains: ([number, number] | null)[] = [];
  private origYDomains: ([number, number] | null)[] = [];
  private isBoxZoomed = false;

  constructor(private host: InteractionHost) {}

  setup(): void {
    this.setupSeriesDimming();
    this.setupDrilldown();
    this.setupZoom();
    this.setupAccessibility();
  }

  destroy(): void {
    this.drilldown?.destroy();
    this.zoom?.destroy();
  }

  private setupSeriesDimming(): void {
    const events = this.host.getEvents();
    const inactiveOpacity = this.host.getOptions().plotOptions?.series?.states?.inactive?.opacity ?? 0.2;
    let restoreTimer: ReturnType<typeof setTimeout> | null = null;

    const dimOtherSeries = (hoveredSeries: BaseSeries) => {
      if (restoreTimer) {
        clearTimeout(restoreTimer);
        restoreTimer = null;
      }
      for (const s of this.host.getSeriesInstances()) {
        s['group']?.interrupt?.('seriesDim');
        if (s !== hoveredSeries && s.visible) {
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

  private setupZoom(): void {
    const options = this.host.getOptions();
    const zoomCfg = options.chart.zooming || options.chart.zoomType;
    if (!zoomCfg) return;

    const zoomType: ZoomType = (typeof zoomCfg === 'string'
      ? zoomCfg
      : (zoomCfg as any).type || 'x') as ZoomType;

    const config: ZoomConfig = {
      type: zoomType,
      key: typeof zoomCfg === 'object' ? (zoomCfg as any).key : undefined,
      mouseWheel: typeof zoomCfg === 'object' ? (zoomCfg as any).mouseWheel : undefined,
      resetButton: typeof zoomCfg === 'object' ? (zoomCfg as any).resetButton : undefined,
      panning: typeof zoomCfg === 'object' ? (zoomCfg as any).panning : undefined,
      panKey: typeof zoomCfg === 'object' ? (zoomCfg as any).panKey : undefined,
      pinchType: typeof zoomCfg === 'object' ? (zoomCfg as any).pinchType : undefined,
      selectionMarkerFill: options.chart.selectionMarkerFill,
      /**
       * Standard drag-to-box zoom: convert the pixel selection into axis
       * domains and re-render. Returning true suppresses the default selection
       * event so it isn't double-handled.
       */
      selectionHandler: (sel) => this.applyBoxZoom(sel, zoomType),
    };

    const events = this.host.getEvents();
    this.zoom = new Zoom(config, this.host.getPlotGroup() as any, this.host.getLayout().plotArea, this.host.getContainer(), events);
    this.zoom.setResetHandler(() => this.resetBoxZoom());

    events.on('zoom:changed', (data: any) => {
      const transform = data.transform;
      const type: string = data.type;
      const pa = this.host.getLayout().plotArea;

      if (type === 'x' || type === 'xy') {
        for (const xAxis of this.host.getXAxes()) {
          const origDomain = xAxis.scale.domain() as [number, number];
          const fullRange = origDomain[1] - origDomain[0];
          const newMin = origDomain[0] - (transform.x / pa.width) * (fullRange / transform.k);
          const newMax = newMin + fullRange / transform.k;
          xAxis.updateDomain({ min: newMin, max: newMax });
        }
      }
      if (type === 'y' || type === 'xy') {
        for (const yAxis of this.host.getYAxes()) {
          const origDomain = yAxis.scale.domain() as [number, number];
          const fullRange = origDomain[1] - origDomain[0];
          const newMax = origDomain[1] + (transform.y / pa.height) * (fullRange / transform.k);
          const newMin = newMax - fullRange / transform.k;
          yAxis.updateDomain({ min: newMin, max: newMax });
        }
      }

      this.host.renderAfterZoom();
    });
  }

  /**
   * Converts a pixel rectangle from a drag-selection into axis domains and
   * re-renders. Original domains are captured on the first zoom so the reset
   * button can restore the unzoomed view.
   */
  private applyBoxZoom(sel: { xAxis: { min: number; max: number }[]; yAxis: { min: number; max: number }[] }, type: ZoomType): boolean {
    const capture = !this.isBoxZoomed;

    if (type === 'x' || type === 'xy') {
      const xAxes = this.host.getXAxes();
      xAxes.forEach((ax, i) => {
        if (capture) this.origXDomains[i] = ax.scale.domain() as [number, number];
        const a = ax.getValueForPixel(sel.xAxis[0].min);
        const b = ax.getValueForPixel(sel.xAxis[0].max);
        if (a == null || b == null || !Number.isFinite(+a) || !Number.isFinite(+b)) return;
        ax.updateDomain({ min: Math.min(+a, +b), max: Math.max(+a, +b) });
      });
    }
    if (type === 'y' || type === 'xy') {
      const yAxes = this.host.getYAxes();
      yAxes.forEach((ax, i) => {
        if (capture) this.origYDomains[i] = ax.scale.domain() as [number, number];
        const a = ax.getValueForPixel(sel.yAxis[0].min);
        const b = ax.getValueForPixel(sel.yAxis[0].max);
        if (a == null || b == null || !Number.isFinite(+a) || !Number.isFinite(+b)) return;
        ax.updateDomain({ min: Math.min(+a, +b), max: Math.max(+a, +b) });
      });
    }

    this.isBoxZoomed = true;
    this.zoom?.setResetButtonVisible(true);
    this.host.renderAfterZoom();
    this.host.getEvents().emit('chart:afterZoom');
    return true;
  }

  private resetBoxZoom(): void {
    if (!this.isBoxZoomed) return;
    this.host.getXAxes().forEach((ax, i) => {
      const d = this.origXDomains[i];
      if (d) ax.updateDomain({ min: d[0], max: d[1] });
    });
    this.host.getYAxes().forEach((ax, i) => {
      const d = this.origYDomains[i];
      if (d) ax.updateDomain({ min: d[0], max: d[1] });
    });
    this.isBoxZoomed = false;
    this.origXDomains = [];
    this.origYDomains = [];
    this.zoom?.setResetButtonVisible(false);
    this.host.renderAfterZoom();
    this.host.getEvents().emit('chart:afterZoom');
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

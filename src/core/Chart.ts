/**
 * Central chart orchestrator — owns container, SVG, and all subsystems.
 */

import type {
  KatuChartsOptions, InternalConfig, SeriesOptions, AxisOptions,
  PlotArea, SeriesType,
} from '../types/options';
import { OptionsParser } from './OptionsParser';
import { SVGRenderer } from './SVGRenderer';
import { EventBus } from './EventBus';
import { StateManager } from './StateManager';
import { ChartRegistry } from './Registry';
import { LayoutEngine, type LayoutResult } from '../layout/LayoutEngine';
import { createAxis, type AxisInstance } from '../axis/Axis';
import { BaseSeries, type SeriesContext } from '../series/BaseSeries';
import { DataLabels } from '../components/DataLabels';
import { Tooltip, type TooltipPointData } from '../components/Tooltip';
import { Legend } from '../components/Legend';
import { Crosshair } from '../components/Crosshair';
import { Credits } from '../components/Credits';
import { ExportButton } from '../components/ExportButton';
import { ResponsiveEngine } from '../responsive/ResponsiveEngine';
import 'd3-transition';
import type { ExportingOptions } from '../types/options';
import { resolveContainer, getElementDimensions } from '../utils/dom';
import { setMeasureFontFamily } from '../utils/chartText';
import { debounce } from '../utils/throttle';
import { deepMerge, deepClone } from '../utils/deepMerge';
import { templateFormat, stripHtmlTags, numberFormat, setUseUTC } from '../utils/format';
import {
  NON_CARTESIAN_TYPES,
  SELF_RENDERED_DATALABEL_TYPES,
  NO_CLIP_TYPES,
  isNonCartesianChart,
} from './chartTypes';
import { stackKey, accumulateStackTotals, accumulateSignedStackTotals, absStackTotal } from './StackComputer';
import { renderTitles as renderChartTitles } from '../components/TitleRenderer';
import { createFixedAxisOverlay as buildFixedAxisOverlay } from './ScrollablePlotOverlay';
import { ChartExporter } from '../export/ChartExporter';
import { AxisCoordinator } from '../axis/AxisCoordinator';
import { InteractionController } from './InteractionController';
import { StockController } from '../stock/StockController';

/**
 * Outward padding (px) added around the plot-area clip so data labels and edge
 * markers sitting just past the bars/points stay visible instead of being sliced
 * by the plot edge.
 */
const CLIP_MARGIN = 22;

export class Chart {
  container: HTMLElement;
  renderer: SVGRenderer;
  events: EventBus;
  state: StateManager;
  options: InternalConfig;

  private layoutEngine: LayoutEngine;
  private layout!: LayoutResult;
  private xAxes: AxisInstance[] = [];
  private yAxes: AxisInstance[] = [];
  private seriesInstances: BaseSeries[] = [];
  private plotGroup!: ReturnType<SVGRenderer['createGroup']>;
  private axisGroup!: ReturnType<SVGRenderer['createGroup']>;
  private seriesGroup!: ReturnType<SVGRenderer['createGroup']>;
  private tooltip: Tooltip | null = null;
  private legend: Legend | null = null;
  private crosshair: Crosshair | null = null;
  private credits: Credits | null = null;
  private exportButton: ExportButton | null = null;
  private responsiveEngine: ResponsiveEngine | null = null;
  private interactions!: InteractionController;
  private stock: StockController | null = null;
  private clipPathId: string = '';
  private clipMargin: number = 0;
  private chartWidth: number;
  private chartHeight: number;
  private autoHeight = false;
  private resizeObserver: ResizeObserver | null = null;
  private titleGroup!: ReturnType<SVGRenderer['createGroup']>;
  private stackLabelsGroup!: ReturnType<SVGRenderer['createGroup']>;
  private originalUserOptions!: KatuChartsOptions;
  private isResponsiveUpdate = false;

  constructor(containerOrId: string | HTMLElement, options: KatuChartsOptions) {
    this.container = resolveContainer(containerOrId);
    this.container.style.position = 'relative';

    /**
     * Measure text against the host page's actual font so axis-label reservations
     * and wrapping match what the browser renders — avoids the wide safety margin
     * (and the resulting empty gap beside the labels) a generic-font metric needs.
     */
    if (typeof getComputedStyle !== 'undefined') {
      setMeasureFontFamily(getComputedStyle(this.container).fontFamily);
    }

    const parser = new OptionsParser();
    this.options = parser.parse(options);
    this.originalUserOptions = deepClone(options);

    setUseUTC((this.options as any).time?.useUTC !== false);

    this.events = new EventBus();
    this.state = new StateManager(this.options, this.events);
    this.layoutEngine = new LayoutEngine();

    const dims = getElementDimensions(this.container, this.getDefaultHeightAspectRatio());
    const outerWidth = (this.options.chart.width as number) || dims.width || 600;
    let outerHeight = this.resolveHeight(this.options.chart.height, dims.height);

    const scrollable = (this.options.chart as any).scrollablePlotArea as { minWidth?: number; minHeight?: number; scrollPositionX?: number; scrollPositionY?: number } | undefined;
    const useHorizontalScroll = scrollable?.minWidth && scrollable.minWidth > outerWidth;

    this.autoHeight = this.options.chart.height == null && !dims.heightMeasured;
    this.chartWidth = useHorizontalScroll ? scrollable!.minWidth! : outerWidth;

    /**
     * When the height is auto (no explicit height and none imposed by the container),
     * grow the chart to show its content rather than trapping a tall category list in
     * the small aspect-ratio default height. On a short/mobile viewport that internal
     * scroll window otherwise collapses the plot to a few-row sliver. Grow up to the
     * auto-height cap; only content taller than that falls back to the internal scroll.
     */
    if (this.autoHeight) {
      const contentTarget = scrollable?.minHeight
        ? Math.min(scrollable.minHeight, Chart.MAX_AUTO_HEIGHT)
        : 0;
      outerHeight = Math.max(this.fitHeightToContent(outerHeight), contentTarget);
    }

    const useVerticalScroll = scrollable?.minHeight && scrollable.minHeight > outerHeight;

    this.chartHeight = useVerticalScroll ? scrollable!.minHeight! : outerHeight;
    this.scrollableOuterWidth = outerWidth;
    this.scrollableOuterHeight = outerHeight;
    this.useVerticalScroll = !!useVerticalScroll;
    this.useHorizontalScroll = !!useHorizontalScroll;

    if (useVerticalScroll || useHorizontalScroll) {
      this.container.style.position = 'relative';
      const existingInners = this.container.querySelectorAll(':scope > [data-katu-scrollable-inner]');
      existingInners.forEach(el => el.parentElement?.removeChild(el));
      const existingOverlays = this.container.querySelectorAll(':scope > svg[data-katu-fixed-overlay]');
      existingOverlays.forEach(el => el.parentElement?.removeChild(el));
      this.scrollableInner = document.createElement('div');
      this.scrollableInner.setAttribute('data-katu-scrollable-inner', '1');
      this.scrollableInner.style.overflowX = useHorizontalScroll ? 'auto' : 'hidden';
      this.scrollableInner.style.overflowY = useVerticalScroll ? 'auto' : 'hidden';
      this.scrollableInner.style.width = outerWidth + 'px';
      this.scrollableInner.style.height = outerHeight + 'px';
      this.container.appendChild(this.scrollableInner);
    }

    this.setupResponsive();
    this.applyInitialResponsiveRules();

    if (this.autoHeight && !this.useVerticalScroll) {
      this.chartHeight = this.fitHeightToContent(this.chartHeight);
      this.scrollableOuterHeight = this.chartHeight;
    }

    this.renderer = new SVGRenderer(this.scrollableInner || this.container, this.chartWidth, this.chartHeight);
    if (this.scrollableInner) {
      this.renderer.svg.style('max-width', 'none');
    }
    this.exporter = new ChartExporter({
      getRenderer: () => this.renderer,
      getOptions: () => this.options,
      getContainer: () => this.container,
      getSeriesInstances: () => this.seriesInstances,
      setSize: (w, h) => this.setSize(w, h),
      fireEvent: (name, ...args) => this.fireEvent(name, ...args),
      getDefaultHeightAspectRatio: () => this.getDefaultHeightAspectRatio(),
      disconnectResizeObserver: () => this.resizeObserver?.disconnect(),
      observeResizeObserver: () => this.resizeObserver?.observe(this.container),
      getViewportSize: () => this.getViewportSize(),
      fitToViewport: (w, h) => this.fitToViewport(w, h),
    });
    this.axes = new AxisCoordinator({
      getOptions: () => this.options,
      getLayout: () => this.layout,
      getSeriesInstances: () => this.seriesInstances,
      getXAxes: () => this.xAxes,
      getYAxes: () => this.yAxes,
      getAxisGroup: () => this.axisGroup,
      getEvents: () => this.events,
      getTooltip: () => this.tooltip,
    });
    this.interactions = new InteractionController({
      getOptions: () => this.options,
      getContainer: () => this.container,
      getEvents: () => this.events,
      getRenderer: () => this.renderer,
      getSeriesGroup: () => this.seriesGroup,
      getPlotGroup: () => this.plotGroup,
      getLayout: () => this.layout,
      getXAxes: () => this.xAxes,
      getYAxes: () => this.yAxes,
      getSeriesInstances: () => this.seriesInstances,
      setSeries: (series) => { this.options.series = series; },
      rebuild: () => {
        this.seriesInstances.forEach(s => s.destroy());
        this.seriesInstances = [];
        this.buildAxes();
        this.buildSeries();
        this.renderAll();
        this.credits?.refresh();
      },
      renderAfterZoom: () => {
        this.renderAxes();
        this.renderSeriesInstances();
        this.renderLegend();
      },
      fireEvent: (name, ...args) => this.fireEvent(name, ...args),
    });
    this.applyChartStyles();

    this.computeLayout();
    this.createStructuralGroups();
    this.buildAxes();
    this.buildSeries();
    this.renderAll();
    this.credits?.refresh();

    if (useVerticalScroll || useHorizontalScroll) {
      this.createFixedAxisOverlay();
    }

    if (this.options.chart.reflow) {
      this.setupReflow();
    }

    this.interactions.setup();

    this.stock = new StockController({
      getOptions: () => this.options,
      getContainer: () => this.container,
      getEvents: () => this.events,
      getSvg: () => this.renderer.svg,
      getLayout: () => this.layout,
      getChartHeight: () => this.chartHeight,
      getXAxes: () => this.xAxes,
      getSeriesInstances: () => this.seriesInstances,
      rerender: () => {
        this.renderAxes();
        this.renderSeriesInstances();
        this.renderLegend();
      },
    });
    this.stock.setup();

    this.fireEvent('load');
  }

  private scrollableInner: HTMLDivElement | null = null;
  private scrollableOuterWidth = 0;
  private scrollableOuterHeight = 0;
  private useVerticalScroll = false;
  private useHorizontalScroll = false;
  private fixedAxisOverlay: SVGSVGElement | null = null;
  private exporter!: ChartExporter;
  private axes!: AxisCoordinator;

  private createFixedAxisOverlay(): void {
    const overlay = buildFixedAxisOverlay({
      container: this.container,
      renderer: this.renderer,
      options: this.options,
      plotGroup: this.plotGroup,
      layout: this.layout,
      chartWidth: this.chartWidth,
      chartHeight: this.chartHeight,
      scrollableInner: this.scrollableInner,
      scrollableOuterWidth: this.scrollableOuterWidth,
      scrollableOuterHeight: this.scrollableOuterHeight,
      useVerticalScroll: this.useVerticalScroll,
      useHorizontalScroll: this.useHorizontalScroll,
      exportButton: this.exportButton,
      previousOverlay: this.fixedAxisOverlay,
    });
    if (overlay) this.fixedAxisOverlay = overlay;
  }

  private getDefaultHeightAspectRatio(): number {
    const seriesList = this.options?.series || [];
    const types = new Set(seriesList.map((s: any) => s?.type || this.options?.chart?.type));
    /**
     * Circular relationship charts want a (near-)square canvas so the ring/graph isn't
     * squashed; only used when the container has no measurable height of its own.
     */
    if (types.has('dependencywheel') || types.has('networkgraph')) return 1;
    if (types.has('treemap') || types.has('sankey')) return 0.3;
    if (types.has('pie') || types.has('donut') || types.has('radar')) return 0.6;
    return 0.5;
  }

  /**
   * Minimum usable plot-area height for an auto-sized chart. Below this the
   * series get squeezed into an unreadable strip on narrow viewports.
   */
  private static readonly MIN_AUTO_PLOT_HEIGHT = 160;

  /**
   * Hard ceiling for auto-grown height so a chart with extreme fixed overhead
   * (very long rotated labels, large legends) can't expand without bound. Kept
   * compact so a long category list stays a reasonable size and scrolls past it
   * rather than dominating the page.
   */
  private static readonly MAX_AUTO_HEIGHT = 450;

  /**
   * Minimum height per category band on a vertical category axis (heatmap rows,
   * inverted/bar categories) so row labels don't overlap.
   */
  private static readonly MIN_CATEGORY_ROW_HEIGHT = 22;

  /**
   * When the height is derived rather than configured, a chart on a narrow
   * viewport can end up shorter than the fixed vertical overhead (title,
   * subtitle, legend, axis labels), collapsing the plot area to nothing.
   *
   * The overhead is independent of the chart height, so a single probe layout
   * at a tall height yields the true overhead; the height is then grown just
   * enough to give the plot area a usable minimum.
   */
  private fitHeightToContent(baseHeight: number): number {
    const PROBE = 4000;
    const probe = this.layoutEngine.compute(this.options, this.chartWidth, PROBE);
    const overhead = PROBE - probe.plotArea.height;
    const domePlot = this.itemHemicyclePlotHeight(probe.plotArea.width);
    const minPlot = Math.max(
      Chart.MIN_AUTO_PLOT_HEIGHT,
      this.verticalCategoryCount() * Chart.MIN_CATEGORY_ROW_HEIGHT,
      domePlot,
    );
    const required = Math.ceil(overhead + minPlot);
    if (required <= baseHeight) return baseHeight;
    /**
     * A parliament/dome needs height proportional to its width, so it grows past
     * the generic auto-height cap (which exists to keep a long category list
     * compact, not to squash a chart that fills its width into a sliver).
     */
    const cap = domePlot > 0 ? required : Chart.MAX_AUTO_HEIGHT;
    return Math.min(required, Math.max(baseHeight, cap));
  }

  /**
   * Plot height a hemicycle item series ("parliament") needs to fill the plot
   * width without being squashed: the dome that spans the width has a radius of
   * ~half the width, and its arc — offset by the configured center — must clear
   * the top and bottom edges. Returns 0 for non-hemicycle item layouts.
   */
  private itemHemicyclePlotHeight(plotWidth: number): number {
    const s = this.options.series?.[0] as { _internalType?: string; startAngle?: number; endAngle?: number; center?: (string | number)[] } | undefined;
    if (!s || s._internalType !== 'item' || s.startAngle == null || s.endAngle == null || plotWidth <= 0) return 0;
    const start = s.startAngle * (Math.PI / 180), end = s.endAngle * (Math.PI / 180);
    let sMax = 0, cMax = -Infinity, cMin = Infinity;
    for (let i = 0; i <= 180; i++) {
      const a = start + (end - start) * (i / 180);
      sMax = Math.max(sMax, Math.abs(Math.sin(a)));
      cMax = Math.max(cMax, Math.cos(a));
      cMin = Math.min(cMin, Math.cos(a));
    }
    const cyRaw = Array.isArray(s.center) ? s.center[1] : '50%';
    const cyPct = typeof cyRaw === 'string' && cyRaw.endsWith('%') ? parseFloat(cyRaw) / 100 : 0.5;
    const radius = (plotWidth / 2) / (sMax || 1);
    const topNeed = cMax > 0 ? (cMax * radius) / Math.max(cyPct, 0.05) : 0;
    const botNeed = cMin < 0 ? (-cMin * radius) / Math.max(1 - cyPct, 0.05) : 0;
    return Math.min(Math.ceil(Math.max(topNeed, botNeed)), Chart.MAX_AUTO_HEIGHT);
  }

  /**
   * Categories rendered down the vertical axis (heatmap rows, or the category
   * axis of an inverted/bar chart). Each one needs a minimum band so the labels
   * stay legible instead of piling up when the plot is short.
   */
  private verticalCategoryCount(): number {
    const series = this.options.series || [];
    const hasHeatmap = series.some(s => (s as { _internalType?: string })._internalType === 'heatmap');
    const axes = hasHeatmap ? this.options.yAxis : this.options.chart.inverted ? this.options.xAxis : null;
    if (!axes) return 0;
    let max = 0;
    for (const a of axes) {
      const n = a.categories?.length ?? 0;
      if (n > max) max = n;
    }
    return max;
  }

  private resolveHeight(configured: number | string | null | undefined, containerHeight: number): number {
    if (typeof configured === 'number') return configured;
    if (typeof configured === 'string') {
      if (configured.endsWith('%')) {
        return (parseFloat(configured) / 100) * containerHeight;
      }
      const parsed = parseFloat(configured);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return containerHeight || 400;
  }

  private applyChartStyles(): void {
    const bg = this.options.chart.backgroundColor;
    if (bg) {
      this.renderer.svg.append('rect')
        .attr('class', 'katucharts-background')
        .attr('width', this.chartWidth)
        .attr('height', this.chartHeight)
        .attr('fill', bg)
        .attr('rx', this.options.chart.borderRadius ?? 0);
    }

    if (this.options.chart.borderWidth) {
      this.renderer.svg.append('rect')
        .attr('class', 'katucharts-border')
        .attr('width', this.chartWidth)
        .attr('height', this.chartHeight)
        .attr('fill', 'none')
        .attr('stroke', this.options.chart.borderColor || '#335cad')
        .attr('stroke-width', this.options.chart.borderWidth)
        .attr('rx', this.options.chart.borderRadius ?? 0);
    }
  }

  private computeLayout(): void {
    this.layout = this.layoutEngine.compute(this.options, this.chartWidth, this.chartHeight);
  }

  private createStructuralGroups(): void {
    this.titleGroup = this.renderer.createGroup('katucharts-title-group');
    this.renderTitles();

    this.plotGroup = this.renderer.createGroup('katucharts-plot-group');
    this.plotGroup.attr('transform', `translate(${this.layout.plotArea.x},${this.layout.plotArea.y})`);

    const plotBg = this.options.chart.plotBackgroundColor;
    if (plotBg) {
      this.plotGroup.append('rect')
        .attr('class', 'katucharts-plot-background')
        .attr('width', this.layout.plotArea.width)
        .attr('height', this.layout.plotArea.height)
        .attr('fill', plotBg);
    }

    const plotBorderWidth = this.options.chart.plotBorderWidth;
    if (plotBorderWidth) {
      this.plotGroup.append('rect')
        .attr('class', 'katucharts-plot-border')
        .attr('width', this.layout.plotArea.width)
        .attr('height', this.layout.plotArea.height)
        .attr('fill', 'none')
        .attr('stroke', this.options.chart.plotBorderColor || '#cccccc')
        .attr('stroke-width', plotBorderWidth);
    }

    if (this.options.chart.plotShadow) {
      (this.plotGroup.node() as SVGGElement)?.setAttribute(
        'filter', 'drop-shadow(3px 3px 6px rgba(0,0,0,0.15))'
      );
    }

    this.axisGroup = this.renderer.createGroup('katucharts-axis-group', this.plotGroup as any);
    this.seriesGroup = this.renderer.createGroup('katucharts-series-group', this.plotGroup as any);
    this.stackLabelsGroup = this.renderer.createGroup('katucharts-stack-labels-group', this.plotGroup as any);

    const clipDisabled = this.options.series.some(s => s.clip === false || NO_CLIP_TYPES.has(s._internalType));

    /**
     * The plot-area clip is expanded by a small margin so that content sitting
     * just outside the bars/points — a value label above the tallest column, an
     * edge marker — is not sliced by the plot-area edge, while still clipping
     * panned/zoomed series content.
     */
    this.clipMargin = (!isNonCartesianChart(this.options.series) && !clipDisabled) ? CLIP_MARGIN : 0;
    this.clipPathId = this.renderer.createClipPath(
      -this.clipMargin, -this.clipMargin,
      this.layout.plotArea.width + 2 * this.clipMargin,
      this.layout.plotArea.height + 2 * this.clipMargin
    );

    if (!isNonCartesianChart(this.options.series) && !clipDisabled) {
      this.seriesGroup.attr('clip-path', `url(#${this.clipPathId})`);
    }

    this.tooltip = new Tooltip(this.options.tooltip, this.container, this.layout.plotArea, this.events);
    if (this.options.tooltip?.shared) {
      this.tooltip.setSharedPointsProvider((x) => this.collectSharedPointsAt(x));
    }
    this.legend = new Legend(
      { ...this.options.legend, _backgroundColor: this.options.chart.backgroundColor } as any,
      this.renderer.svg,
      this.events
    );
    this.credits = new Credits(this.options.credits, this.renderer.svg, this.chartWidth, this.chartHeight);

    if (this.options.exporting.enabled !== false) {
      this.exportButton = new ExportButton(
        this.options.exporting,
        this.renderer.svg,
        this.container,
        this.chartWidth,
        this.chartHeight,
        (type) => this.handleExportAction(type),
      );
    }

    let xCrosshair = this.options.xAxis[0]?.crosshair;
    let yCrosshair = this.options.yAxis[0]?.crosshair;
    /**
     * `tooltip.crosshairs` (true or [x, y]) is the conventional shorthand for
     * enabling axis crosshairs alongside a shared tooltip; honor it when the
     * axes themselves don't already opt in.
     */
    const ttCrosshairs = (this.options.tooltip as any)?.crosshairs;
    if (ttCrosshairs) {
      const cx = Array.isArray(ttCrosshairs) ? ttCrosshairs[0] : ttCrosshairs;
      const cy = Array.isArray(ttCrosshairs) ? ttCrosshairs[1] : false;
      if (cx && !xCrosshair) xCrosshair = (typeof cx === 'object' ? cx : true) as any;
      if (cy && !yCrosshair) yCrosshair = (typeof cy === 'object' ? cy : true) as any;
    }
    if (xCrosshair || yCrosshair) {
      /**
       * Match the crosshair's hide grace to the tooltip's so they appear and
       * vanish together — without it the crosshair flickers off in the gap
       * between point markers while the (delayed) tooltip stays visible.
       */
      const crosshairHideDelay = this.options.tooltip?.enabled === false
        ? 0
        : ((this.options.tooltip as any)?.hideDelay ?? 500);
      this.crosshair = new Crosshair(xCrosshair, yCrosshair, this.plotGroup as any, this.layout.plotArea, this.events, crosshairHideDelay);
    }
  }

  private renderTitles(): void {
    renderChartTitles({
      titleGroup: this.titleGroup,
      container: this.container,
      options: this.options,
      layout: this.layout,
      chartWidth: this.chartWidth,
    });
  }

  private buildAxes(): void {
    /**
     * Heatmaps center their color legend on the whole chart width, so the x-axis
     * title is asked to center the same way (instead of on the plot) to stay
     * aligned with that legend.
     */
    const centerXTitleOnChart = this.options.series.some(s => s._internalType === 'heatmap');
    this.xAxes = this.options.xAxis.map(cfg => createAxis(
      centerXTitleOnChart ? { ...cfg, _centerTitleOnChart: true, _chartWidth: this.chartWidth } as any : cfg,
      this.layout.plotArea
    ));
    this.yAxes = this.options.yAxis.map(cfg => createAxis(cfg, this.layout.plotArea));
  }

  private buildSeries(): void {
    const config = this.options;

    this.seriesInstances = config.series.map((seriesCfg, i) => {
      const type = seriesCfg._internalType;
      const Ctor = ChartRegistry.getType(type);

      if (!Ctor) {
        console.warn(`KatuCharts: unknown series type "${type}", falling back to line`);
        const FallbackCtor = ChartRegistry.getType('line');
        if (!FallbackCtor) throw new Error('KatuCharts: line series type not registered');
        return new FallbackCtor(seriesCfg);
      }

      return new Ctor(seriesCfg) as BaseSeries;
    });
  }

  /**
   * For a shared tooltip: returns the nearest point in every tracked, visible
   * series at the given x, so a single hover renders the whole column. Series
   * with mouse tracking disabled (e.g. indicator band fills) are excluded.
   */
  private collectSharedPointsAt(x: number | string): TooltipPointData[] {
    const result: TooltipPointData[] = [];
    const xNum = typeof x === 'number' ? x : NaN;

    for (let i = 0; i < this.seriesInstances.length; i++) {
      const s = this.seriesInstances[i];
      const cfg = this.options.series[i];
      if (!s.visible || cfg.enableMouseTracking === false) continue;

      const data = s.data;
      if (!data || data.length === 0) continue;

      let best: any = null;
      let bestDist = Infinity;
      for (const p of data) {
        if (p.x === undefined || p.x === null) continue;
        const dist = Math.abs((p.x as number) - xNum);
        if (dist < bestDist) { bestDist = dist; best = p; }
      }
      if (!best) continue;

      const yVal = best.close ?? best.y ?? best.high;
      if (yVal === null || yVal === undefined) continue;

      const xAxis = this.xAxes[cfg._xAxisIndex] || this.xAxes[0];
      const yAxis = this.yAxes[cfg._yAxisIndex] || this.yAxes[0];

      result.push({
        point: best,
        plotX: xAxis.getPixelForValue(best.x),
        plotY: yAxis.getPixelForValue(yVal),
        series: {
          name: cfg.name ?? '',
          color: (s as any).getColor?.() ?? cfg.color ?? '#333',
          config: cfg,
        },
      });
    }

    return result;
  }

  private renderAll(): void {
    this.updateAxesDomains();
    this.updateTooltipCategories();
    this.renderAxes();
    this.renderSeriesInstances();
    this.renderStackLabels();
    this.raiseplotLineLabels();
    this.renderLegend();
    this.fireEvent('render');
  }

  private formatStackLabel(total: number, cfg: NonNullable<AxisOptions['stackLabels']>): string {
    if (cfg.formatter) {
      return cfg.formatter.call({ total });
    }
    if (cfg.format) {
      return stripHtmlTags(templateFormat(cfg.format, { total }));
    }
    if (this.options.chart.numberFormatter) {
      return this.options.chart.numberFormatter(total);
    }
    return numberFormat(total, 0, '.', ',');
  }

  private renderStackLabels(): void {
    if (!this.stackLabelsGroup) return;
    this.stackLabelsGroup.selectAll('*').remove();

    for (let axisIndex = 0; axisIndex < this.yAxes.length; axisIndex++) {
      const axis = this.yAxes[axisIndex];
      const stackCfg = axis.config.stackLabels;
      if (!stackCfg?.enabled) continue;

      const related = this.seriesInstances
        .map((series, idx) => ({ series, cfg: this.options.series[idx] }))
        .filter(({ series, cfg }) =>
          series.visible &&
          cfg._yAxisIndex === axisIndex &&
          (cfg._internalType === 'column' || cfg._internalType === 'bar') &&
          cfg.stacking &&
          cfg.stacking !== 'percent'
        );

      if (related.length === 0) continue;

      const stacks = new Map<string, {
        totals: Map<number | string, number>;
        series: BaseSeries[];
        type: string;
        xAxis: AxisInstance;
        yAxis: AxisInstance;
      }>();

      for (const { series, cfg } of related) {
        const key = stackKey(cfg);
        if (!stacks.has(key)) {
          stacks.set(key, {
            totals: new Map<number | string, number>(),
            series: [],
            type: cfg._internalType,
            xAxis: this.xAxes[cfg._xAxisIndex] || this.xAxes[0],
            yAxis: this.yAxes[cfg._yAxisIndex] || this.yAxes[0],
          });
        }
        const entry = stacks.get(key)!;
        entry.series.push(series);
        accumulateStackTotals(series.data, entry.totals);
      }

      const axisGroup = this.stackLabelsGroup.append('g')
        .attr('class', `katucharts-stack-labels katucharts-stack-labels-axis-${axisIndex}`);

      for (const [stackKey, stack] of stacks) {
        const stackGroup = axisGroup.append('g')
          .attr('class', 'katucharts-stack-labels-stack')
          .attr('data-stack-key', stackKey);

        for (const [xKey, total] of stack.totals.entries()) {
          if (!isFinite(total) || total === 0) continue;
          const text = this.formatStackLabel(total, stackCfg);
          const isHorizontal = stack.type === 'bar';
          const isNegative = total < 0;
          const categoryCenter = stack.xAxis.getPixelForValue(xKey);
          const totalPixel = stack.yAxis.getPixelForValue(total);
          const defaultAlign = isHorizontal ? (isNegative ? 'end' : 'start') : 'middle';
          const defaultBaseline = isHorizontal ? 'central' : (isNegative ? 'hanging' : 'auto');
          const defaultX = isHorizontal ? totalPixel + (isNegative ? -6 : 6) : categoryCenter;
          const defaultY = isHorizontal ? categoryCenter : totalPixel + (isNegative ? 6 : -6);
          const x = defaultX + (stackCfg.x ?? 0);
          const y = defaultY + (stackCfg.y ?? 0);

          const label = stackGroup.append('text')
            .attr('class', 'katucharts-stack-label')
            .attr('x', x)
            .attr('y', y)
            .attr('text-anchor', stackCfg.align === 'left' ? 'start' : stackCfg.align === 'right' ? 'end' : defaultAlign)
            .text(text);

          if (stackCfg.verticalAlign === 'middle' || isHorizontal) {
            label.attr('dominant-baseline', defaultBaseline);
          } else if (stackCfg.verticalAlign === 'bottom') {
            label.attr('dominant-baseline', 'hanging');
          }

          const style = stackCfg.style || {};
          label
            .style('fill', style.color ?? '#000000')
            .style('font-size', style.fontSize ?? '11px')
            .style('font-weight', style.fontWeight ?? 'bold');

          if (style.textOutline) {
            label.style('text-shadow', style.textOutline as string);
          }

          if (stackCfg.rotation) {
            label.attr('transform', `rotate(${stackCfg.rotation},${x},${y})`);
          }
        }
      }
    }
  }

  private raiseplotLineLabels(): void {
    const plotGroupNode = (this.plotGroup as any).node() as SVGGElement | null;
    if (!plotGroupNode) return;
    this.axisGroup.selectAll('.katucharts-plot-line-label').each(function() {
      plotGroupNode.appendChild(this as Node);
    });
  }

  private updateTooltipCategories(): void {
    this.axes.updateTooltipCategories();
  }

  private updateAxesDomains(): void {
    this.axes.updateAxesDomains();
  }

  /**
   * Folds per-group positive and negative stack sums into a single absolute-
   * height map per category, used as the denominator for percent stacking.
   */
  private buildAbsStackTotals(
    pos: Map<string, Map<number | string, number>>,
    neg: Map<string, Map<number | string, number>>
  ): Map<string, Map<number | string, number>> {
    const out = new Map<string, Map<number | string, number>>();
    for (const sk of pos.keys()) {
      const m = new Map<number | string, number>();
      const p = pos.get(sk)!;
      const n = neg.get(sk) || new Map();
      for (const k of new Set([...p.keys(), ...n.keys()])) m.set(k, absStackTotal(k, p, n));
      out.set(sk, m);
    }
    return out;
  }

  private renderAxes(): void {
    this.axes.renderAxes();
  }

  private renderSeriesInstances(): void {
    this.seriesGroup.selectAll('*').remove();

    const typeCount = new Map<string, number>();
    const typeIndex = new Map<string, number>();
    for (const cfg of this.options.series) {
      const t = cfg._internalType;
      typeCount.set(t, (typeCount.get(t) || 0) + 1);
      typeIndex.set(t, 0);
    }

    const chartAnimate = this.options.chart.animation !== false;

    const buildStackKey = stackKey;

    const stackSeriesCount = new Map<string, number>();
    const stackSeriesIndex = new Map<string, number>();
    const stackTotalsPos = new Map<string, Map<number | string, number>>();
    const stackTotalsNeg = new Map<string, Map<number | string, number>>();
    const precomputedOffsetsPos = new Map<number, Map<number | string, number>>();
    const precomputedOffsetsNeg = new Map<number, Map<number | string, number>>();
    for (let i = 0; i < this.options.series.length; i++) {
      const cfg = this.options.series[i];
      if (cfg.stacking) {
        const s = this.seriesInstances[i];
        s.processData();
        // A hidden series contributes nothing to the stack: excluding it lets the
        // remaining series re-stack to close the gap and, for percent stacking,
        // renormalise to 100%. Mirrors the animated-redraw path so a full render
        // and a legend toggle agree.
        if (!s.visible) continue;
        const sk = buildStackKey(cfg);
        stackSeriesCount.set(sk, (stackSeriesCount.get(sk) || 0) + 1);
        if (!stackTotalsPos.has(sk)) { stackTotalsPos.set(sk, new Map()); stackTotalsNeg.set(sk, new Map()); }
        accumulateSignedStackTotals(s.data, stackTotalsPos.get(sk)!, stackTotalsNeg.get(sk)!);
      }
    }

    const stackTotalsAbs = this.buildAbsStackTotals(stackTotalsPos, stackTotalsNeg);

    const fwdPos = new Map<string, Map<number | string, number>>();
    const fwdNeg = new Map<string, Map<number | string, number>>();
    for (let i = 0; i < this.options.series.length; i++) {
      const cfg = this.options.series[i];
      if (!cfg.stacking) continue;
      const sk = buildStackKey(cfg);
      if (!fwdPos.has(sk)) { fwdPos.set(sk, new Map()); fwdNeg.set(sk, new Map()); }
      precomputedOffsetsPos.set(i, new Map(fwdPos.get(sk)!));
      precomputedOffsetsNeg.set(i, new Map(fwdNeg.get(sk)!));
      // Skip hidden series so they don't advance the running offset — otherwise a
      // series stacked above a hidden one floats above an empty gap.
      if (!this.seriesInstances[i].visible) continue;
      accumulateSignedStackTotals(this.seriesInstances[i].data, fwdPos.get(sk)!, fwdNeg.get(sk)!);
    }

    for (let i = 0; i < this.seriesInstances.length; i++) {
      const series = this.seriesInstances[i];
      const cfg = this.options.series[i];
      const xAxis = this.xAxes[cfg._xAxisIndex] || this.xAxes[0];
      const yAxis = this.yAxes[cfg._yAxisIndex] || this.yAxes[0];

      const t = cfg._internalType;
      const idxInType = typeIndex.get(t) || 0;
      typeIndex.set(t, idxInType + 1);

      let stackOffsetsPos: Map<number | string, number> | undefined;
      let stackOffsetsNeg: Map<number | string, number> | undefined;
      if (cfg.stacking) {
        stackOffsetsPos = precomputedOffsetsPos.get(i) || new Map();
        stackOffsetsNeg = precomputedOffsetsNeg.get(i) || new Map();
      }

      const context: SeriesContext = {
        plotArea: this.layout.plotArea,
        chartWidth: this.chartWidth,
        xAxis,
        yAxis,
        colorIndex: i,
        colors: this.options.colors,
        events: this.events,
        chartGroup: this.seriesGroup as any,
        plotGroup: this.plotGroup as any,
        totalSeriesOfType: cfg.stacking ? (stackSeriesCount.get(buildStackKey(cfg)) || 1) : (typeCount.get(t) || 1),
        indexInType: cfg.stacking ? (stackSeriesIndex.get(buildStackKey(cfg)) || 0) : idxInType,
        animate: chartAnimate && cfg.animation !== false,
        stackOffsets: stackOffsetsPos,
        stackOffsetsPos,
        stackOffsetsNeg,
        stackTotals: cfg.stacking ? stackTotalsAbs.get(buildStackKey(cfg)) : undefined,
        allSeries: this.seriesInstances,
        inverted: !!this.options.chart.inverted,
        legendConfig: this.options.legend,
        pane: (this.options as any).pane,
        backgroundColor: this.options.chart.backgroundColor,
      };

      series.processData();
      series.init(context);
      series.render();

      if (cfg.stacking) {
        const stackKey = buildStackKey(cfg);
        stackSeriesIndex.set(stackKey, (stackSeriesIndex.get(stackKey) || 0) + 1);
      }
      series.setOnVisibilityChange((dur) => this.animatedRedraw(dur));

      if (cfg.dataLabels?.enabled
          && !NON_CARTESIAN_TYPES.has(cfg._internalType)
          && !SELF_RENDERED_DATALABEL_TYPES.has(cfg._internalType)) {
        DataLabels.render(
          series['group'],
          series.data,
          cfg.dataLabels,
          xAxis, yAxis,
          cfg.name || ''
        );
      }
    }

    this.declutterColumnDataLabels();
    this.reorderSeriesByZIndex();
  }

  /**
   * After the columns draw their value labels, spread the ones that pile up
   * inside a single bar. Labels are grouped by the bar they sit on (same centre
   * on the category axis) and, where two would overlap, the later one is nudged
   * along the bar to the nearest free slot — staying inside the plot — so a tall
   * bar's thin segments relocate their numbers into open space instead of
   * printing them on top of each other. Vertical columns spread along y,
   * horizontal bars along x. Runs after every draw so the layout survives a
   * legend toggle.
   */
  private declutterColumnDataLabels(): void {
    const isBar = (t: string) => t === 'column' || t === 'bar';
    const active = this.options.series.some(
      (cfg, i) => this.seriesInstances[i]?.visible && cfg.dataLabels?.enabled && isBar(cfg._internalType)
    );
    if (!active) return;

    const inverted = !!this.options.chart.inverted;
    const plotSize = inverted ? this.layout.plotArea.width : this.layout.plotArea.height;
    if (!(plotSize > 0)) return;

    type L = { el: SVGTextElement; main: number; cross: number; thick: number };
    const labels: L[] = [];
    for (let i = 0; i < this.seriesInstances.length; i++) {
      const s = this.seriesInstances[i];
      const cfg = this.options.series[i];
      if (!s.visible || !cfg.dataLabels?.enabled || !isBar(cfg._internalType)) continue;
      const group = (s as any).group;
      if (!group) continue;
      group.selectAll('.katucharts-data-labels text').each(function (this: SVGTextElement) {
        const x = parseFloat(this.getAttribute('x') || '0');
        const y = parseFloat(this.getAttribute('y') || '0');
        let w = 8, h = 12;
        try { const b = this.getBBox(); w = b.width; h = b.height; } catch { /* not laid out yet */ }
        // `main` is the axis we spread along; `cross` groups labels onto one bar.
        labels.push(inverted
          ? { el: this, main: x, cross: Math.round(y), thick: w }
          : { el: this, main: y, cross: Math.round(x), thick: h });
      });
    }
    if (labels.length < 2) return;

    const bars = new Map<number, L[]>();
    for (const l of labels) {
      const arr = bars.get(l.cross);
      if (arr) arr.push(l); else bars.set(l.cross, [l]);
    }

    const gap = 1;
    for (const arr of bars.values()) {
      if (arr.length < 2) continue;
      arr.sort((a, b) => a.main - b.main);
      let moved = false;
      for (let i = 1; i < arr.length; i++) {
        const need = arr[i - 1].main + arr[i - 1].thick / 2 + gap + arr[i].thick / 2;
        if (arr[i].main < need - 0.5) { arr[i].main = need; moved = true; }
      }
      if (!moved) continue;
      // Slide the whole run back inside the plot if it pushed off either end.
      const last = arr[arr.length - 1];
      const over = (last.main + last.thick / 2) - plotSize;
      if (over > 0) arr.forEach(l => { l.main -= over; });
      const first = arr[0];
      const under = (first.thick / 2) - first.main;
      if (under > 0) arr.forEach(l => { l.main += under; });
      for (const l of arr) l.el.setAttribute(inverted ? 'x' : 'y', String(l.main));
    }
  }

  /**
   * Paints series in ascending `zIndex` order so a higher-zIndex series sits on
   * top — e.g. a line (zIndex 1) over its linked area band (zIndex 0), instead
   * of the band covering the line's markers. Stable for the all-default (0)
   * case, so the original order is preserved when no zIndex is set.
   */
  private reorderSeriesByZIndex(): void {
    const parent = (this.seriesGroup as any)?.node?.() as SVGGElement | undefined;
    if (!parent) return;
    const groups = Array.from(parent.querySelectorAll(':scope > g.katucharts-series')) as SVGGElement[];
    if (groups.length < 2) return;
    const zByIndex = new Map(this.seriesInstances.map(s => [s.config.index, s.config.zIndex ?? 0]));
    const decorated = groups.map((g, i) => ({
      g, i, z: zByIndex.get(Number(g.getAttribute('data-series-index'))) ?? 0,
    }));
    decorated.sort((a, b) => (a.z - b.z) || (a.i - b.i));
    for (const d of decorated) parent.appendChild(d.g);
  }

  private renderLegend(): void {
    if (this.legend) {
      this.legend.render(this.seriesInstances, this.layout.legendArea);
    }
  }

  private setupReflow(): void {
    if (typeof ResizeObserver === 'undefined') return;

    const handleResize = debounce(() => this.reflow(), 100);
    this.resizeObserver = new ResizeObserver(handleResize);
    this.resizeObserver.observe(this.container);
  }

  private fireEvent(name: string, ...args: any[]): void {
    this.events.emit(`chart:${name}`, this, ...args);
    const handler = this.options.chart.events?.[name as keyof typeof this.options.chart.events];
    if (typeof handler === 'function') {
      (handler as Function).call(this, ...args);
    }
  }

  /**
   * Plot geometry exposed for custom `chart.events.render` callbacks.
   */
  get plotLeft(): number { return this.layout.plotArea.x; }
  get plotTop(): number { return this.layout.plotArea.y; }
  get plotWidth(): number { return this.layout.plotArea.width; }
  get plotHeight(): number { return this.layout.plotArea.height; }

  get plotRenderer() {
    const sg = this.seriesGroup as any;
    const xAxes = this.xAxes;
    const yAxes = this.yAxes;
    const pa = this.layout.plotArea;
    return {
      rect(x: number, y: number, w: number, h: number) {
        return sg.insert('rect', ':first-child').attr('x', x).attr('y', y).attr('width', w).attr('height', h);
      },
      circle(cx: number, cy: number, r: number) {
        return sg.insert('circle', ':first-child').attr('cx', cx).attr('cy', cy).attr('r', r);
      },
      ellipse(cx: number, cy: number, rx: number, ry: number) {
        return sg.insert('ellipse', ':first-child').attr('cx', cx).attr('cy', cy).attr('rx', rx).attr('ry', ry);
      },
      path(d: string) {
        return sg.insert('path', ':first-child').attr('d', d);
      },
      line(x1: number, y1: number, x2: number, y2: number) {
        return sg.insert('line', ':first-child').attr('x1', x1).attr('y1', y1).attr('x2', x2).attr('y2', y2);
      },
      text(str: string, x: number, y: number) {
        return sg.append('text').attr('x', x).attr('y', y).text(str);
      },
      group(className?: string) {
        const g = sg.insert('g', ':first-child');
        if (className) g.attr('class', className);
        g.style('pointer-events', 'none');
        return g;
      },
      get plotArea() { return { x: 0, y: 0, width: pa.width, height: pa.height }; },
      get localPlotArea() { return { x: 0, y: 0, width: pa.width, height: pa.height }; },
      xAxis: {
        toPixels(val: number, axisIdx = 0) { return xAxes[axisIdx]?.getPixelForValue(val) ?? 0; },
      },
      yAxis: {
        toPixels(val: number, axisIdx = 0) { return yAxes[axisIdx]?.getPixelForValue(val) ?? 0; },
      },
    };
  }

  private setupResponsive(): void {
    if (!this.options.responsive?.rules?.length) return;
    this.responsiveEngine = new ResponsiveEngine(this.options.responsive);
  }

  private applyInitialResponsiveRules(): void {
    if (!this.responsiveEngine) return;
    const result = this.responsiveEngine.evaluate(this.chartWidth, this.chartHeight);
    if (result.changed && result.matchingIndices.length > 0) {
      const rules = this.responsiveEngine.getRules();
      let effective = deepClone(this.originalUserOptions) as any;
      for (const idx of result.matchingIndices) {
        effective = this.mergeResponsiveChartOptions(effective, rules[idx].chartOptions as any);
      }
      const parser = new OptionsParser();
      this.options = parser.parse(effective);
      this.state.updateConfig(this.options);
    }
  }

  /**
   * Applies a responsive rule's chartOptions over the current options. Plain `deepMerge`
   * replaces arrays wholesale, so a rule that tweaks one entry of `series`/`xAxis`/`yAxis`
   * (e.g. a mobile `size`) would drop the rest of that entry — including a series' `data`,
   * blanking the chart. Re-merge those config arrays by index so partial overrides layer
   * onto the base entry, matching the conventional responsive-rule semantics.
   */
  private mergeResponsiveChartOptions(base: any, rule: any): any {
    const merged = deepMerge(base, rule);
    for (const key of ['series', 'xAxis', 'yAxis', 'colorAxis']) {
      const baseArr = base?.[key];
      const ruleArr = rule?.[key];
      if (Array.isArray(baseArr) && Array.isArray(ruleArr)) {
        merged[key] = baseArr.map((entry: any, i: number) =>
          ruleArr[i] != null ? deepMerge(entry, ruleArr[i]) : entry
        );
        for (let i = baseArr.length; i < ruleArr.length; i++) merged[key].push(ruleArr[i]);
      }
    }
    return merged;
  }

  addSeries(options: SeriesOptions, redraw = true): BaseSeries {
    if (!this.originalUserOptions.series) this.originalUserOptions.series = [];
    this.originalUserOptions.series.push(options);

    const parser = new OptionsParser();
    const parsed = parser.parse({ series: [options] });
    const seriesCfg = {
      ...parsed.series[0],
      index: this.options.series.length,
    };

    this.state.addSeries(seriesCfg);
    this.options = this.state.getConfig();

    const Ctor = ChartRegistry.getType(seriesCfg._internalType) || ChartRegistry.getType('line');
    if (!Ctor) throw new Error('KatuCharts: no series type registered');

    const instance = new Ctor(seriesCfg) as BaseSeries;
    this.seriesInstances.push(instance);

    if (redraw) this.redraw();
    return instance;
  }

  get(id: string): BaseSeries | AxisInstance | undefined {
    const series = this.seriesInstances.find(s => s.config.id === id);
    if (series) return series;
    const xAxis = this.xAxes.find(a => a.config.id === id);
    if (xAxis) return xAxis;
    return this.yAxes.find(a => a.config.id === id);
  }

  private canReuseSeriesInstances(newConfig: InternalConfig): boolean {
    if (this.seriesInstances.length !== newConfig.series.length) return false;

    return this.seriesInstances.every((series, index) =>
      series.config._internalType === newConfig.series[index]?._internalType
    );
  }

  private syncSeriesInstances(newConfig: InternalConfig): void {
    for (let i = 0; i < this.seriesInstances.length; i++) {
      const series = this.seriesInstances[i];
      const hasExplicitVisible = 'visible' in newConfig.series[i];
      const nextConfig = {
        ...newConfig.series[i],
        visible: hasExplicitVisible ? newConfig.series[i].visible : series.visible,
      };

      this.options.series[i] = nextConfig;
      series.config = nextConfig;
      series.visible = nextConfig.visible !== false;
      series.processData();
    }
  }

  update(options: Partial<KatuChartsOptions>, redraw = true): void {
    if (!this.isResponsiveUpdate) {
      this.originalUserOptions = deepMerge(
        deepClone(this.originalUserOptions),
        options as any,
      );
    }
    const parser = new OptionsParser();
    const external = this.optionsToExternal();
    const merged = deepMerge(external, options) as KatuChartsOptions;
    if (Array.isArray(options.series) && Array.isArray(merged.series) && Array.isArray(external.series)) {
      for (let i = 0; i < options.series.length && i < external.series.length; i++) {
        merged.series[i] = deepMerge(external.series[i], options.series[i]);
      }
    }
    if (options.chart?.type && Array.isArray(merged.series)) {
      merged.series.forEach((s, i) => {
        const updatedType = Array.isArray(options.series) ? (options.series[i] as { type?: string })?.type : undefined;
        if ((this.options.series[i] as { _typeFromChart?: boolean })?._typeFromChart && !updatedType) {
          delete (s as { type?: string }).type;
        }
      });
    }
    const newConfig = parser.parse(merged);
    const canReuseSeries = this.canReuseSeriesInstances(newConfig);
    this.state.updateConfig(newConfig);
    this.options = this.state.getConfig();

    if (canReuseSeries) {
      this.buildAxes();
      this.syncSeriesInstances(newConfig);
    }

    if (redraw) {
      if (!canReuseSeries) {
        this.redraw();
      } else {
        try {
          this.animatedRedraw(300);
        } catch {
          this.redraw();
        }
      }
    }
  }

  animatedRedraw(duration = 500): void {
    this.updateAxesDomains();
    this.updateTooltipCategories();

    for (const axis of this.xAxes) {
      axis.animateAxis(this.axisGroup as any, this.layout.plotArea, duration);
    }
    for (const axis of this.yAxes) {
      axis.animateAxis(this.axisGroup as any, this.layout.plotArea, duration);
    }

    const typeCount = new Map<string, number>();
    const typeIndex = new Map<string, number>();
    const stackCount = new Map<string, number>();
    const stackIdx = new Map<string, number>();
    const stackAccumPos = new Map<string, Map<number | string, number>>();
    const stackAccumNeg = new Map<string, Map<number | string, number>>();
    const buildSK = stackKey;
    const stackTotalsPos2 = new Map<string, Map<number | string, number>>();
    const stackTotalsNeg2 = new Map<string, Map<number | string, number>>();
    for (const s of this.seriesInstances) {
      if (!s.visible) continue;
      const t = s.config._internalType;
      typeCount.set(t, (typeCount.get(t) || 0) + 1);
      if (s.config.stacking) {
        const sk = buildSK(s.config);
        stackCount.set(sk, (stackCount.get(sk) || 0) + 1);
        if (!stackAccumPos.has(sk)) { stackAccumPos.set(sk, new Map()); stackAccumNeg.set(sk, new Map()); }
        if (!stackTotalsPos2.has(sk)) { stackTotalsPos2.set(sk, new Map()); stackTotalsNeg2.set(sk, new Map()); }
        accumulateSignedStackTotals(s.data, stackTotalsPos2.get(sk)!, stackTotalsNeg2.get(sk)!);
      }
    }
    const stackTotalsAbs2 = this.buildAbsStackTotals(stackTotalsPos2, stackTotalsNeg2);

    for (let i = 0; i < this.seriesInstances.length; i++) {
      const series = this.seriesInstances[i];
      if (!series.visible) continue;

      const cfg = this.options.series[i];
      const t = cfg._internalType;
      const idxInType = typeIndex.get(t) || 0;
      typeIndex.set(t, idxInType + 1);

      let totalOfType: number;
      let idxOfType: number;
      let stackOffsetsPos: Map<number | string, number> | undefined;
      let stackOffsetsNeg: Map<number | string, number> | undefined;
      let stackTotals: Map<number | string, number> | undefined;
      if (cfg.stacking) {
        const sk = buildSK(cfg);
        totalOfType = stackCount.get(sk) || 1;
        idxOfType = stackIdx.get(sk) || 0;
        stackIdx.set(sk, idxOfType + 1);
        stackOffsetsPos = new Map(stackAccumPos.get(sk)!);
        stackOffsetsNeg = new Map(stackAccumNeg.get(sk)!);
        stackTotals = stackTotalsAbs2.get(sk);
      } else {
        totalOfType = typeCount.get(t) || 1;
        idxOfType = idxInType;
      }

      series.updateContext({
        xAxis: this.xAxes[cfg._xAxisIndex] || this.xAxes[0],
        yAxis: this.yAxes[cfg._yAxisIndex] || this.yAxes[0],
        totalSeriesOfType: totalOfType,
        indexInType: idxOfType,
        stackOffsets: stackOffsetsPos,
        stackOffsetsPos,
        stackOffsetsNeg,
        stackTotals,
      });

      series.animateUpdate(duration);

      if (cfg.stacking) {
        accumulateSignedStackTotals(series.data, stackAccumPos.get(buildSK(cfg))!, stackAccumNeg.get(buildSK(cfg))!);
      }
    }

    this.declutterColumnDataLabels();
    this.renderStackLabels();
    this.renderTitles();
    this.renderLegend();
    this.fireEvent('render');
  }

  redraw(): void {
    this.computeLayout();

    this.plotGroup.attr('transform', `translate(${this.layout.plotArea.x},${this.layout.plotArea.y})`);
    this.renderer.updateClipPath(
      this.clipPathId,
      -this.clipMargin, -this.clipMargin,
      this.layout.plotArea.width + 2 * this.clipMargin,
      this.layout.plotArea.height + 2 * this.clipMargin
    );

    this.buildAxes();
    this.seriesInstances.forEach(s => s.destroy());
    this.seriesInstances = [];
    this.buildSeries();
    this.renderAll();

    if (this.tooltip) this.tooltip.updatePlotArea(this.layout.plotArea);
    this.renderTitles();
    this.fireEvent('redraw');
  }

  reflow(): void {
    if (this.options.chart.width) return;

    const dims = getElementDimensions(this.container, this.getDefaultHeightAspectRatio());
    let newWidth = dims.width;
    let newHeight = this.resolveHeight(this.options.chart.height, dims.height);

    const scrollable = (this.options.chart as any).scrollablePlotArea as { minWidth?: number; minHeight?: number } | undefined;
    if (scrollable?.minWidth && scrollable.minWidth > newWidth) newWidth = scrollable.minWidth;
    if (scrollable?.minHeight && scrollable.minHeight > newHeight) newHeight = scrollable.minHeight;

    if (this.autoHeight && !scrollable?.minHeight) {
      const prevWidth = this.chartWidth;
      this.chartWidth = newWidth;
      newHeight = this.fitHeightToContent(newHeight);
      this.chartWidth = prevWidth;
    }

    if (newWidth === this.chartWidth && newHeight === this.chartHeight) return;

    if (this.responsiveEngine) {
      const result = this.responsiveEngine.evaluate(newWidth, newHeight);
      if (result.changed) {
        const rules = this.responsiveEngine.getRules();
        let effective = deepClone(this.originalUserOptions) as any;
        for (const idx of result.matchingIndices) {
          effective = this.mergeResponsiveChartOptions(effective, rules[idx].chartOptions as any);
        }
        this.isResponsiveUpdate = true;
        this.update(effective, false);
        this.isResponsiveUpdate = false;
      }
    }

    this.setSize(newWidth, newHeight);
  }

  setSize(width: number, height: number): void {
    this.chartWidth = width;
    this.chartHeight = height;
    this.renderer.setSize(width, height);

    this.renderer.svg.select('.katucharts-background')
      .attr('width', width).attr('height', height);
    this.renderer.svg.select('.katucharts-border')
      .attr('width', width).attr('height', height);

    this.exportButton?.updatePosition(width, height);
    this.credits?.updatePosition(width, height);
    this.redraw();
  }

  /** The current visible outer size — the scrollable viewport for scrollable charts, else the chart. */
  getViewportSize(): { width: number; height: number } {
    return this.scrollableInner
      ? { width: this.scrollableOuterWidth, height: this.scrollableOuterHeight }
      : { width: this.chartWidth, height: this.chartHeight };
  }

  /**
   * Resize the chart to a new outer viewport (used for fullscreen). For scrollable charts this also
   * grows the scrollable viewport box so the chart fills the screen instead of staying clipped to its
   * original box; the content fills the viewport and only scrolls if the configured minimums still
   * exceed it. The pinned axis/legend overlay is rebuilt at the new size so its axes/legend track the
   * viewport; the export button is preserved across that rebuild (see createFixedAxisOverlay).
   */
  fitToViewport(viewportWidth: number, viewportHeight: number): void {
    if (!this.scrollableInner) {
      this.setSize(viewportWidth, viewportHeight);
      return;
    }
    const sp = (this.options.chart as any).scrollablePlotArea as { minWidth?: number; minHeight?: number } | undefined;
    this.scrollableOuterWidth = viewportWidth;
    this.scrollableOuterHeight = viewportHeight;
    this.scrollableInner.style.width = viewportWidth + 'px';
    this.scrollableInner.style.height = viewportHeight + 'px';
    const contentWidth = Math.max(sp?.minWidth || 0, viewportWidth);
    const contentHeight = Math.max(sp?.minHeight || 0, viewportHeight);
    this.setSize(contentWidth, contentHeight);
    this.createFixedAxisOverlay();
  }

  setTitle(titleOptions: { text?: string } | null, subtitleOptions?: { text?: string } | null): void {
    if (titleOptions) {
      this.options.title = deepMerge(this.options.title, titleOptions);
      this.originalUserOptions.title = deepMerge(this.originalUserOptions.title || {} as any, titleOptions);
    }
    if (subtitleOptions) {
      this.options.subtitle = deepMerge(this.options.subtitle, subtitleOptions);
      this.originalUserOptions.subtitle = deepMerge(this.originalUserOptions.subtitle || {} as any, subtitleOptions);
    }
    this.renderTitles();
  }

  addAxis(options: AxisOptions, isX = true, redraw = true): AxisInstance {
    const axes = isX ? this.options.xAxis : this.options.yAxis;
    const newAxis = { ...options, index: axes.length, isX } as any;
    axes.push(newAxis);

    const instance = createAxis(newAxis, this.layout.plotArea);
    (isX ? this.xAxes : this.yAxes).push(instance);

    if (redraw) this.redraw();
    return instance;
  }

  showLoading(text?: string): void {
    let overlay = this.container.querySelector('.katucharts-loading') as HTMLDivElement;
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'katucharts-loading';
      Object.assign(overlay.style, {
        position: 'absolute', top: '0', left: '0', width: '100%', height: '100%',
        backgroundColor: 'rgba(255,255,255,0.75)', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        fontSize: '14px', fontWeight: 'bold', color: '#666', zIndex: '20',
      });
      this.container.appendChild(overlay);
    }
    overlay.textContent = text || 'Loading...';
    overlay.style.display = 'flex';
  }

  hideLoading(): void {
    const overlay = this.container.querySelector('.katucharts-loading') as HTMLDivElement;
    if (overlay) overlay.style.display = 'none';
  }

  destroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    this.seriesInstances.forEach(s => s.destroy());
    this.tooltip?.destroy();
    this.legend?.destroy();
    this.crosshair?.destroy();
    this.credits?.destroy();
    this.exportButton?.destroy();
    this.interactions.destroy();
    this.stock?.destroy();
    this.responsiveEngine?.reset();
    this.events.removeAllListeners();
    this.renderer.destroy();

    const loading = this.container.querySelector('.katucharts-loading');
    if (loading) loading.remove();
    const tooltipEl = this.container.querySelector('.katucharts-tooltip');
    if (tooltipEl) tooltipEl.remove();
    this.container.querySelectorAll('.katucharts-title-html, .katucharts-subtitle-html').forEach(el => el.remove());
  }

  getSVG(): string {
    return this.exporter.getSVG();
  }

  getSeriesInstances(): BaseSeries[] {
    return this.seriesInstances;
  }

  get series(): BaseSeries[] {
    return this.seriesInstances;
  }

  getXAxes(): AxisInstance[] {
    return this.xAxes;
  }

  getYAxes(): AxisInstance[] {
    return this.yAxes;
  }

  private handleExportAction(type: string): void {
    this.exporter.handleExportAction(type);
  }

  getCSV(): string {
    return this.exporter.getCSV();
  }

  getTable(): string {
    return this.exporter.getTable();
  }

  getDataRows(): (string | number | null)[][] {
    return this.exporter.getDataRows();
  }

  exportChart(exportingOptions?: Partial<ExportingOptions>, _chartOptions?: Partial<KatuChartsOptions>): void {
    this.exporter.exportChart(exportingOptions);
  }

  print(): void {
    this.exporter.print();
  }

  private optionsToExternal(): KatuChartsOptions {
    return this.exporter.optionsToExternal();
  }
}

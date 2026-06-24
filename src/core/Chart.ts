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
import { debounce } from '../utils/throttle';
import { deepMerge, deepClone } from '../utils/deepMerge';
import { templateFormat, stripHtmlTags, numberFormat, setUseUTC } from '../utils/format';
import {
  NON_CARTESIAN_TYPES,
  SELF_RENDERED_DATALABEL_TYPES,
  NO_CLIP_TYPES,
  EXPAND_TYPES,
  isNonCartesianChart,
} from './chartTypes';
import { stackKey, accumulateStackTotals } from './StackComputer';
import { renderTitles as renderChartTitles } from '../components/TitleRenderer';
import { createFixedAxisOverlay as buildFixedAxisOverlay } from './ScrollablePlotOverlay';
import { ChartExporter } from '../export/ChartExporter';
import { AxisCoordinator } from '../axis/AxisCoordinator';
import { InteractionController } from './InteractionController';
import { StockController } from '../stock/StockController';

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
    const minPlot = Math.max(
      Chart.MIN_AUTO_PLOT_HEIGHT,
      this.verticalCategoryCount() * Chart.MIN_CATEGORY_ROW_HEIGHT,
    );
    const required = Math.ceil(overhead + minPlot);
    if (required <= baseHeight) return baseHeight;
    return Math.min(required, Math.max(baseHeight, Chart.MAX_AUTO_HEIGHT));
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

    this.clipPathId = this.renderer.createClipPath(
      0, 0,
      this.layout.plotArea.width,
      this.layout.plotArea.height
    );

    this.axisGroup = this.renderer.createGroup('katucharts-axis-group', this.plotGroup as any);
    this.seriesGroup = this.renderer.createGroup('katucharts-series-group', this.plotGroup as any);
    this.stackLabelsGroup = this.renderer.createGroup('katucharts-stack-labels-group', this.plotGroup as any);

    const clipDisabled = this.options.series.some(s => s.clip === false || NO_CLIP_TYPES.has(s._internalType));
    const needsExpand = this.options.series.some(s => EXPAND_TYPES.has(s._internalType));

    if (!isNonCartesianChart(this.options.series) && !clipDisabled) {
      if (needsExpand) {
        const margin = 12;
        this.clipPathId = this.renderer.createClipPath(
          -margin, -margin,
          this.layout.plotArea.width + 2 * margin,
          this.layout.plotArea.height + 2 * margin
        );
      }
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

    const xCrosshair = this.options.xAxis[0]?.crosshair;
    const yCrosshair = this.options.yAxis[0]?.crosshair;
    if (xCrosshair || yCrosshair) {
      this.crosshair = new Crosshair(xCrosshair, yCrosshair, this.plotGroup as any, this.layout.plotArea, this.events);
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
    this.xAxes = this.options.xAxis.map(cfg => createAxis(cfg, this.layout.plotArea));
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
    const stackTotalsMap = new Map<string, Map<number | string, number>>();
    const precomputedOffsets = new Map<number, Map<number | string, number>>();
    for (let i = 0; i < this.options.series.length; i++) {
      const cfg = this.options.series[i];
      if (cfg.stacking) {
        const sk = buildStackKey(cfg);
        stackSeriesCount.set(sk, (stackSeriesCount.get(sk) || 0) + 1);
        if (!stackTotalsMap.has(sk)) stackTotalsMap.set(sk, new Map());
        const totals = stackTotalsMap.get(sk)!;
        const s = this.seriesInstances[i];
        s.processData();
        accumulateStackTotals(s.data, totals);
      }
    }

    const forwardStackAccum = new Map<string, Map<number | string, number>>();
    for (let i = 0; i < this.options.series.length; i++) {
      const cfg = this.options.series[i];
      if (!cfg.stacking) continue;
      const sk = buildStackKey(cfg);
      if (!forwardStackAccum.has(sk)) forwardStackAccum.set(sk, new Map());
      const accum = forwardStackAccum.get(sk)!;
      precomputedOffsets.set(i, new Map(accum));
      accumulateStackTotals(this.seriesInstances[i].data, accum);
    }

    for (let i = 0; i < this.seriesInstances.length; i++) {
      const series = this.seriesInstances[i];
      const cfg = this.options.series[i];
      const xAxis = this.xAxes[cfg._xAxisIndex] || this.xAxes[0];
      const yAxis = this.yAxes[cfg._yAxisIndex] || this.yAxes[0];

      const t = cfg._internalType;
      const idxInType = typeIndex.get(t) || 0;
      typeIndex.set(t, idxInType + 1);

      let stackOffsets: Map<number | string, number> | undefined;
      if (cfg.stacking) {
        stackOffsets = precomputedOffsets.get(i) || new Map();
      }

      const context: SeriesContext = {
        plotArea: this.layout.plotArea,
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
        stackOffsets,
        stackTotals: cfg.stacking ? stackTotalsMap.get(buildStackKey(cfg)) : undefined,
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
        effective = deepMerge(effective, rules[idx].chartOptions as any);
      }
      const parser = new OptionsParser();
      this.options = parser.parse(effective);
      this.state.updateConfig(this.options);
    }
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
      const nextConfig = {
        ...newConfig.series[i],
        visible: series.visible,
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
    const merged = deepMerge(this.optionsToExternal(), options) as KatuChartsOptions;
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

    if (redraw) {
      if (!canReuseSeries) {
        this.redraw();
      } else {
        this.buildAxes();
        this.syncSeriesInstances(newConfig);
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
    const stackAccum = new Map<string, Map<number | string, number>>();
    const buildSK = stackKey;
    const stackTotalsMap2 = new Map<string, Map<number | string, number>>();
    for (const s of this.seriesInstances) {
      if (!s.visible) continue;
      const t = s.config._internalType;
      typeCount.set(t, (typeCount.get(t) || 0) + 1);
      if (s.config.stacking) {
        const sk = buildSK(s.config);
        stackCount.set(sk, (stackCount.get(sk) || 0) + 1);
        if (!stackAccum.has(sk)) stackAccum.set(sk, new Map());
        if (!stackTotalsMap2.has(sk)) stackTotalsMap2.set(sk, new Map());
        accumulateStackTotals(s.data, stackTotalsMap2.get(sk)!);
      }
    }

    for (let i = 0; i < this.seriesInstances.length; i++) {
      const series = this.seriesInstances[i];
      if (!series.visible) continue;

      const cfg = this.options.series[i];
      const t = cfg._internalType;
      const idxInType = typeIndex.get(t) || 0;
      typeIndex.set(t, idxInType + 1);

      let totalOfType: number;
      let idxOfType: number;
      let stackOffsets: Map<number | string, number> | undefined;
      let stackTotals: Map<number | string, number> | undefined;
      if (cfg.stacking) {
        const sk = buildSK(cfg);
        totalOfType = stackCount.get(sk) || 1;
        idxOfType = stackIdx.get(sk) || 0;
        stackIdx.set(sk, idxOfType + 1);
        stackOffsets = new Map(stackAccum.get(sk)!);
        stackTotals = stackTotalsMap2.get(sk);
      } else {
        totalOfType = typeCount.get(t) || 1;
        idxOfType = idxInType;
      }

      series.updateContext({
        xAxis: this.xAxes[cfg._xAxisIndex] || this.xAxes[0],
        yAxis: this.yAxes[cfg._yAxisIndex] || this.yAxes[0],
        totalSeriesOfType: totalOfType,
        indexInType: idxOfType,
        stackOffsets,
        stackTotals,
      });

      series.animateUpdate(duration);

      if (cfg.stacking) {
        accumulateStackTotals(series.data, stackAccum.get(buildSK(cfg))!);
      }
    }

    this.renderStackLabels();
    this.renderTitles();
    this.renderLegend();
    this.fireEvent('render');
  }

  redraw(): void {
    this.computeLayout();

    this.plotGroup.attr('transform', `translate(${this.layout.plotArea.x},${this.layout.plotArea.y})`);
    this.renderer.updateClipPath(this.clipPathId, 0, 0, this.layout.plotArea.width, this.layout.plotArea.height);

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
          effective = deepMerge(effective, rules[idx].chartOptions as any);
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

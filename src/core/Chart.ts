/**
 * Central chart orchestrator — owns container, SVG, and all subsystems.
 */

import type {
  KatuChartsOptions, InternalConfig, SeriesOptions, AxisOptions,
  InternalSeriesConfig, PlotArea, SeriesType,
} from '../types/options';
import { OptionsParser } from './OptionsParser';
import { SVGRenderer } from './SVGRenderer';
import { EventBus } from './EventBus';
import { StateManager } from './StateManager';
import { SeriesRegistry } from './Registry';
import { LayoutEngine, type LayoutResult } from '../layout/LayoutEngine';
import { createAxis, type AxisInstance } from '../axis/Axis';
import { BaseSeries, type SeriesContext } from '../series/BaseSeries';
import { DataLabels } from '../components/DataLabels';
import { Tooltip } from '../components/Tooltip';
import { Legend } from '../components/Legend';
import { Crosshair } from '../components/Crosshair';
import { Credits } from '../components/Credits';
import { ExportButton } from '../components/ExportButton';
import { ExportModule } from '../export/Export';
import { Drilldown } from '../interaction/Drilldown';
import { Zoom, type ZoomConfig, type ZoomType } from '../interaction/Zoom';
import { ResponsiveEngine } from '../responsive/ResponsiveEngine';
import { A11yModule } from '../accessibility/A11yModule';
import { select } from 'd3-selection';
import 'd3-transition';
import type { ExportingOptions } from '../types/options';
import { resolveContainer, getElementDimensions } from '../utils/dom';
import { debounce } from '../utils/throttle';
import { deepMerge, deepClone } from '../utils/deepMerge';

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
  private drilldown: Drilldown | null = null;
  private zoom: Zoom | null = null;
  private responsiveEngine: ResponsiveEngine | null = null;
  private a11yModule: A11yModule | null = null;
  private clipPathId: string = '';
  private chartWidth: number;
  private chartHeight: number;
  private resizeObserver: ResizeObserver | null = null;
  private titleGroup!: ReturnType<SVGRenderer['createGroup']>;
  private originalUserOptions!: KatuChartsOptions;
  private isResponsiveUpdate = false;

  constructor(containerOrId: string | HTMLElement, options: KatuChartsOptions) {
    this.container = resolveContainer(containerOrId);
    this.container.style.position = 'relative';

    const parser = new OptionsParser();
    this.options = parser.parse(options);
    this.originalUserOptions = deepClone(options);

    this.events = new EventBus();
    this.state = new StateManager(this.options, this.events);
    this.layoutEngine = new LayoutEngine();

    const dims = getElementDimensions(this.container);
    this.chartWidth = (this.options.chart.width as number) || dims.width || 600;
    this.chartHeight = this.resolveHeight(this.options.chart.height, dims.height);

    this.setupResponsive();
    this.applyInitialResponsiveRules();

    this.renderer = new SVGRenderer(this.container, this.chartWidth, this.chartHeight);
    this.applyChartStyles();

    this.computeLayout();
    this.createStructuralGroups();
    this.buildAxes();
    this.buildSeries();
    this.renderAll();

    if (this.options.chart.reflow) {
      this.setupReflow();
    }

    this.setupSeriesDimming();
    this.setupDrilldown();
    this.setupZoom();
    this.setupAccessibility();
    this.fireEvent('load');
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

    const hasOverflowSeries = this.options.series.some(
      s => s._internalType === 'bubble' || s._internalType === 'scatter' || s.clip === false
    );
    const clipPad = hasOverflowSeries ? 40 : 0;
    this.clipPathId = this.renderer.createClipPath(
      -clipPad, -clipPad,
      this.layout.plotArea.width + clipPad * 2,
      this.layout.plotArea.height + clipPad * 2
    );

    this.axisGroup = this.renderer.createGroup('katucharts-axis-group', this.plotGroup as any);
    this.seriesGroup = this.renderer.createGroup('katucharts-series-group', this.plotGroup as any);
    if (!this.isNonCartesian()) {
      this.seriesGroup.attr('clip-path', `url(#${this.clipPathId})`);
    }

    this.tooltip = new Tooltip(this.options.tooltip, this.container, this.layout.plotArea, this.events);
    this.legend = new Legend(this.options.legend, this.renderer.svg, this.events);
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
    this.titleGroup.selectAll('*').remove();

    if (this.options.title?.text) {
      const titleOpts = this.options.title;
      const x = this.getTitleX(titleOpts.align);
      const fontSize = titleOpts.style?.fontSize as string || '18px';
      const maxWidth = this.chartWidth + (titleOpts.widthAdjust ?? -44);

      const titleEl = this.titleGroup.append('text')
        .attr('class', 'katucharts-chart-title')
        .attr('x', x)
        .attr('y', this.layout.titleArea.y + 20)
        .attr('text-anchor', this.getTextAnchor(titleOpts.align))
        .attr('fill', titleOpts.style?.color as string || '#333333')
        .attr('font-size', fontSize)
        .attr('font-weight', titleOpts.style?.fontWeight as string || 'bold')
        .text(titleOpts.text!);

      this.wrapSvgText(titleEl, maxWidth, x, parseFloat(fontSize));
    }

    if (this.options.subtitle?.text) {
      const subOpts = this.options.subtitle;
      const x = this.getTitleX(subOpts.align);
      const fontSize = subOpts.style?.fontSize as string || '12px';
      const maxWidth = this.chartWidth + (subOpts.widthAdjust ?? -44);

      const subEl = this.titleGroup.append('text')
        .attr('class', 'katucharts-chart-subtitle')
        .attr('x', x)
        .attr('y', this.layout.subtitleArea.y + 15)
        .attr('text-anchor', this.getTextAnchor(subOpts.align))
        .attr('fill', subOpts.style?.color as string || '#666666')
        .attr('font-size', fontSize)
        .text(subOpts.text!);

      this.wrapSvgText(subEl, maxWidth, x, parseFloat(fontSize));
    }
  }

  private wrapSvgText(textEl: any, maxWidth: number, x: number, fontSize: number): void {
    const node = textEl.node() as SVGTextElement;
    if (!node || maxWidth <= 0) return;

    try {
      const textLength = node.getComputedTextLength();
      if (textLength <= maxWidth) return;
    } catch {
      return;
    }

    const fullText = textEl.text();
    const words = fullText.split(/\s+/);
    if (words.length <= 1) return;

    const lineHeight = fontSize * 1.3;
    textEl.text(null);

    let line: string[] = [];
    let lineNumber = 0;
    let tspan = textEl.append('tspan')
      .attr('x', x)
      .attr('dy', 0);

    for (const word of words) {
      line.push(word);
      tspan.text(line.join(' '));
      try {
        if (tspan.node().getComputedTextLength() > maxWidth && line.length > 1) {
          line.pop();
          tspan.text(line.join(' '));
          line = [word];
          lineNumber++;
          tspan = textEl.append('tspan')
            .attr('x', x)
            .attr('dy', lineHeight)
            .text(word);
        }
      } catch {
        break;
      }
    }
  }

  private getTitleX(align?: string): number {
    if (align === 'left') return this.layout.titleArea.x;
    if (align === 'right') return this.layout.titleArea.x + this.layout.titleArea.width;
    return this.chartWidth / 2;
  }

  private getTextAnchor(align?: string): string {
    if (align === 'left') return 'start';
    if (align === 'right') return 'end';
    return 'middle';
  }

  private buildAxes(): void {
    this.xAxes = this.options.xAxis.map(cfg => createAxis(cfg, this.layout.plotArea));
    this.yAxes = this.options.yAxis.map(cfg => createAxis(cfg, this.layout.plotArea));
  }

  private buildSeries(): void {
    const config = this.options;

    this.seriesInstances = config.series.map((seriesCfg, i) => {
      const type = seriesCfg._internalType;
      const Ctor = SeriesRegistry.getType(type);

      if (!Ctor) {
        console.warn(`KatuCharts: unknown series type "${type}", falling back to line`);
        const FallbackCtor = SeriesRegistry.getType('line');
        if (!FallbackCtor) throw new Error('KatuCharts: line series type not registered');
        return new FallbackCtor(seriesCfg);
      }

      return new Ctor(seriesCfg) as BaseSeries;
    });
  }

  private renderAll(): void {
    this.updateAxesDomains();
    this.updateTooltipCategories();
    this.renderAxes();
    this.renderSeriesInstances();
    this.renderLegend();
    this.fireEvent('render');
  }

  private updateTooltipCategories(): void {
    if (!this.tooltip) return;
    const xAxis = this.xAxes[0];
    if (xAxis && (xAxis.config.type === 'category' || xAxis.config.categories)) {
      this.tooltip.setCategories(xAxis.config.categories || []);
    }
  }

  private updateAxesDomains(): void {
    const noAxesTypes = new Set([
      'pie', 'donut', 'sunburst', 'treemap', 'sankey', 'dependencywheel',
      'networkgraph', 'gauge', 'solidgauge', 'polar', 'radar', 'funnel',
      'pyramid', 'timeline', 'map', 'heatmap', 'barchartrace', 'venn',
      'clusteredheatmap', 'phylotree', 'circos',
    ]);

    for (let ai = 0; ai < this.xAxes.length; ai++) {
      const axis = this.xAxes[ai];

      if (axis.config.type === 'category' || axis.config.categories) {
        const relatedSeries = this.seriesInstances.filter(
          (s, si) => s.visible && this.options.series[si]._xAxisIndex === ai && !noAxesTypes.has(s.config._internalType)
        );
        const cats = axis.config.categories
          || (relatedSeries.length > 0 ? relatedSeries[0].getCategories() : undefined);
        if (cats) axis.updateDomain(cats);
        continue;
      }

      const relatedSeries = this.seriesInstances.filter(
        (s, si) => s.visible && this.options.series[si]._xAxisIndex === ai && !noAxesTypes.has(s.config._internalType)
      );

      if (relatedSeries.length === 0) continue;

      let xMin = Infinity, xMax = -Infinity;
      for (const s of relatedSeries) {
        const ext = s.getDataExtents();
        xMin = Math.min(xMin, ext.xMin);
        xMax = Math.max(xMax, ext.xMax);
      }
      if (isFinite(xMin) && isFinite(xMax)) {
        axis.updateDomain({ min: xMin, max: xMax });
      }
    }

    for (let ai = 0; ai < this.yAxes.length; ai++) {
      const axis = this.yAxes[ai];
      const relatedConfigs = this.options.series.filter(
        (cfg, si) => this.seriesInstances[si]?.visible && cfg._yAxisIndex === ai && !noAxesTypes.has(cfg._internalType)
      );
      const relatedSeries = this.seriesInstances.filter(
        (s, si) => s.visible && this.options.series[si]._yAxisIndex === ai && !noAxesTypes.has(s.config._internalType)
      );

      if (relatedSeries.length === 0) continue;

      let yMin = Infinity, yMax = -Infinity;

      const stackGroups = new Map<string, Map<number | string, number>>();
      for (let si = 0; si < relatedSeries.length; si++) {
        const s = relatedSeries[si];
        const cfg = relatedConfigs[si];
        if (cfg?.stacking) {
          const stackKey = `${cfg._internalType}__${cfg.stack ?? '_default'}`;
          if (!stackGroups.has(stackKey)) stackGroups.set(stackKey, new Map());
          const accum = stackGroups.get(stackKey)!;
          for (const d of s.data) {
            const xKey = d.x ?? 0;
            accum.set(xKey, (accum.get(xKey) || 0) + (d.y ?? 0));
          }
        } else {
          const ext = s.getDataExtents();
          yMin = Math.min(yMin, ext.yMin);
          yMax = Math.max(yMax, ext.yMax);
        }
      }

      for (const accum of stackGroups.values()) {
        for (const total of accum.values()) {
          yMin = Math.min(yMin, 0);
          yMax = Math.max(yMax, total);
        }
      }

      const zeroBaseTypes = new Set(['column', 'bar', 'area', 'areaspline', 'waterfall']);
      const hasZeroBaseSeries = relatedConfigs.some(cfg => zeroBaseTypes.has(cfg._internalType));
      if (hasZeroBaseSeries && axis.config.min === undefined) {
        yMin = Math.min(yMin, 0);
        yMax = Math.max(yMax, 0);
      }

      if (isFinite(yMin) && isFinite(yMax)) {
        axis.updateDomain({ min: yMin, max: yMax });
      }
    }
  }

  private isNonCartesian(): boolean {
    const noAxesTypes = new Set([
      'pie', 'donut', 'sunburst', 'treemap', 'sankey', 'dependencywheel',
      'networkgraph', 'gauge', 'solidgauge', 'polar', 'radar', 'funnel',
      'pyramid', 'timeline', 'map', 'heatmap', 'barchartrace', 'venn',
      'clusteredheatmap', 'phylotree', 'circos',
      'circosChord', 'circosHeatmap', 'circosComparative', 'circosSpiral',
    ]);
    return this.options.series.length > 0 &&
      this.options.series.every(s => noAxesTypes.has(s._internalType));
  }

  private renderAxes(): void {
    this.axisGroup.selectAll('*').remove();

    if (this.isNonCartesian()) return;

    for (const axis of this.xAxes) {
      if (axis.config.showEmpty === false && !this.hasSeriesForAxis(axis, true)) continue;
      axis.render(this.axisGroup as any, this.layout.plotArea);
    }
    for (const axis of this.yAxes) {
      if (axis.config.showEmpty === false && !this.hasSeriesForAxis(axis, false)) continue;
      axis.render(this.axisGroup as any, this.layout.plotArea);
    }

    this.setupAxisLabelHover();
  }

  private setupAxisLabelHover(): void {
    const xAxis = this.xAxes[0];
    if (!xAxis) return;

    const xAxisGroup = this.axisGroup.select('.katucharts-axis-x');
    if (xAxisGroup.empty()) return;

    const tickGroups = xAxisGroup.selectAll<SVGGElement, any>('.tick');
    const self = this;

    tickGroups.each(function () {
      const g = select(this as SVGGElement);
      const text = g.select('text');
      if (text.empty()) return;
      const bbox = (text.node() as SVGTextElement).getBBox();
      g.insert('rect', 'text')
        .attr('x', bbox.x - 4)
        .attr('y', bbox.y - 2)
        .attr('width', bbox.width + 8)
        .attr('height', bbox.height + 4)
        .attr('fill', 'transparent')
        .attr('class', 'katucharts-tick-hitarea');
    });

    tickGroups
      .style('cursor', 'pointer')
      .on('mouseover', function (_event: MouseEvent) {
        const tickValue = (this as any).__data__;
        const catIndex = typeof tickValue === 'string'
          ? (xAxis.config.categories?.indexOf(tickValue) ?? -1)
          : typeof tickValue === 'number' ? tickValue : -1;

        if (catIndex < 0) return;

        const plotX = xAxis.getPixelForValue(tickValue);
        const matchingPoints: any[] = [];

        for (const series of self.seriesInstances) {
          if (!series.visible) continue;
          const point = series.data.find((d: any) => (d.x ?? 0) === catIndex);
          if (point && point.y !== null && point.y !== undefined) {
            const yAxis = self.yAxes[0];
            matchingPoints.push({
              point,
              series,
              plotX,
              plotY: yAxis.getPixelForValue(point.y ?? 0),
            });
          }
        }

        if (matchingPoints.length > 0) {
          const first = matchingPoints[0];
          self.events.emit('point:mouseover', {
            point: { ...first.point, matchingPoints },
            index: catIndex,
            series: first.series,
            event: _event,
            plotX,
            plotY: first.plotY,
          });
        }

        for (const series of self.seriesInstances) {
          if (!series.visible) continue;
          const group = (series as any).group;
          if (!group) continue;

          const elements = group.selectAll('.katucharts-column, .katucharts-bar, .katucharts-marker, .katucharts-bubble, .katucharts-scatter-point');
          elements.each(function(this: SVGElement, d: any) {
            const el = select(this);
            if ((d?.x ?? -1) === catIndex) {
              el.attr('filter', 'brightness(1.15)');
            } else {
              el.transition().duration(100).attr('opacity', 0.3);
            }
          });
        }
      })
      .on('mouseout', function () {
        for (const series of self.seriesInstances) {
          if (!series.visible) continue;
          const group = (series as any).group;
          if (!group) continue;

          group.selectAll('.katucharts-column, .katucharts-bar, .katucharts-marker, .katucharts-bubble, .katucharts-scatter-point')
            .interrupt()
            .attr('opacity', null)
            .attr('filter', null);
        }

        self.events.emit('point:mouseout', { point: {}, index: -1, series: null, event: null });
      });
  }

  private hasSeriesForAxis(axis: AxisInstance, isX: boolean): boolean {
    return this.seriesInstances.some((s, i) => {
      const cfg = this.options.series[i];
      const idx = isX ? cfg._xAxisIndex : cfg._yAxisIndex;
      return s.visible && idx === axis.config.index;
    });
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

    const stackAccum = new Map<string, Map<number | string, number>>();
    const buildStackKey = (cfg: any) => {
      const stackGroup = cfg.stack ?? '_default';
      return `${cfg._internalType}__${stackGroup}`;
    };

    const stackSeriesCount = new Map<string, number>();
    const stackSeriesIndex = new Map<string, number>();
    for (const cfg of this.options.series) {
      if (cfg.stacking) {
        const sk = buildStackKey(cfg);
        stackSeriesCount.set(sk, (stackSeriesCount.get(sk) || 0) + 1);
      }
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
        const stackKey = buildStackKey(cfg);
        if (!stackAccum.has(stackKey)) {
          stackAccum.set(stackKey, new Map());
        }
        stackOffsets = new Map(stackAccum.get(stackKey)!);
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
        allSeries: this.seriesInstances,
      };

      series.processData();
      series.init(context);
      series.render();

      if (cfg.stacking) {
        const stackKey = buildStackKey(cfg);
        stackSeriesIndex.set(stackKey, (stackSeriesIndex.get(stackKey) || 0) + 1);
        const accum = stackAccum.get(stackKey)!;
        for (const d of series.data) {
          const xKey = d.x ?? 0;
          accum.set(xKey, (accum.get(xKey) || 0) + (d.y ?? 0));
        }
      }
      series.setOnVisibilityChange((dur) => this.animatedRedraw(dur));

      const nonCartesianTypes = new Set([
        'pie', 'donut', 'funnel', 'pyramid', 'sankey', 'dependencywheel',
        'networkgraph', 'treemap', 'sunburst', 'gauge', 'solidgauge',
        'timeline', 'gantt', 'map', 'heatmap', 'polar', 'radar', 'barchartrace', 'venn',
        'clusteredheatmap', 'phylotree', 'circos',
      ]);
      if (cfg.dataLabels?.enabled && !nonCartesianTypes.has(cfg._internalType)) {
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

  private setupSeriesDimming(): void {
    const inactiveOpacity = this.options.plotOptions?.series?.states?.inactive?.opacity ?? 0.2;

    const dimOtherSeries = (hoveredSeries: BaseSeries) => {
      for (const s of this.seriesInstances) {
        s['group']?.interrupt?.('seriesDim');
        if (s !== hoveredSeries && s.visible) {
          s['group']?.transition?.('seriesDim')?.duration?.(200)?.attr?.('opacity', inactiveOpacity);
        } else {
          s['group']?.attr?.('opacity', 1);
        }
      }
    };

    const restoreAllSeries = () => {
      for (const s of this.seriesInstances) {
        s['group']?.interrupt?.('seriesDim');
        s['group']?.transition?.('seriesDim')?.duration?.(200)?.attr?.('opacity', 1);
      }
    };

    this.events.on('series:mouseenter', dimOtherSeries);
    this.events.on('series:mouseleave', restoreAllSeries);
    this.events.on('legend:itemHover', dimOtherSeries);
    this.events.on('legend:itemLeave', restoreAllSeries);
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
      get plotArea() { return { ...pa }; },
      xAxis: {
        toPixels(val: number, axisIdx = 0) { return xAxes[axisIdx]?.getPixelForValue(val) ?? 0; },
      },
      yAxis: {
        toPixels(val: number, axisIdx = 0) { return yAxes[axisIdx]?.getPixelForValue(val) ?? 0; },
      },
    };
  }

  private setupDrilldown(): void {
    const cfg = this.options.drilldown;
    if (!cfg?.series?.length) return;

    this.drilldown = new Drilldown(cfg, this.events, this.container);

    const drilldownStack: InternalSeriesConfig[][] = [];
    const parser = new OptionsParser();

    const drillAnimCfg = cfg.animation;
    const drillDuration = typeof drillAnimCfg === 'object' ? (drillAnimCfg.duration ?? 400) : (drillAnimCfg !== false ? 400 : 0);

    this.events.on('drilldown:drilldown', (data: any) => {
      drilldownStack.push([...this.options.series]);

      if (drillDuration > 0) {
        this.seriesGroup.transition().duration(drillDuration / 2)
          .style('opacity', '0')
          .on('end', () => {
            this.performDrillSwap(data, parser);
            this.seriesGroup.style('opacity', '0')
              .transition().duration(drillDuration / 2)
              .style('opacity', '1');
          });
      } else {
        this.performDrillSwap(data, parser);
      }
      this.fireEvent('drilldown', data);
    });

    this.events.on('drilldown:drillup', () => {
      const prev = drilldownStack.pop();
      if (prev) {
        this.options.series = prev;
      }

      if (drillDuration > 0) {
        this.seriesGroup.transition().duration(drillDuration / 2)
          .style('opacity', '0')
          .on('end', () => {
            this.seriesInstances.forEach(s => s.destroy());
            this.seriesInstances = [];
            this.buildAxes();
            this.buildSeries();
            this.renderAll();
            this.seriesGroup.style('opacity', '0')
              .transition().duration(drillDuration / 2)
              .style('opacity', '1');
          });
      } else {
        this.seriesInstances.forEach(s => s.destroy());
        this.seriesInstances = [];
        this.buildAxes();
        this.buildSeries();
        this.renderAll();
      }
      this.fireEvent('drillup');
    });
  }

  private performDrillSwap(data: any, parser: OptionsParser): void {
    const newSeries = data.seriesOptions;
    const parsed = parser.parse({
      chart: this.options.chart,
      xAxis: this.options.xAxis,
      yAxis: this.options.yAxis,
      series: [newSeries],
    });
    this.options.series = parsed.series;
    this.seriesInstances.forEach(s => s.destroy());
    this.seriesInstances = [];
    this.buildAxes();
    this.buildSeries();
    this.renderAll();
  }

  private setupZoom(): void {
    const zoomCfg = this.options.chart.zooming || this.options.chart.zoomType;
    if (!zoomCfg) return;

    const config: ZoomConfig | ZoomType = typeof zoomCfg === 'string'
      ? zoomCfg as ZoomType
      : {
          type: (zoomCfg as any).type || 'x',
          key: (zoomCfg as any).key,
          mouseWheel: (zoomCfg as any).mouseWheel,
          resetButton: (zoomCfg as any).resetButton,
          panning: (zoomCfg as any).panning,
          panKey: (zoomCfg as any).panKey,
          pinchType: (zoomCfg as any).pinchType,
          selectionMarkerFill: this.options.chart.selectionMarkerFill,
        };

    this.zoom = new Zoom(config, this.plotGroup as any, this.layout.plotArea, this.container, this.events);

    this.events.on('zoom:changed', (data: any) => {
      const transform = data.transform;
      const type: string = data.type;
      const pa = this.layout.plotArea;

      if (type === 'x' || type === 'xy') {
        for (const xAxis of this.xAxes) {
          const origDomain = xAxis.scale.domain() as [number, number];
          const fullRange = origDomain[1] - origDomain[0];
          const newMin = origDomain[0] - (transform.x / pa.width) * (fullRange / transform.k);
          const newMax = newMin + fullRange / transform.k;
          xAxis.updateDomain({ min: newMin, max: newMax });
        }
      }
      if (type === 'y' || type === 'xy') {
        for (const yAxis of this.yAxes) {
          const origDomain = yAxis.scale.domain() as [number, number];
          const fullRange = origDomain[1] - origDomain[0];
          const newMax = origDomain[1] + (transform.y / pa.height) * (fullRange / transform.k);
          const newMin = newMax - fullRange / transform.k;
          yAxis.updateDomain({ min: newMin, max: newMax });
        }
      }

      this.renderAxes();
      this.renderSeriesInstances();
      this.renderLegend();
    });
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

  private setupAccessibility(): void {
    const cfg = this.options.accessibility;
    if (!cfg || cfg.enabled === false) return;

    this.a11yModule = new A11yModule(cfg);
    this.a11yModule.apply(
      this.renderer.svg,
      this.seriesInstances,
      this.options.title?.text ?? undefined
    );
  }

  // --- Public API ---

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

    const Ctor = SeriesRegistry.getType(seriesCfg._internalType) || SeriesRegistry.getType('line');
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

  update(options: Partial<KatuChartsOptions>, redraw = true): void {
    if (!this.isResponsiveUpdate) {
      this.originalUserOptions = deepMerge(
        deepClone(this.originalUserOptions),
        options as any,
      );
    }
    const parser = new OptionsParser();
    const newConfig = parser.parse(deepMerge(this.optionsToExternal(), options) as KatuChartsOptions);
    const prevSeriesCount = this.seriesInstances.length;
    const newSeriesCount = newConfig.series?.length ?? 0;
    this.state.updateConfig(newConfig);
    this.options = this.state.getConfig();

    if (redraw) {
      if (prevSeriesCount !== newSeriesCount) {
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
    const stackAccum = new Map<string, Map<number | string, number>>();
    const buildSK = (cfg: any) => `${cfg._internalType}__${cfg.stack ?? '_default'}`;
    for (const s of this.seriesInstances) {
      if (!s.visible) continue;
      const t = s.config._internalType;
      typeCount.set(t, (typeCount.get(t) || 0) + 1);
      if (s.config.stacking) {
        const sk = buildSK(s.config);
        stackCount.set(sk, (stackCount.get(sk) || 0) + 1);
        if (!stackAccum.has(sk)) stackAccum.set(sk, new Map());
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
      if (cfg.stacking) {
        const sk = buildSK(cfg);
        totalOfType = stackCount.get(sk) || 1;
        idxOfType = stackIdx.get(sk) || 0;
        stackIdx.set(sk, idxOfType + 1);
        stackOffsets = new Map(stackAccum.get(sk)!);
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
      });

      series.animateUpdate(duration);

      if (cfg.stacking) {
        const sk = buildSK(cfg);
        const accum = stackAccum.get(sk)!;
        for (const d of series.data) {
          const xKey = d.x ?? 0;
          accum.set(xKey, (accum.get(xKey) || 0) + (d.y ?? 0));
        }
      }
    }
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

    const dims = getElementDimensions(this.container);
    const newWidth = dims.width;
    const newHeight = this.resolveHeight(this.options.chart.height, dims.height);

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
    this.redraw();
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
    this.drilldown?.destroy();
    this.zoom?.destroy();
    this.responsiveEngine?.reset();
    this.events.removeAllListeners();
    this.renderer.destroy();

    const loading = this.container.querySelector('.katucharts-loading');
    if (loading) loading.remove();
    const tooltipEl = this.container.querySelector('.katucharts-tooltip');
    if (tooltipEl) tooltipEl.remove();
  }

  getSVG(): string {
    return this.renderer.getSerializedSVG();
  }

  getSeriesInstances(): BaseSeries[] {
    return this.seriesInstances;
  }

  getXAxes(): AxisInstance[] {
    return this.xAxes;
  }

  getYAxes(): AxisInstance[] {
    return this.yAxes;
  }

  private getInlinedSVG(): string {
    const node = this.renderer.getSVGNode();
    if (!node) return this.renderer.getSerializedSVG();
    return ExportModule.inlineStyles(node);
  }

  private handleExportAction(type: string): void {
    const svg = this.getInlinedSVG();
    const filename = this.options.exporting.filename ?? 'chart';
    const scale = this.options.exporting.scale ?? 2;

    switch (type) {
      case 'downloadPNG':
        ExportModule.exportPNG(svg, filename, scale).catch(e =>
          console.warn('KatuCharts: PNG export failed.', e));
        break;
      case 'downloadJPEG':
        ExportModule.exportJPEG(svg, filename, scale).catch(e =>
          console.warn('KatuCharts: JPEG export failed.', e));
        break;
      case 'downloadSVG':
        ExportModule.exportSVG(svg, filename);
        break;
      case 'downloadPDF':
        ExportModule.exportPDF(svg, filename, scale).catch(e =>
          console.warn('KatuCharts: PDF export failed.', e));
        break;
      case 'downloadCSV':
        ExportModule.exportCSV(this.getSeriesDataForExport(), filename, this.options.exporting.csv);
        break;
      case 'downloadXLS':
        this.exportXLS(filename);
        break;
      case 'viewDataTable':
        ExportModule.viewDataTable(
          this.getSeriesDataForExport(),
          this.container,
          this.options.exporting.tableCaption
        );
        break;
      case 'viewFullScreen':
        this.toggleFullScreen();
        break;
      case 'printChart':
        this.fireEvent('beforePrint');
        ExportModule.print(svg, this.options.exporting.printMaxWidth);
        this.fireEvent('afterPrint');
        break;
    }
  }

  private toggleFullScreen(): void {
    if (!this.container) return;

    const doc = this.container.ownerDocument;
    const isFullScreen = doc.fullscreenElement === this.container
      || (doc as any).webkitFullscreenElement === this.container;

    if (isFullScreen) {
      if (doc.exitFullscreen) {
        doc.exitFullscreen();
      } else if ((doc as any).webkitExitFullscreen) {
        (doc as any).webkitExitFullscreen();
      }
      return;
    }

    const style = this.container.style;
    const savedCSS = {
      width: style.width,
      height: style.height,
      maxWidth: style.maxWidth,
      maxHeight: style.maxHeight,
      background: style.background,
    };

    const bgColor = this.options.chart.backgroundColor || '#fff';
    style.background = bgColor as string;
    style.width = '100vw';
    style.height = '100vh';
    style.maxWidth = 'none';
    style.maxHeight = 'none';

    const restoreCSS = () => {
      style.width = savedCSS.width;
      style.height = savedCSS.height;
      style.maxWidth = savedCSS.maxWidth;
      style.maxHeight = savedCSS.maxHeight;
      style.background = savedCSS.background;
    };

    let closeBtn: HTMLButtonElement | null = null;

    const exitFullScreen = () => {
      if (doc.exitFullscreen) {
        doc.exitFullscreen();
      } else if ((doc as any).webkitExitFullscreen) {
        (doc as any).webkitExitFullscreen();
      }
    };

    const onFullScreenChange = () => {
      const stillFullScreen = doc.fullscreenElement === this.container
        || (doc as any).webkitFullscreenElement === this.container;

      if (stillFullScreen) {
        closeBtn = doc.createElement('button');
        closeBtn.textContent = '\u2715';
        Object.assign(closeBtn.style, {
          position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)', zIndex: '10000',
          width: '32px', height: '32px', border: 'none', borderRadius: '50%',
          background: 'rgba(0,0,0,0.4)', color: '#fff', fontSize: '18px',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          lineHeight: '1', padding: '0',
        });
        closeBtn.addEventListener('mouseenter', () => { if (closeBtn) closeBtn.style.background = 'rgba(0,0,0,0.7)'; });
        closeBtn.addEventListener('mouseleave', () => { if (closeBtn) closeBtn.style.background = 'rgba(0,0,0,0.4)'; });
        closeBtn.addEventListener('click', exitFullScreen);
        this.container.appendChild(closeBtn);

        const dims = getElementDimensions(this.container);
        this.setSize(dims.width, dims.height);
      } else {
        if (closeBtn) { closeBtn.remove(); closeBtn = null; }
        restoreCSS();
        doc.removeEventListener('fullscreenchange', onFullScreenChange);
        doc.removeEventListener('webkitfullscreenchange', onFullScreenChange);
        const dims = getElementDimensions(this.container);
        this.setSize(dims.width, dims.height);
        this.fireEvent('exitFullScreen');
      }
    };

    doc.addEventListener('fullscreenchange', onFullScreenChange);
    doc.addEventListener('webkitfullscreenchange', onFullScreenChange);

    try {
      if (this.container.requestFullscreen) {
        this.container.requestFullscreen();
      } else if ((this.container as any).webkitRequestFullscreen) {
        (this.container as any).webkitRequestFullscreen();
      }
      this.fireEvent('enterFullScreen');
    } catch {
      restoreCSS();
    }
  }

  private getSeriesDataForExport(): { name: string; data: { x?: any; y?: any; name?: string }[] }[] {
    return this.seriesInstances.map(s => ({
      name: s.config.name || `Series ${s.config.index + 1}`,
      data: s.data.map(d => ({ x: d.x, y: d.y, name: d.name })),
    }));
  }

  private exportXLS(filename: string): void {
    const rows = ExportModule.getDataRows(this.getSeriesDataForExport());
    let html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:spreadsheet" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"/></head><body><table>';
    for (const row of rows) {
      html += '<tr>';
      for (const cell of row) {
        html += `<td>${cell ?? ''}</td>`;
      }
      html += '</tr>';
    }
    html += '</table></body></html>';
    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    ExportModule.downloadBlob(blob, `${filename}.xls`);
  }

  getCSV(): string {
    return ExportModule.getCSV(this.getSeriesDataForExport(), this.options.exporting.csv);
  }

  getTable(): string {
    return ExportModule.getTable(this.getSeriesDataForExport(), this.options.exporting.tableCaption);
  }

  getDataRows(): (string | number | null)[][] {
    return ExportModule.getDataRows(this.getSeriesDataForExport());
  }

  exportChart(exportingOptions?: Partial<ExportingOptions>, _chartOptions?: Partial<KatuChartsOptions>): void {
    const merged = { ...this.options.exporting, ...exportingOptions };
    const svg = this.getInlinedSVG();
    const filename = merged.filename ?? 'chart';
    const scale = merged.scale ?? 2;

    switch (merged.type) {
      case 'image/jpeg':
        ExportModule.exportJPEG(svg, filename, scale);
        break;
      case 'image/svg+xml':
        ExportModule.exportSVG(svg, filename);
        break;
      case 'application/pdf':
        ExportModule.exportPDF(svg, filename, scale);
        break;
      case 'image/png':
      default:
        ExportModule.exportPNG(svg, filename, scale);
        break;
    }
  }

  print(): void {
    this.fireEvent('beforePrint');
    const svg = this.getInlinedSVG();
    ExportModule.print(svg, this.options.exporting.printMaxWidth);
    this.fireEvent('afterPrint');
  }

  private optionsToExternal(): KatuChartsOptions {
    return {
      chart: this.options.chart,
      title: this.options.title,
      subtitle: this.options.subtitle,
      xAxis: this.options.xAxis,
      yAxis: this.options.yAxis,
      series: this.options.series,
      tooltip: this.options.tooltip,
      legend: this.options.legend,
      plotOptions: this.options.plotOptions,
      credits: this.options.credits,
      colors: this.options.colors,
    };
  }
}

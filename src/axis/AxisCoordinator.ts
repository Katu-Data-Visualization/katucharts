/**
 * Owns the cartesian-axis coordination concern: computing axis domains from the
 * visible series (including stacking and bubble-radius padding), rendering the
 * axes into the axis group, wiring category-tick hover highlighting, and syncing
 * tooltip categories. Extracted from `Chart`; it reaches the chart's current
 * state through a narrow host interface and mutates the axis instances in place
 * (the chart still owns the `xAxes`/`yAxes` arrays).
 */

import { select } from 'd3-selection';
import 'd3-transition';
import type { SVGRenderer } from '../core/SVGRenderer';
import type { EventBus } from '../core/EventBus';
import type { Tooltip } from '../components/Tooltip';
import type { InternalConfig } from '../types/options';
import type { LayoutResult } from '../layout/LayoutEngine';
import type { BaseSeries } from '../series/BaseSeries';
import type { AxisInstance } from './Axis';
import { NO_AXES_TYPES, ZERO_BASE_TYPES, isNonCartesianChart } from '../core/chartTypes';
import { stackKey, accumulateStackTotals } from '../core/StackComputer';

type AxisGroup = ReturnType<SVGRenderer['createGroup']>;

export interface AxisHost {
  getOptions(): InternalConfig;
  getLayout(): LayoutResult;
  getSeriesInstances(): BaseSeries[];
  getXAxes(): AxisInstance[];
  getYAxes(): AxisInstance[];
  getAxisGroup(): AxisGroup;
  getEvents(): EventBus;
  getTooltip(): Tooltip | null;
}

export class AxisCoordinator {
  constructor(private host: AxisHost) {}

  updateTooltipCategories(): void {
    const tooltip = this.host.getTooltip();
    if (!tooltip) return;
    const xAxis = this.host.getXAxes()[0];
    if (xAxis && (xAxis.config.type === 'category' || xAxis.config.categories)) {
      tooltip.setCategories(xAxis.config.categories || []);
    }
    tooltip.setDatetimeAxis(!!xAxis && xAxis.config.type === 'datetime');
  }

  updateAxesDomains(): void {
    const noAxesTypes = NO_AXES_TYPES;
    const options = this.host.getOptions();
    const layout = this.host.getLayout();
    const seriesInstances = this.host.getSeriesInstances();
    const xAxes = this.host.getXAxes();
    const yAxes = this.host.getYAxes();

    for (let ai = 0; ai < xAxes.length; ai++) {
      const axis = xAxes[ai];

      if (axis.config.type === 'category' || (axis.config.categories && axis.config.categories.length > 0)) {
        const relatedSeries = seriesInstances.filter(
          (s, si) => s.visible && options.series[si]._xAxisIndex === ai && !noAxesTypes.has(s.config._internalType)
        );
        const cats = (axis.config.categories && axis.config.categories.length > 0 ? axis.config.categories : null)
          || (relatedSeries.length > 0 ? relatedSeries[0].getCategories() : undefined);
        if (cats && cats.length > 0) axis.updateDomain(cats);
        continue;
      }

      const relatedSeries = seriesInstances.filter(
        (s, si) => s.visible && options.series[si]._xAxisIndex === ai && !noAxesTypes.has(s.config._internalType)
      );

      if (relatedSeries.length === 0) continue;

      let xMin = Infinity, xMax = -Infinity;
      for (const s of relatedSeries) {
        const ext = s.getDataExtents();
        xMin = Math.min(xMin, ext.xMin);
        xMax = Math.max(xMax, ext.xMax);
      }
      if (isFinite(xMin) && isFinite(xMax)) {
        const xConfigs = options.series.filter(
          (cfg, si) => seriesInstances[si]?.visible && cfg._xAxisIndex === ai && !noAxesTypes.has(cfg._internalType)
        );
        const bubblePad = this.computeBubbleRadiusPadding(xConfigs, layout.plotArea.width);
        axis.updateDomain({
          min: xMin,
          max: xMax,
          extraMinPadding: bubblePad,
          extraMaxPadding: bubblePad,
        });
      }
    }

    for (let ai = 0; ai < yAxes.length; ai++) {
      const axis = yAxes[ai];
      const relatedConfigs = options.series.filter(
        (cfg, si) => seriesInstances[si]?.visible && cfg._yAxisIndex === ai && !noAxesTypes.has(cfg._internalType)
      );
      const relatedSeries = seriesInstances.filter(
        (s, si) => s.visible && options.series[si]._yAxisIndex === ai && !noAxesTypes.has(s.config._internalType)
      );

      if (relatedSeries.length === 0) continue;

      let yMin = Infinity, yMax = -Infinity;

      const stackGroups = new Map<string, Map<number | string, number>>();
      for (let si = 0; si < relatedSeries.length; si++) {
        const s = relatedSeries[si];
        const cfg = relatedConfigs[si];
        if (cfg?.stacking) {
          const key = stackKey(cfg);
          if (!stackGroups.has(key)) stackGroups.set(key, new Map());
          accumulateStackTotals(s.data, stackGroups.get(key)!);
        } else {
          const ext = s.getDataExtents();
          yMin = Math.min(yMin, ext.yMin);
          yMax = Math.max(yMax, ext.yMax);
        }
      }

      const hasPercentStacking = relatedConfigs.some(cfg => cfg?.stacking === 'percent');
      if (hasPercentStacking) {
        yMin = 0;
        yMax = 100;
        axis.config.min = 0;
        axis.config.max = 100;
      }
      for (const accum of stackGroups.values()) {
        if (!hasPercentStacking) {
          for (const total of accum.values()) {
            yMin = Math.min(yMin, 0);
            yMax = Math.max(yMax, total);
          }
        }
      }

      const hasZeroBaseSeries = relatedConfigs.some(cfg => ZERO_BASE_TYPES.has(cfg._internalType));
      if (hasZeroBaseSeries && axis.config.min === undefined) {
        yMin = Math.min(yMin, 0);
        yMax = Math.max(yMax, 0);
      }

      if (isFinite(yMin) && isFinite(yMax)) {
        const bubblePad = this.computeBubbleRadiusPadding(relatedConfigs, layout.plotArea.height);
        axis.updateDomain({
          min: yMin,
          max: yMax,
          extraMinPadding: bubblePad,
          extraMaxPadding: bubblePad,
        });
      }
    }
  }

  private computeBubbleRadiusPadding(configs: any[], plotSize: number): number {
    const bubbleConfigs = configs.filter(cfg => cfg && cfg._internalType === 'bubble');
    if (bubbleConfigs.length === 0 || plotSize <= 0) return 0;
    const plotArea = this.host.getLayout().plotArea;
    let maxRadius = 0;
    for (const cfg of bubbleConfigs) {
      const ms = (cfg as any).maxSize;
      let r: number;
      if (typeof ms === 'number') r = ms;
      else if (typeof ms === 'string' && ms.endsWith('%')) {
        r = Math.min(plotArea.width, plotArea.height) * parseFloat(ms) / 100 / 2;
      } else r = 30;
      maxRadius = Math.max(maxRadius, r);
    }
    return maxRadius / Math.max(plotSize - 2 * maxRadius, 1);
  }

  renderAxes(): void {
    const axisGroup = this.host.getAxisGroup();
    const layout = this.host.getLayout();
    axisGroup.selectAll('*').remove();

    if (isNonCartesianChart(this.host.getOptions().series)) return;

    for (const axis of this.host.getXAxes()) {
      if (axis.config.showEmpty === false && !this.hasSeriesForAxis(axis, true)) continue;
      axis.render(axisGroup as any, layout.plotArea);
    }
    for (const axis of this.host.getYAxes()) {
      if (axis.config.showEmpty === false && !this.hasSeriesForAxis(axis, false)) continue;
      axis.render(axisGroup as any, layout.plotArea);
    }

    this.setupAxisLabelHover();
  }

  private setupAxisLabelHover(): void {
    const xAxis = this.host.getXAxes()[0];
    if (!xAxis) return;

    const axisGroup = this.host.getAxisGroup();
    const xAxisGroup = axisGroup.select('.katucharts-axis-x');
    if (xAxisGroup.empty()) return;

    const tickGroups = xAxisGroup.selectAll<SVGGElement, any>('.tick');
    const options = this.host.getOptions();
    const seriesInstances = this.host.getSeriesInstances();
    const yAxes = this.host.getYAxes();
    const events = this.host.getEvents();

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

        const inv = !!options.chart.inverted;
        const rawX = xAxis.getPixelForValue(tickValue);
        const matchingPoints: any[] = [];

        for (const series of seriesInstances) {
          if (!series.visible) continue;
          const point = series.data.find((d: any) => (d.x ?? 0) === catIndex);
          if (point && point.y !== null && point.y !== undefined) {
            const yAxis = yAxes[0];
            const rawY = yAxis.getPixelForValue(point.y ?? 0);
            matchingPoints.push({
              point,
              series,
              plotX: inv ? rawY : rawX,
              plotY: inv ? rawX : rawY,
            });
          }
        }

        if (matchingPoints.length > 0) {
          const first = matchingPoints[0];
          events.emit('point:mouseover', {
            point: { ...first.point, matchingPoints },
            index: catIndex,
            series: first.series,
            event: _event,
            plotX: first.plotX,
            plotY: first.plotY,
          });
        }

        for (const series of seriesInstances) {
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
        for (const series of seriesInstances) {
          if (!series.visible) continue;
          const group = (series as any).group;
          if (!group) continue;

          group.selectAll('.katucharts-column, .katucharts-bar, .katucharts-marker, .katucharts-bubble, .katucharts-scatter-point')
            .interrupt()
            .attr('opacity', null)
            .attr('filter', null);
        }

        events.emit('point:mouseout', { point: {}, index: -1, series: null, event: null });
      });
  }

  private hasSeriesForAxis(axis: AxisInstance, isX: boolean): boolean {
    const options = this.host.getOptions();
    return this.host.getSeriesInstances().some((s, i) => {
      const cfg = options.series[i];
      const idx = isX ? cfg._xAxisIndex : cfg._yAxisIndex;
      return s.visible && idx === axis.config.index;
    });
  }
}

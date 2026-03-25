/**
 * Event delegation hover manager for cartesian series.
 * Uses a single overlay rect + binary search instead of per-point SVG elements.
 * Reduces SVG element count from 3×N to 3 for line/area series.
 */

import { Selection } from 'd3-selection';
import 'd3-transition';
import type { PointOptions, PlotArea } from '../types/options';
import type { AxisInstance } from '../axis/Axis';
import type { EventBus } from '../core/EventBus';
import type { BaseSeries } from '../series/BaseSeries';

export interface HoverManagerConfig {
  series: BaseSeries;
  group: Selection<SVGGElement, unknown, null, undefined>;
  data: PointOptions[];
  xAxis: AxisInstance;
  yAxis: AxisInstance;
  plotArea: PlotArea;
  events: EventBus;
  haloSize: number;
  haloOpacity: number;
  markerRadius: number;
  hoverRadius: number;
  hoverLineWidth: number;
  cursor: string;
  pathSelection?: Selection<SVGPathElement, any, any, any> | null;
  lineWidthPlus: number;
  baseLineWidth: number;
  getColor: (d: PointOptions) => string;
}

export class HoverManager {
  private hoverGroup: Selection<SVGGElement, unknown, null, undefined>;
  private halo: Selection<SVGCircleElement, unknown, null, undefined>;
  private hoverMarker: Selection<SVGCircleElement, unknown, null, undefined>;
  private hitArea: Selection<SVGRectElement, unknown, null, undefined>;
  private xPositions: Float64Array;
  private validData: PointOptions[];
  private currentIdx: number = -1;

  constructor(private config: HoverManagerConfig) {
    const { group, data, xAxis, plotArea } = config;

    this.validData = data.filter(d => d.y !== null && d.y !== undefined);
    this.xPositions = new Float64Array(this.validData.length);
    for (let i = 0; i < this.validData.length; i++) {
      this.xPositions[i] = xAxis.getPixelForValue(this.validData[i].x ?? i);
    }

    this.hoverGroup = group.append('g').attr('class', 'katucharts-hover-targets');

    this.halo = this.hoverGroup.append('circle')
      .attr('r', 0)
      .attr('opacity', 0)
      .attr('class', 'katucharts-halo');

    this.hoverMarker = this.hoverGroup.append('circle')
      .attr('r', config.markerRadius)
      .attr('opacity', 0)
      .attr('class', 'katucharts-hover-marker')
      .attr('stroke', '#fff')
      .attr('stroke-width', 1);

    this.hitArea = this.hoverGroup.append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', plotArea.width)
      .attr('height', plotArea.height)
      .attr('fill', 'transparent')
      .style('cursor', config.cursor || 'pointer');

    this.setupEvents();
  }

  private setupEvents(): void {
    const { series, events, xAxis, yAxis, pathSelection, lineWidthPlus, baseLineWidth } = this.config;
    let rafId: number | null = null;

    this.hitArea
      .on('mousemove', (event: MouseEvent) => {
        if (rafId) return;
        rafId = requestAnimationFrame(() => {
          rafId = null;
          const rect = (this.hitArea.node() as SVGRectElement).getBoundingClientRect();
          const mx = event.clientX - rect.left;
          const idx = this.findNearest(mx);
          if (idx === this.currentIdx) return;

          this.showHover(idx, event);
        });
      })
      .on('mouseout', (event: MouseEvent) => {
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        this.hideHover(event);
      })
      .on('click', (event: MouseEvent) => {
        if (this.currentIdx < 0) return;
        const d = this.validData[this.currentIdx];
        events.emit('point:click', { point: d, index: this.currentIdx, series, event });
        d.events?.click?.call(d, event);
        (series.config as any).point?.events?.click?.call(d, event);
        (series.config as any).events?.click?.call(series, event);
      });
  }

  private showHover(idx: number, event: MouseEvent): void {
    if (idx < 0 || idx >= this.validData.length) return;

    const { series, events, xAxis, yAxis, haloSize, haloOpacity, hoverRadius, hoverLineWidth, pathSelection, lineWidthPlus, baseLineWidth, getColor } = this.config;
    const d = this.validData[idx];
    const cx = this.xPositions[idx];
    const cy = yAxis.getPixelForValue(d.y ?? 0);
    const color = getColor(d);

    if (this.currentIdx >= 0 && this.currentIdx !== idx) {
      events.emit('point:mouseout', {
        point: this.validData[this.currentIdx], index: this.currentIdx, series, event,
      });
    }

    this.currentIdx = idx;

    this.halo
      .attr('cx', cx).attr('cy', cy)
      .attr('fill', color)
      .transition().duration(150)
      .attr('r', haloSize)
      .attr('opacity', haloOpacity);

    this.hoverMarker
      .attr('cx', cx).attr('cy', cy)
      .attr('fill', color)
      .transition().duration(150)
      .attr('r', hoverRadius)
      .attr('opacity', 1)
      .attr('stroke-width', hoverLineWidth);

    if (lineWidthPlus && pathSelection) {
      pathSelection.transition('hover').duration(150)
        .attr('stroke-width', baseLineWidth + lineWidthPlus);
    }

    events.emit('point:mouseover', {
      point: d, index: idx, series, event, plotX: cx, plotY: cy,
    });
    d.events?.mouseOver?.call(d, event);
    (series.config as any).point?.events?.mouseOver?.call(d, event);
  }

  private hideHover(event: MouseEvent): void {
    const { series, events, pathSelection, baseLineWidth } = this.config;

    if (this.currentIdx >= 0) {
      const d = this.validData[this.currentIdx];
      events.emit('point:mouseout', { point: d, index: this.currentIdx, series, event });
      d.events?.mouseOut?.call(d, event);
      (series.config as any).point?.events?.mouseOut?.call(d, event);
    }

    this.halo.transition().duration(150).attr('r', 0).attr('opacity', 0);
    this.hoverMarker.transition().duration(150).attr('r', this.config.markerRadius).attr('opacity', 0);

    if (pathSelection) {
      pathSelection.transition('hover').duration(150)
        .attr('stroke-width', baseLineWidth);
    }

    this.currentIdx = -1;
  }

  private findNearest(targetX: number): number {
    const arr = this.xPositions;
    if (arr.length === 0) return -1;

    let lo = 0;
    let hi = arr.length - 1;

    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] < targetX) lo = mid + 1;
      else hi = mid;
    }

    if (lo > 0 && Math.abs(arr[lo - 1] - targetX) < Math.abs(arr[lo] - targetX)) {
      lo = lo - 1;
    }

    if (Math.abs(arr[lo] - targetX) > 30) return -1;

    return lo;
  }
}

/**
 * Event delegation hover manager for cartesian series.
 * Uses a single shared mousemove handler per SVG to coordinate across all series.
 */

import { Selection, select } from 'd3-selection';
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

const registry = new WeakMap<SVGSVGElement, HoverManager[]>();

function getOrCreateRegistry(svg: SVGSVGElement, plotArea: PlotArea): HoverManager[] {
  let managers = registry.get(svg);
  if (!managers) {
    managers = [];
    registry.set(svg, managers);

    select(svg).on('mousemove.hover-shared', (event: MouseEvent) => {
      const plotG = svg.querySelector('.katucharts-plot-group') as SVGGElement | null;
      if (!plotG) return;
      const ctm = plotG.getScreenCTM();
      if (!ctm) return;
      const pt = svg.createSVGPoint();
      pt.x = event.clientX;
      pt.y = event.clientY;
      const svgPt = pt.matrixTransform(ctm.inverse());
      const mx = svgPt.x;
      const my = svgPt.y;
      if (mx < 0 || mx > plotArea.width || my < 0 || my > plotArea.height) {
        for (const mgr of managers!) {
          if (mgr.currentIdx >= 0) mgr.hideHover(event);
        }
        return;
      }

      let bestMgr: HoverManager | null = null;
      let bestIdx = -1;
      let bestDist = Infinity;

      for (const mgr of managers!) {
        const result = mgr.findCandidate(mx, my);
        if (result && result.dist < bestDist) {
          bestDist = result.dist;
          bestIdx = result.idx;
          bestMgr = mgr;
        }
      }

      for (const mgr of managers!) {
        if (mgr !== bestMgr && mgr.currentIdx >= 0) mgr.hideHover(event);
      }
      if (bestMgr && bestIdx !== bestMgr.currentIdx) {
        bestMgr.showHover(bestIdx, event);
      }
    });

    select(svg).on('mouseleave.hover-shared', (event: MouseEvent) => {
      for (const mgr of managers!) {
        if (mgr.currentIdx >= 0) mgr.hideHover(event);
      }
    });

    select(svg).on('click.hover-shared', (event: MouseEvent) => {
      for (const mgr of managers!) {
        if (mgr.currentIdx >= 0) {
          mgr.handleClick(event);
          break;
        }
      }
    });
  }
  return managers;
}

export class HoverManager {
  private hoverGroup: Selection<SVGGElement, unknown, null, undefined>;
  private halo: Selection<SVGCircleElement, unknown, null, undefined>;
  private hoverMarker: Selection<SVGCircleElement, unknown, null, undefined>;
  private xPositions: Float64Array;
  private validData: PointOptions[];
  currentIdx: number = -1;

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

    const svgNode = group.node()?.ownerSVGElement;
    if (svgNode) {
      const managers = getOrCreateRegistry(svgNode, plotArea);
      managers.push(this);
    }
  }

  findCandidate(mx: number, my: number): { idx: number; dist: number } | null {
    const { yAxis } = this.config;
    const arr = this.xPositions;
    if (arr.length === 0) return null;

    let lo = 0;
    let hi = arr.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] < mx) lo = mid + 1;
      else hi = mid;
    }

    let bestIdx = -1;
    let bestDist = Infinity;
    const checkRange = 2;
    for (let i = Math.max(0, lo - checkRange); i <= Math.min(arr.length - 1, lo + checkRange); i++) {
      const px = arr[i];
      const py = yAxis.getPixelForValue(this.validData[i].y ?? 0);
      const d = Math.sqrt((px - mx) ** 2 + (py - my) ** 2);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }

    if (bestIdx < 0 || Math.abs(arr[bestIdx] - mx) > 50) return null;
    return { idx: bestIdx, dist: bestDist };
  }

  handleClick(event: MouseEvent): void {
    if (this.currentIdx < 0) return;
    const { series, events } = this.config;
    const d = this.validData[this.currentIdx];
    events.emit('point:click', { point: d, index: this.currentIdx, series, event });
    d.events?.click?.call(d, event);
    (series.config as any).point?.events?.click?.call(d, event);
    (series.config as any).events?.click?.call(series, event);
  }

  showHover(idx: number, event: MouseEvent): void {
    if (idx < 0 || idx >= this.validData.length) return;

    const { series, events, yAxis, haloSize, haloOpacity, hoverRadius, hoverLineWidth, pathSelection, lineWidthPlus, baseLineWidth, getColor } = this.config;
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

  hideHover(event: MouseEvent): void {
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

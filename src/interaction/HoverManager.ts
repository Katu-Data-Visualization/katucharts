/**
 * Event delegation hover manager for cartesian series.
 * Uses a single shared mousemove handler per SVG to coordinate across all series.
 */

import { Selection, select } from 'd3-selection';
import 'd3-transition';
import type { PointOptions, PlotArea } from '../types/options';
import type { AxisInstance } from '../axis/Axis';
import type { EventBus } from '../core/EventBus';
import { handledClicks, type BaseSeries } from '../series/BaseSeries';
import { HOVER_DURATION, EASE_HOVER } from '../core/animationConstants';

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

/**
 * Drops managers whose series group has been removed from the DOM — every
 * re-render (zoom, redraw, setData, resize) builds new ones — so stale managers
 * can't keep answering hover and clicks at old pixel positions.
 */
function pruneDetached(managers: HoverManager[]): void {
  for (let i = managers.length - 1; i >= 0; i--) {
    if (!managers[i].isAttached()) managers.splice(i, 1);
  }
}

/** Plot-area coordinates of a pointer event, or null when it can't be mapped. */
function toPlotPoint(svg: SVGSVGElement, event: MouseEvent): { x: number; y: number; plotG: SVGGElement } | null {
  const plotG = svg.querySelector('.katucharts-plot-group') as SVGGElement | null;
  if (!plotG) return null;
  const ctm = plotG.getScreenCTM();
  if (!ctm) return null;
  const pt = svg.createSVGPoint();
  pt.x = event.clientX;
  pt.y = event.clientY;
  const p = pt.matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y, plotG };
}

function getOrCreateRegistry(svg: SVGSVGElement): HoverManager[] {
  let managers = registry.get(svg);
  if (!managers) {
    managers = [];
    registry.set(svg, managers);

    /** The newest manager carries the current layout's plot area. */
    const currentPlotArea = (): PlotArea | null => managers![managers!.length - 1]?.plotArea ?? null;

    select(svg).on('mousemove.hover-shared', (event: MouseEvent) => {
      pruneDetached(managers!);
      const plotArea = currentPlotArea();
      const pt = toPlotPoint(svg, event);
      if (!plotArea || !pt) return;
      const mx = pt.x;
      const my = pt.y;
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
        if (!mgr.isActive()) continue;
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

    /**
     * Delegated click for line/spline points. Only a click inside the plot that
     * no other point element already handled counts, so clicking a bar, the
     * legend or the title never also fires a nearby line point.
     */
    select(svg).on('click.hover-shared', (event: MouseEvent) => {
      if (handledClicks.has(event)) return;
      pruneDetached(managers!);
      const plotArea = currentPlotArea();
      const pt = toPlotPoint(svg, event);
      if (!plotArea || !pt) return;
      const target = event.target as Node | null;
      if (!target) return;
      const onBackground = target === svg || (target as Element).classList?.contains('katucharts-background');
      if (!onBackground && !pt.plotG.contains(target)) return;
      if (pt.x < 0 || pt.x > plotArea.width || pt.y < 0 || pt.y > plotArea.height) return;
      for (const mgr of managers!) {
        if (mgr.currentIdx >= 0 && mgr.isActive()) {
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

  constructor(readonly config: HoverManagerConfig) {
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
      const managers = getOrCreateRegistry(svgNode);
      for (let i = managers.length - 1; i >= 0; i--) {
        if (managers[i].config.series === config.series) managers.splice(i, 1);
      }
      pruneDetached(managers);
      managers.push(this);
    }
  }

  get plotArea(): PlotArea {
    return this.config.plotArea;
  }

  isAttached(): boolean {
    return !!this.hoverGroup.node()?.isConnected;
  }

  /** Hidden series take no hover or clicks. */
  isActive(): boolean {
    return this.config.series.visible !== false && this.isAttached();
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
    const { series } = this.config;
    const d = this.validData[this.currentIdx];
    const dataIndex = series.data.indexOf(d);
    series.firePointClick(d, dataIndex >= 0 ? dataIndex : this.currentIdx, event);
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
      .transition().duration(HOVER_DURATION).ease(EASE_HOVER)
      .attr('r', haloSize)
      .attr('opacity', haloOpacity);

    this.hoverMarker
      .attr('cx', cx).attr('cy', cy)
      .attr('fill', color)
      .transition().duration(HOVER_DURATION).ease(EASE_HOVER)
      .attr('r', hoverRadius)
      .attr('opacity', 1)
      .attr('stroke-width', hoverLineWidth);

    if (lineWidthPlus && pathSelection) {
      pathSelection.transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER)
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

    this.halo.transition().duration(HOVER_DURATION).ease(EASE_HOVER)
      .attr('r', 0).attr('opacity', 0);
    this.hoverMarker.transition().duration(HOVER_DURATION).ease(EASE_HOVER)
      .attr('r', this.config.markerRadius).attr('opacity', 0);

    if (pathSelection) {
      pathSelection.transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER)
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

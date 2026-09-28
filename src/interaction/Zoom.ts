/**
 * Drag-to-zoom, mouse-wheel zoom and panning for cartesian charts, following
 * Highcharts behaviour: the gesture is turned into axis values, offered to
 * `chart.events.selection`, and applied through `axis.setExtremes`, so the
 * zoomed range survives redraws and fires the axis extremes events.
 */

import { Selection, select } from 'd3-selection';
import type { PlotArea } from '../types/options';
import type { AxisInstance } from '../axis/Axis';

export type ZoomType = 'x' | 'y' | 'xy';
type ModifierKey = 'ctrl' | 'alt' | 'shift' | 'meta';

export interface ZoomConfig {
  type?: ZoomType;
  key?: ModifierKey;
  mouseWheel?: boolean | { enabled?: boolean; sensitivity?: number; type?: ZoomType };
  pinchType?: 'x' | 'y' | 'xy';
  resetButton?: {
    position?: { align?: string; verticalAlign?: string; x?: number; y?: number };
    theme?: Record<string, any>;
    relativeTo?: 'plot' | 'chart';
  };
  panning?: boolean | { enabled?: boolean; type?: ZoomType };
  panKey?: ModifierKey;
  selectionMarkerFill?: string;
}

export interface SelectionAxisRange {
  axis: AxisInstance;
  min: number;
  max: number;
}

/** Highcharts `chart.events.selection` event. */
export interface SelectionEvent {
  type: 'selection';
  xAxis: SelectionAxisRange[];
  yAxis: SelectionAxisRange[];
  originalEvent?: MouseEvent;
  resetSelection?: boolean;
  preventDefault: () => void;
}

export interface ZoomHost {
  svg: SVGSVGElement;
  container: HTMLElement;
  getPlotGroup(): SVGGElement | null;
  getPlotArea(): PlotArea;
  getChartSize(): { width: number; height: number };
  getXAxes(): AxisInstance[];
  getYAxes(): AxisInstance[];
  isInverted(): boolean;
  /** Offers the selection to `chart.events.selection`; false = cancelled. */
  fireSelection(event: SelectionEvent): boolean;
  redraw(): void;
  onReset(): void;
}

/** Pixels the pointer must travel before a press becomes a drag, as in Highcharts. */
const DRAG_THRESHOLD = 10;

type AxisSnapshot = {
  axis: AxisInstance;
  scale: any;
  range: [number, number];
  horizontal: boolean;
  isCategory: boolean;
  count: number;
};

export class Zoom {
  private readonly cfg: ZoomConfig;
  private readonly zoomType: ZoomType | undefined;
  private readonly panningEnabled: boolean;
  private readonly panningType: ZoomType;
  private readonly panKey: ModifierKey | undefined;
  private resetButton: HTMLButtonElement | null = null;
  private selectionRect: Selection<SVGRectElement, unknown, null, undefined> | null = null;
  /** Highcharts `cancelClick`: set when a drag ends, so its trailing click is dropped. */
  private cancelClick = false;
  private frame = 0;
  private readonly cleanups: (() => void)[] = [];

  constructor(config: ZoomConfig, private host: ZoomHost) {
    this.cfg = config;
    this.zoomType = config.type;

    const pan = config.panning;
    this.panningEnabled = typeof pan === 'object' ? pan.enabled !== false : pan === true;
    this.panningType = (typeof pan === 'object' && pan.type) || 'x';
    /**
     * With zooming on, a plain drag zooms, so panning needs a modifier; Highcharts
     * documents shift for this when no `panKey` is given.
     */
    this.panKey = config.panKey ?? (this.zoomType ? 'shift' : undefined);

    this.listen(host.svg, 'mousedown', (e) => this.onMouseDown(e as MouseEvent));
    this.listen(host.container, 'mousedown', () => { this.cancelClick = false; }, true);
    this.listen(host.container, 'click', (e) => this.swallowClickAfterDrag(e as MouseEvent), true);
    if (this.isMouseWheelEnabled()) {
      this.listen(host.svg, 'wheel', (e) => this.onWheel(e as WheelEvent), { passive: false } as any);
    }
  }

  private listen(target: EventTarget, type: string, fn: (e: Event) => void, opts?: boolean | AddEventListenerOptions): void {
    target.addEventListener(type, fn, opts);
    this.cleanups.push(() => target.removeEventListener(type, fn, opts));
  }

  private isKeyPressed(event: MouseEvent, key: ModifierKey | undefined): boolean {
    switch (key) {
      case 'ctrl': return event.ctrlKey;
      case 'alt': return event.altKey;
      case 'shift': return event.shiftKey;
      case 'meta': return event.metaKey;
      default: return false;
    }
  }

  /** Pointer position in plot coordinates (origin at the plot's top-left). */
  private toPlot(event: MouseEvent): { x: number; y: number } | null {
    const plot = this.host.getPlotGroup();
    const ctm = plot?.getScreenCTM();
    if (!plot || !ctm) return null;
    const pt = this.host.svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }

  private isInsidePlot(p: { x: number; y: number }): boolean {
    const pa = this.host.getPlotArea();
    return p.x >= 0 && p.x <= pa.width && p.y >= 0 && p.y <= pa.height;
  }

  private clampToPlot(p: { x: number; y: number }): { x: number; y: number } {
    const pa = this.host.getPlotArea();
    return { x: Math.min(Math.max(p.x, 0), pa.width), y: Math.min(Math.max(p.y, 0), pa.height) };
  }

  /** Whether an axis runs left–right on screen (x axes unless the chart is inverted). */
  private isHorizontal(axis: AxisInstance): boolean {
    return !!axis.config.isX !== this.host.isInverted();
  }

  /** Axes a zoom/pan of this type acts on: `x` → x axes, `y` → y axes. */
  private axesFor(type: ZoomType | undefined): AxisInstance[] {
    if (!type) return [];
    const out: AxisInstance[] = [];
    if (type.includes('x')) out.push(...this.host.getXAxes());
    if (type.includes('y')) out.push(...this.host.getYAxes());
    return out;
  }

  private snapshot(axis: AxisInstance): AxisSnapshot {
    const scale = (axis.scale as any).copy();
    const range = scale.range() as [number, number];
    const isCategory = typeof scale.bandwidth === 'function';
    return {
      axis,
      scale,
      range: [range[0], range[range.length - 1]],
      horizontal: this.isHorizontal(axis),
      isCategory,
      count: isCategory ? scale.domain().length : 0,
    };
  }

  /** Axis value at a pixel, using a frozen copy of the scale. */
  private valueAt(s: AxisSnapshot, px: number): number {
    if (s.isCategory) {
      const [r0, r1] = s.range;
      if (!s.count || r0 === r1) return 0;
      return ((px - r0) / (r1 - r0)) * s.count - 0.5;
    }
    const v = s.scale.invert(px);
    return v instanceof Date ? v.getTime() : Number(v);
  }

  /** Pixel of an axis value in the frozen scale (category: fractional index). */
  private pixelOf(s: AxisSnapshot, value: number): number {
    if (s.isCategory) {
      const [r0, r1] = s.range;
      return r0 + ((value + 0.5) / Math.max(s.count, 1)) * (r1 - r0);
    }
    const px = s.scale(s.scale.invert(0) instanceof Date ? new Date(value) : value);
    return Number(px);
  }

  /** Pixel span of the data (so panning and wheel zoom stop at the data edges). */
  private dataPixelBounds(s: AxisSnapshot): [number, number] {
    const a = Math.min(s.range[0], s.range[1]);
    const b = Math.max(s.range[0], s.range[1]);
    const { dataMin, dataMax } = s.axis;
    if (s.isCategory) {
      const p0 = this.pixelOf(s, -0.5);
      const p1 = this.pixelOf(s, s.count - 0.5);
      return [Math.min(p0, p1, a), Math.max(p0, p1, b)];
    }
    if (dataMin == null || dataMax == null || !isFinite(dataMin) || !isFinite(dataMax)) return [a, b];
    const p0 = this.pixelOf(s, dataMin);
    const p1 = this.pixelOf(s, dataMax);
    if (!isFinite(p0) || !isFinite(p1)) return [a, b];
    return [Math.min(p0, p1, a), Math.max(p0, p1, b)];
  }

  /** Converts a pixel window on an axis to [min, max] extremes. */
  private extremesFor(s: AxisSnapshot, p0: number, p1: number, keepCount = false): [number, number] {
    const v0 = this.valueAt(s, p0);
    const v1 = this.valueAt(s, p1);
    let lo = Math.min(v0, v1);
    let hi = Math.max(v0, v1);
    if (s.isCategory) {
      const last = Math.max(s.count - 1, 0);
      if (keepCount) {
        const ext = s.axis.getExtremes();
        const size = ext.max - ext.min;
        const start = Math.min(Math.max(Math.round(lo + 0.5), 0), Math.max(last - size, 0));
        return [start, start + size];
      }
      /** Categories whose centre lies inside the window; a sliver inside one band picks that band. */
      let a = Math.ceil(lo);
      let b = Math.floor(hi);
      if (a > b) a = b = Math.round((lo + hi) / 2);
      a = Math.min(Math.max(a, 0), last);
      b = Math.min(Math.max(b, a), last);
      return [a, b];
    }
    return [lo, hi];
  }

  private onMouseDown(event: MouseEvent): void {
    if (event.button !== 0) return;
    const start = this.toPlot(event);
    if (!start || !this.isInsidePlot(start)) return;

    const panKeyDown = this.isKeyPressed(event, this.panKey);
    const wantsPan = this.panningEnabled && (panKeyDown || !this.zoomType);
    const wantsZoom = !!this.zoomType && !panKeyDown
      && (!this.cfg.key || this.isKeyPressed(event, this.cfg.key));

    if (wantsPan) this.beginPan(event, start);
    else if (wantsZoom) this.beginSelection(event, start);
  }

  private beginSelection(downEvent: MouseEvent, start: { x: number; y: number }): void {
    const plot = this.host.getPlotGroup();
    if (!plot) return;
    const zoomAxes = this.axesFor(this.zoomType);
    const zoomsHoriz = zoomAxes.some(a => this.isHorizontal(a));
    const zoomsVert = zoomAxes.some(a => !this.isHorizontal(a));
    const pa = this.host.getPlotArea();
    let dragged = false;
    let current = start;

    /** Stops text selection and native image drag while dragging out the box. */
    downEvent.preventDefault();

    const move = (e: MouseEvent) => {
      const p = this.toPlot(e);
      if (!p) return;
      current = this.clampToPlot(p);
      const dx = current.x - start.x;
      const dy = current.y - start.y;
      if (!dragged && Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
        dragged = true;
        this.selectionRect = select(plot).append('rect')
          .attr('class', 'katucharts-selection-marker')
          .attr('fill', this.cfg.selectionMarkerFill || 'rgba(51,92,173,0.25)')
          .style('pointer-events', 'none');
      }
      if (!dragged || !this.selectionRect) return;
      const x = zoomsHoriz ? Math.min(start.x, current.x) : 0;
      const w = zoomsHoriz ? Math.abs(dx) : pa.width;
      const y = zoomsVert ? Math.min(start.y, current.y) : 0;
      const h = zoomsVert ? Math.abs(dy) : pa.height;
      this.selectionRect.attr('x', x).attr('y', y).attr('width', w).attr('height', h);
    };

    const up = (e: MouseEvent) => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      this.selectionRect?.remove();
      this.selectionRect = null;
      if (!dragged) return;
      this.cancelClick = true;
      this.applySelection(start, current, zoomAxes, e);
    };

    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }

  private applySelection(
    start: { x: number; y: number },
    end: { x: number; y: number },
    zoomAxes: AxisInstance[],
    originalEvent: MouseEvent
  ): void {
    const xAxis: SelectionAxisRange[] = [];
    const yAxis: SelectionAxisRange[] = [];
    for (const axis of zoomAxes) {
      const s = this.snapshot(axis);
      const p0 = s.horizontal ? start.x : start.y;
      const p1 = s.horizontal ? end.x : end.y;
      /** A drag that is flat along this axis leaves it alone rather than zooming to a sliver. */
      if (Math.abs(p1 - p0) <= DRAG_THRESHOLD) continue;
      const [min, max] = this.extremesFor(s, p0, p1);
      if (!isFinite(min) || !isFinite(max)) continue;
      (axis.config.isX ? xAxis : yAxis).push({ axis, min, max });
    }
    if (!xAxis.length && !yAxis.length) return;

    let prevented = false;
    const event: SelectionEvent = {
      type: 'selection',
      xAxis,
      yAxis,
      originalEvent,
      preventDefault: () => { prevented = true; },
    };
    if (!this.host.fireSelection(event) || prevented) return;

    for (const r of [...xAxis, ...yAxis]) {
      r.axis.setExtremes(r.min, r.max, false, undefined, { trigger: 'zoom' });
    }
    this.host.redraw();
    this.setResetButtonVisible(true);
  }

  private beginPan(downEvent: MouseEvent, start: { x: number; y: number }): void {
    const snaps = this.axesFor(this.panningType).map(a => this.snapshot(a));
    if (!snaps.length) return;
    downEvent.preventDefault();
    let dragged = false;
    const svgStyle = this.host.svg.style;
    const prevCursor = svgStyle.cursor;

    const move = (e: MouseEvent) => {
      const p = this.toPlot(e);
      if (!p) return;
      const dx = p.x - start.x;
      const dy = p.y - start.y;
      if (!dragged && Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
        dragged = true;
        svgStyle.cursor = 'move';
      }
      if (!dragged) return;
      let changed = false;
      for (const s of snaps) {
        const d = s.horizontal ? dx : dy;
        const a = Math.min(s.range[0], s.range[1]);
        const b = Math.max(s.range[0], s.range[1]);
        const [lo, hi] = this.dataPixelBounds(s);
        /** Shift the window opposite to the pointer, stopping at the data edges. */
        const shift = Math.min(Math.max(-d, lo - a), hi - b);
        const [min, max] = this.extremesFor(s, s.range[0] + shift, s.range[1] + shift, true);
        if (!isFinite(min) || !isFinite(max)) continue;
        s.axis.setExtremes(min, max, false, undefined, { trigger: 'pan' });
        changed = true;
      }
      if (changed) this.scheduleRedraw();
    };

    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      svgStyle.cursor = prevCursor;
      if (!dragged) return;
      this.cancelClick = true;
      this.setResetButtonVisible(true);
    };

    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }

  private scheduleRedraw(): void {
    if (this.frame) return;
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn: FrameRequestCallback) => setTimeout(() => fn(0), 16) as any;
    this.frame = raf(() => {
      this.frame = 0;
      this.host.redraw();
    });
  }

  private isMouseWheelEnabled(): boolean {
    /**
     * Mouse-wheel zoom is opt-in. On by default it takes the wheel away from
     * page/plot scrolling, so it only turns on for `mouseWheel: true` or
     * `{ enabled: true }`.
     */
    const opt = this.cfg.mouseWheel;
    if (!this.zoomType) return false;
    if (opt === true) return true;
    return typeof opt === 'object' && opt !== null && opt.enabled !== false;
  }

  private onWheel(event: WheelEvent): void {
    const p = this.toPlot(event);
    if (!p || !this.isInsidePlot(p) || !event.deltaY) return;
    event.preventDefault();

    const opt = this.cfg.mouseWheel;
    const sensitivity = typeof opt === 'object' && opt?.sensitivity !== undefined ? opt.sensitivity : 1.1;
    const type = (typeof opt === 'object' && opt?.type) || this.zoomType;
    /** Wheel up zooms in around the pointer; wheel down zooms back out. */
    const factor = event.deltaY < 0 ? 1 / sensitivity : sensitivity;

    let changed = false;
    for (const axis of this.axesFor(type)) {
      const s = this.snapshot(axis);
      const at = s.horizontal ? p.x : p.y;
      const a = Math.min(s.range[0], s.range[1]);
      const b = Math.max(s.range[0], s.range[1]);
      let n0 = at - (at - a) * factor;
      let n1 = at + (b - at) * factor;
      const [lo, hi] = this.dataPixelBounds(s);
      if (n0 <= lo && n1 >= hi) {
        if (axis.hasUserExtremes()) {
          axis.setExtremes(null, null, false, undefined, { trigger: 'zoom' });
          changed = true;
        }
        continue;
      }
      if (n0 < lo) { n1 += lo - n0; n0 = lo; }
      if (n1 > hi) { n0 -= n1 - hi; n1 = hi; }
      let [min, max] = this.extremesFor(s, n0, n1);
      if (!isFinite(min) || !isFinite(max)) continue;
      if (s.isCategory) {
        /** Whole categories only: make sure each wheel step moves by at least one. */
        const cur = axis.getExtremes();
        if (min === cur.min && max === cur.max) {
          const step = factor < 1 ? 1 : -1;
          if (max - min > 1 || step < 0) {
            min = Math.max(0, min + step);
            max = Math.min(s.count - 1, max - step);
          }
        }
        if (max < min) continue;
      }
      axis.setExtremes(min, max, false, undefined, { trigger: 'zoom' });
      changed = true;
    }
    if (!changed) return;
    this.scheduleRedraw();
    const anyZoomed = [...this.host.getXAxes(), ...this.host.getYAxes()].some(a => a.hasUserExtremes());
    this.setResetButtonVisible(anyZoomed);
  }

  /** Highcharts sets `cancelClick` after a drag so the mouseup doesn't also click a point. */
  private swallowClickAfterDrag(event: MouseEvent): void {
    if (!this.cancelClick) return;
    this.cancelClick = false;
    event.stopPropagation();
    event.preventDefault();
  }

  private ensureResetButton(): HTMLButtonElement {
    if (this.resetButton) return this.resetButton;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'katucharts-reset-zoom';
    btn.textContent = 'Reset zoom';
    const theme = this.cfg.resetButton?.theme || {};
    Object.assign(btn.style, {
      position: 'absolute',
      padding: theme.padding || '3px 8px',
      fontSize: theme.fontSize || '11px',
      border: theme.border || '1px solid #ccc',
      borderRadius: theme.borderRadius || '3px',
      backgroundColor: theme.backgroundColor || theme.fill || '#f9f9f9',
      color: theme.color || '#333',
      cursor: 'pointer',
      display: 'none',
      zIndex: '5',
    });
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.host.onReset();
    });
    this.host.container.appendChild(btn);
    this.resetButton = btn;
    this.positionResetButton();
    return btn;
  }

  /**
   * Places the button at `resetButton.position` (default: top-right, x -10,
   * y 10) relative to the plot area, or to the chart with `relativeTo: 'chart'`.
   */
  positionResetButton(): void {
    const btn = this.resetButton;
    if (!btn) return;
    const pos = this.cfg.resetButton?.position || {};
    const relToChart = this.cfg.resetButton?.relativeTo === 'chart';
    const pa = this.host.getPlotArea();
    const size = this.host.getChartSize();
    const box = relToChart ? { x: 0, y: 0, width: size.width, height: size.height } : pa;
    const align = pos.align || 'right';
    const valign = pos.verticalAlign || 'top';
    const x = pos.x ?? (align === 'right' ? -10 : 10);
    const y = pos.y ?? (valign === 'bottom' ? -10 : 10);

    btn.style.left = btn.style.right = btn.style.top = btn.style.bottom = '';
    btn.style.transform = '';
    if (align === 'right') btn.style.right = `${size.width - (box.x + box.width) - x}px`;
    else if (align === 'center') {
      btn.style.left = `${box.x + box.width / 2 + x}px`;
      btn.style.transform = 'translateX(-50%)';
    } else btn.style.left = `${box.x + x}px`;
    if (valign === 'bottom') btn.style.bottom = `${size.height - (box.y + box.height) - y}px`;
    else if (valign === 'middle') {
      btn.style.top = `${box.y + box.height / 2 + y}px`;
      btn.style.transform += ' translateY(-50%)';
    } else btn.style.top = `${box.y + y}px`;
  }

  setResetButtonVisible(visible: boolean): void {
    if (!visible && !this.resetButton) return;
    const btn = this.ensureResetButton();
    this.positionResetButton();
    btn.style.display = visible ? 'block' : 'none';
  }

  destroy(): void {
    for (const off of this.cleanups) off();
    this.cleanups.length = 0;
    this.selectionRect?.remove();
    this.resetButton?.remove();
    this.resetButton = null;
  }
}

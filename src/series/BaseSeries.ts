/**
 * Base class for all series types. Defines the template method pattern
 * with shared data labels, selection, clipping, shadow, and inactive state support.
 */

import { Selection } from 'd3-selection';
import 'd3-transition';
import type { InternalSeriesConfig, PointOptions, PlotArea, DataLabelOptions, DashStyleType } from '../types/options';
import type { AxisInstance } from '../axis/Axis';
import { EventBus } from '../core/EventBus';
import { templateFormat, stripHtmlTags } from '../utils/format';

export interface SeriesContext {
  plotArea: PlotArea;
  xAxis: AxisInstance;
  yAxis: AxisInstance;
  colorIndex: number;
  colors: string[];
  events: EventBus;
  chartGroup: Selection<SVGGElement, unknown, null, undefined>;
  plotGroup?: Selection<SVGGElement, unknown, null, undefined>;
  totalSeriesOfType?: number;
  indexInType?: number;
  animate?: boolean;
  stackOffsets?: Map<number | string, number>;
  allSeries?: BaseSeries[];
}

type AnimatedRedrawFn = (duration?: number) => void;

export const STAGGER_MAX_POINTS = 500;

export function staggerDelay(index: number, base: number, perItem: number, totalItems: number): number {
  if (totalItems > STAGGER_MAX_POINTS) return base;
  return base + index * perItem;
}

export const DASH_STYLE_MAP: Record<string, string> = {
  'Solid': 'none',
  'ShortDash': '6,2',
  'ShortDot': '2,2',
  'ShortDashDot': '6,2,2,2',
  'ShortDashDotDot': '6,2,2,2,2,2',
  'Dot': '2,6',
  'Dash': '8,6',
  'LongDash': '16,6',
  'DashDot': '8,6,2,6',
  'LongDashDot': '16,6,2,6',
  'LongDashDotDot': '16,6,2,6,2,6',
};

export function resolveDashArray(style?: DashStyleType | string): string {
  if (!style || style === 'Solid') return 'none';
  return DASH_STYLE_MAP[style] || 'none';
}

export function brightenColor(color: string, amount: number): string {
  const hexMatch = color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (hexMatch) {
    const r = Math.min(255, parseInt(hexMatch[1], 16) + Math.round(255 * amount));
    const g = Math.min(255, parseInt(hexMatch[2], 16) + Math.round(255 * amount));
    const b = Math.min(255, parseInt(hexMatch[3], 16) + Math.round(255 * amount));
    return `rgb(${r},${g},${b})`;
  }
  const rgbMatch = color.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  if (rgbMatch) {
    const r = Math.min(255, parseInt(rgbMatch[1]) + Math.round(255 * amount));
    const g = Math.min(255, parseInt(rgbMatch[2]) + Math.round(255 * amount));
    const b = Math.min(255, parseInt(rgbMatch[3]) + Math.round(255 * amount));
    return `rgb(${r},${g},${b})`;
  }
  return color;
}

export abstract class BaseSeries {
  config: InternalSeriesConfig;
  protected context!: SeriesContext;
  protected group!: Selection<SVGGElement, unknown, null, undefined>;
  protected clipId?: string;
  protected selectedPoints: Set<number> = new Set();
  visible: boolean;
  data: PointOptions[];
  private _cachedExtents: { xMin: number; xMax: number; yMin: number; yMax: number } | null = null;
  private _onVisibilityChange?: AnimatedRedrawFn;

  constructor(config: InternalSeriesConfig) {
    this.config = config;
    this.visible = config.visible !== false;
    this.data = config._processedData || [];
  }

  init(context: SeriesContext): void {
    this.context = context;
    this.group = context.chartGroup.append('g')
      .attr('class', `katucharts-series katucharts-series-${this.config._internalType}`)
      .attr('data-series-index', this.config.index);

    if (this.config.opacity !== undefined && this.config.opacity !== 1) {
      this.group.attr('opacity', this.config.opacity);
    }

    if (this.config.zIndex !== undefined) {
      this.group.style('z-index', String(this.config.zIndex));
    }

    if (this.config.className) {
      this.group.classed(this.config.className, true);
    }

    if (this.config.clip !== false) {
      this.applyClipPath();
    }

    if (this.config.shadow) {
      this.applyShadowFilter();
    }

    if (!this.visible) {
      this.group.style('display', 'none' as any);
    }

    if (this.config.allowPointSelect) {
      this.data.forEach((point, idx) => {
        if (point.selected) {
          this.selectedPoints.add(idx);
        }
      });
    }

    this.group
      .on('mouseenter', () => {
        this.config.events?.mouseOver?.call(this, new Event('mouseOver'));
        this.context.events.emit('series:mouseenter', this);
        this.applyInactiveState();
      })
      .on('mouseleave', () => {
        this.config.events?.mouseOut?.call(this, new Event('mouseOut'));
        this.context.events.emit('series:mouseleave', this);
        this.clearInactiveState();
      });
  }

  setOnVisibilityChange(fn: AnimatedRedrawFn): void {
    this._onVisibilityChange = fn;
  }

  processData(): void {
    this.data = this.config._processedData || [];
    this._cachedExtents = null;
  }

  getColor(): string {
    return this.config.color || this.context.colors[this.context.colorIndex % this.context.colors.length];
  }

  abstract render(): void;

  /**
   * Animate elements to new positions after axis domain change.
   */
  animateUpdate(duration: number): void {
    this.group.selectAll('*').remove();
    this.render();
  }

  /**
   * Update context (axes, grouping info) without re-init.
   */
  updateContext(partial: Partial<SeriesContext>): void {
    Object.assign(this.context, partial);
  }

  redraw(): void {
    this.group.selectAll('*').remove();
    this.render();
  }

  setVisible(visible: boolean, animate = true): void {
    this.visible = visible;

    if (visible) {
      this.config.events?.show?.call(this, new Event('show'));
    } else {
      this.config.events?.hide?.call(this, new Event('hide'));
    }

    if (animate && this._onVisibilityChange) {
      if (!visible) {
        this.group
          .transition().duration(300)
          .attr('opacity', 0)
          .on('end', () => {
            this.group.style('display', 'none' as any);
          });
      } else {
        this.group
          .style('display', '' as any)
          .attr('opacity', 0)
          .transition().duration(300)
          .attr('opacity', this.config.opacity ?? 1);
      }

      this._onVisibilityChange(500);
    } else {
      this.group.style('display', visible ? '' : 'none');
    }

    this.context.events.emit('series:visibilityChanged', this, visible);
  }

  toggleVisible(): void {
    this.setVisible(!this.visible);
  }

  getDataExtents(): { xMin: number; xMax: number; yMin: number; yMax: number } {
    if (this._cachedExtents) return this._cachedExtents;

    let xMin = Infinity, xMax = -Infinity;
    let yMin = Infinity, yMax = -Infinity;

    for (const point of this.data) {
      if (point.x !== undefined && point.x !== null) {
        if (point.x < xMin) xMin = point.x;
        if (point.x > xMax) xMax = point.x;
      }
      if (point.y !== undefined && point.y !== null) {
        if (point.y < yMin) yMin = point.y;
        if (point.y > yMax) yMax = point.y;
      }
    }

    this._cachedExtents = { xMin, xMax, yMin, yMax };
    return this._cachedExtents;
  }

  getCategories(): string[] {
    return this.data
      .filter(p => p.name !== undefined)
      .map(p => p.name!);
  }

  destroy(): void {
    this.group?.remove();
  }

  /**
   * Replace all data in the series and optionally trigger a redraw.
   */
  setData(data: PointOptions[], redraw = true, animation = true): void {
    this.data = data;
    this.config._processedData = data;
    this._cachedExtents = null;
    if (redraw) {
      if (animation) {
        this.animateUpdate(500);
      } else {
        this.redraw();
      }
      this.context.events.emit('series:dataChanged', this);
    }
  }

  /**
   * Append a single point and optionally shift the oldest one off.
   */
  addPoint(point: PointOptions, redraw = true, shift = false, animation = true): void {
    this.data.push(point);
    this.config._processedData = this.data;
    if (shift && this.data.length > 1) {
      this.data.shift();
      this.config._processedData = this.data;
      this._cachedExtents = null;
    } else if (this._cachedExtents) {
      const ext = this._cachedExtents;
      if (point.x !== undefined && point.x !== null) {
        if (point.x < ext.xMin) ext.xMin = point.x;
        if (point.x > ext.xMax) ext.xMax = point.x;
      }
      if (point.y !== undefined && point.y !== null) {
        if (point.y < ext.yMin) ext.yMin = point.y;
        if (point.y > ext.yMax) ext.yMax = point.y;
      }
    }
    if (redraw) {
      if (animation) {
        this.animateUpdate(300);
      } else {
        this.redraw();
      }
      this.context.events.emit('series:dataChanged', this);
    }
  }

  /**
   * Batch-append multiple points and optionally shift the oldest ones off.
   */
  addPoints(points: PointOptions[], redraw = true, shift = false, animation = true): void {
    for (const point of points) {
      this.data.push(point);
    }
    if (shift && this.data.length > points.length) {
      this.data.splice(0, points.length);
    }
    this.config._processedData = this.data;
    this._cachedExtents = null;
    if (redraw) {
      if (animation) {
        this.animateUpdate(300);
      } else {
        this.redraw();
      }
      this.context.events.emit('series:dataChanged', this);
    }
  }

  /**
   * Remove a point by index.
   */
  removePoint(index: number, redraw = true, animation = true): void {
    if (index >= 0 && index < this.data.length) {
      this.data.splice(index, 1);
      this.config._processedData = this.data;
      this._cachedExtents = null;
      if (redraw) {
        if (animation) {
          this.animateUpdate(300);
        } else {
          this.redraw();
        }
        this.context.events.emit('series:dataChanged', this);
      }
    }
  }

  /**
   * Merge new options into this series config and optionally redraw.
   */
  updateSeries(options: Partial<InternalSeriesConfig>, redraw = true): void {
    Object.assign(this.config, options);
    if (options.data) {
      this.config._processedData = options.data as PointOptions[];
      this.data = this.config._processedData;
      this._cachedExtents = null;
    }
    if (redraw) {
      this.redraw();
    }
  }

  /**
   * Apply a coalesced batch of updates from the UpdateScheduler.
   * Override in subclasses for incremental rendering.
   */
  applyBatch(batch: { entries: { type: string; payload: any }[] }): void {
    for (const entry of batch.entries) {
      switch (entry.type) {
        case 'setData':
          this.data = entry.payload;
          this.config._processedData = this.data;
          break;
        case 'addPoint':
          this.data.push(entry.payload.point);
          if (entry.payload.shift && this.data.length > 1) {
            this.data.shift();
          }
          break;
        case 'addPoints':
          for (const p of entry.payload.points) {
            this.data.push(p);
          }
          if (entry.payload.shift) {
            this.data.splice(0, entry.payload.points.length);
          }
          break;
        case 'removePoint':
          if (entry.payload.index >= 0 && entry.payload.index < this.data.length) {
            this.data.splice(entry.payload.index, 1);
          }
          break;
      }
    }
    this.config._processedData = this.data;
    this._cachedExtents = null;
    this.redraw();
    this.context.events.emit('series:dataChanged', this);
  }

  show(): void {
    this.setVisible(true);
  }

  hide(): void {
    this.setVisible(false);
  }

  /**
   * Return all currently selected point indices and their data.
   */
  getSelectedPoints(): { index: number; point: PointOptions }[] {
    return Array.from(this.selectedPoints).map(idx => ({
      index: idx,
      point: this.data[idx],
    })).filter(p => p.point !== undefined);
  }

  protected applyClipPath(): void {
    const { plotArea } = this.context;
    this.clipId = `katucharts-clip-${this.config.index}-${Date.now()}`;
    const svg = this.group.select(function() { return (this as unknown as SVGElement).ownerSVGElement; }) as any;
    if (!svg.empty()) {
      let defs = svg.select('defs');
      if (defs.empty()) {
        defs = svg.append('defs');
      }
      defs.append('clipPath')
        .attr('id', this.clipId)
        .append('rect')
        .attr('x', 0)
        .attr('y', 0)
        .attr('width', plotArea.width)
        .attr('height', plotArea.height);

      this.group.attr('clip-path', `url(#${this.clipId})`);
    }
  }

  protected applyShadowFilter(): void {
    const shadow = this.config.shadow;
    if (!shadow) return;

    const filterId = `katucharts-shadow-${this.config.index}-${Date.now()}`;
    const svg = this.group.select(function() { return (this as unknown as SVGElement).ownerSVGElement; }) as any;
    if (!svg.empty()) {
      let defs = svg.select('defs');
      if (defs.empty()) defs = svg.append('defs');

      const shadowOpts = typeof shadow === 'object' ? shadow : {};
      const offsetX = shadowOpts.offsetX ?? 1;
      const offsetY = shadowOpts.offsetY ?? 1;
      const blurWidth = shadowOpts.width ?? 3;
      const shadowOpacity = shadowOpts.opacity ?? 0.15;

      const filter = defs.append('filter').attr('id', filterId);
      filter.append('feDropShadow')
        .attr('dx', offsetX)
        .attr('dy', offsetY)
        .attr('stdDeviation', blurWidth)
        .attr('flood-opacity', shadowOpacity);

      this.group.style('filter', `url(#${filterId})`);
    }
  }

  /**
   * Dim all other series when this series is hovered.
   */
  protected applyInactiveState(): void {
    const allSeries = this.context.allSeries;
    if (!allSeries || allSeries.length <= 1) return;

    const inactiveOpacity = this.config.states?.inactive?.opacity ?? 0.2;
    const dur = this.config.states?.inactive?.animation?.duration ?? 50;

    for (const other of allSeries) {
      if (other !== this && other.visible) {
        other.group
          .transition('inactive').duration(dur)
          .attr('opacity', inactiveOpacity);
      }
    }
  }

  protected clearInactiveState(): void {
    const allSeries = this.context.allSeries;
    if (!allSeries || allSeries.length <= 1) return;

    const dur = this.config.states?.normal?.animation?.duration
      ?? this.config.states?.inactive?.animation?.duration ?? 50;

    for (const other of allSeries) {
      if (other !== this && other.visible) {
        other.group
          .transition('inactive').duration(dur)
          .attr('opacity', other.config.opacity ?? 1);
      }
    }
  }

  /**
   * Emit afterAnimate event and invoke animation.complete callback at the end of the entry animation.
   */
  protected emitAfterAnimate(delay: number): void {
    const hasAfterAnimate = !!this.config.events?.afterAnimate;
    const animOpts = typeof this.config.animation === 'object' ? this.config.animation : null;
    const hasComplete = !!animOpts?.complete;

    if (hasAfterAnimate || hasComplete) {
      setTimeout(() => {
        this.config.events?.afterAnimate?.call(this, new Event('afterAnimate'));
        animOpts?.complete?.();
      }, delay);
    }
  }

  /**
   * Render data labels for all visible points based on dataLabels config.
   */
  protected renderDataLabels(
    data: PointOptions[],
    getX: (d: PointOptions, i: number) => number,
    getY: (d: PointOptions, i: number) => number
  ): void {
    const dlConfig = this.config.dataLabels;
    if (!dlConfig?.enabled) return;

    const labelsGroup = this.group.append('g').attr('class', 'katucharts-data-labels');
    const color = this.getColor();

    data.forEach((d, i) => {
      if (d.y === null || d.y === undefined) return;

      const pointDl = d.dataLabels;
      const merged = { ...dlConfig, ...pointDl };

      let text: string;
      if (merged.formatter) {
        text = merged.formatter.call({
          point: d, series: this, x: d.x ?? i, y: d.y, percentage: (d as any)._percentage,
        });
      } else if (merged.format) {
        text = stripHtmlTags(templateFormat(merged.format, {
          point: d, series: { name: this.config.name ?? '' },
        }));
      } else {
        text = String(d.y);
      }

      if (merged.filter) {
        const propVal = (d as any)[merged.filter.property ?? 'y'] ?? 0;
        const op = merged.filter.operator ?? '>';
        const threshold = merged.filter.value ?? 0;
        const pass =
          op === '>' ? propVal > threshold :
          op === '<' ? propVal < threshold :
          op === '>=' ? propVal >= threshold :
          op === '<=' ? propVal <= threshold :
          op === '==' ? propVal === threshold : true;
        if (!pass) return;
      }

      const px = getX(d, i) + (merged.x ?? 0);
      const py = getY(d, i) + (merged.y ?? -10);

      const label = labelsGroup.append('text')
        .attr('x', px)
        .attr('y', py)
        .attr('text-anchor',
          merged.align === 'left' ? 'start' :
          merged.align === 'right' ? 'end' : 'middle'
        )
        .attr('dominant-baseline',
          merged.verticalAlign === 'top' ? 'text-before-edge' :
          merged.verticalAlign === 'bottom' ? 'text-after-edge' : 'central'
        )
        .text(text);

      const style = merged.style || {};
      label
        .style('font-size', style.fontSize ?? '11px')
        .style('font-weight', style.fontWeight ?? 'bold')
        .style('fill', merged.color || style.color || '#333333');

      if (style.textOutline) {
        label.style('text-shadow', style.textOutline as string);
      }

      if (merged.rotation) {
        label.attr('transform', `rotate(${merged.rotation},${px},${py})`);
      }

      if (merged.backgroundColor || merged.borderWidth) {
        const bbox = (label.node() as SVGTextElement).getBBox?.();
        if (bbox) {
          const pad = merged.padding ?? 5;
          const br = merged.borderRadius ?? 0;
          labelsGroup.insert('rect', ':last-child')
            .attr('x', bbox.x - pad)
            .attr('y', bbox.y - pad)
            .attr('width', bbox.width + pad * 2)
            .attr('height', bbox.height + pad * 2)
            .attr('rx', br)
            .attr('fill', merged.backgroundColor || 'none')
            .attr('stroke', merged.borderColor || 'none')
            .attr('stroke-width', merged.borderWidth ?? 0);
        }
      }

      if (this.context.animate && merged.defer !== false) {
        label.attr('opacity', 0)
          .transition().delay(800).duration(300)
          .attr('opacity', 1);
      }
    });
  }

  /**
   * Handle point selection toggle when allowPointSelect is enabled.
   */
  protected handlePointSelect(
    element: Selection<any, any, any, any>,
    point: PointOptions,
    index: number,
    event: MouseEvent
  ): void {
    if (!this.config.allowPointSelect) return;

    const wasSelected = this.selectedPoints.has(index);

    if (wasSelected) {
      const shouldUnselect = point.events?.unselect?.call(point, event);
      if (shouldUnselect === false) return;
      this.selectedPoints.delete(index);
      point.selected = false;
      this.clearSelectStyle(element);
    } else {
      const shouldSelect = point.events?.select?.call(point, event);
      if (shouldSelect === false) return;
      this.selectedPoints.add(index);
      point.selected = true;
      this.applySelectStyle(element);
    }

    this.context.events.emit('point:select', { point, index, series: this, selected: !wasSelected });
  }

  protected applySelectStyle(element: Selection<any, any, any, any>): void {
    const selectState = this.config.states?.select;
    if (selectState?.color) element.attr('fill', selectState.color);
    if (selectState?.borderColor) element.attr('stroke', selectState.borderColor);
    if (selectState?.borderWidth !== undefined) element.attr('stroke-width', selectState.borderWidth);
  }

  protected clearSelectStyle(element: Selection<any, any, any, any>): void {
    element.attr('fill', null).attr('stroke', null).attr('stroke-width', null);
  }

  protected attachPointEvents(
    element: Selection<any, any, any, any>,
    point: PointOptions,
    index: number
  ): void {
    if (this.config.enableMouseTracking === false) return;

    const pointEvents = point.events || {};
    const seriesPointEvents = this.config.point?.events || {};

    element
      .on('mouseover', (event: MouseEvent) => {
        this.context.events.emit('point:mouseover', {
          point, index, series: this, event,
          plotX: this.context.xAxis.getPixelForValue(point.x ?? index),
          plotY: this.context.yAxis.getPixelForValue(point.y ?? 0),
        });
        pointEvents.mouseOver?.call(point, event);
        seriesPointEvents.mouseOver?.call(point, event);
      })
      .on('mouseout', (event: MouseEvent) => {
        this.context.events.emit('point:mouseout', { point, index, series: this, event });
        pointEvents.mouseOut?.call(point, event);
        seriesPointEvents.mouseOut?.call(point, event);
      })
      .on('click', (event: MouseEvent) => {
        this.context.events.emit('point:click', { point, index, series: this, event });
        pointEvents.click?.call(point, event);
        seriesPointEvents.click?.call(point, event);
        this.config.events?.click?.call(this, event);
        this.handlePointSelect(element, point, index, event);
      });

    element.style('cursor', this.config.cursor || 'pointer');
  }

  /**
   * Apply jitter offset to a coordinate value.
   */
  protected applyJitter(value: number, range: number, jitterAmount?: number): number {
    if (!jitterAmount) return value;
    return value + (Math.random() - 0.5) * jitterAmount * range;
  }
}

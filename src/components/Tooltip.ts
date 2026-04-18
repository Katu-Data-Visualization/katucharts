import type { TooltipOptions, PointOptions, PlotArea } from '../types/options';
import { EventBus } from '../core/EventBus';
import { templateFormat, dateFormat } from '../utils/format';
import { createDiv, removeElement } from '../utils/dom';
import { throttle } from '../utils/throttle';

export interface TooltipPointData {
  point: PointOptions;
  series: { name?: string; color?: string; config?: any };
  plotX: number;
  plotY: number;
}

export class Tooltip {
  private config: TooltipOptions;
  private container: HTMLElement;
  private plotArea: PlotArea;
  private element: HTMLDivElement | null = null;
  private splitElements: HTMLDivElement[] = [];
  private hideTimeout: ReturnType<typeof setTimeout> | null = null;
  private categories: string[] | null = null;
  private sharedPoints: TooltipPointData[] = [];
  private lastMouseEvent: MouseEvent | null = null;
  private boundHandlers: { el: EventTarget; type: string; fn: EventListener }[] = [];

  constructor(config: TooltipOptions, container: HTMLElement, plotArea: PlotArea, events: EventBus) {
    this.config = config;
    this.container = config.outside ? document.body : container;
    this.plotArea = plotArea;

    if (config.enabled === false) return;

    events.on('point:mouseover', (data: any) => this.show(data));
    events.on('point:mouseout', (data: any) => {
      if (this.config.shared && data?.series) {
        const name = data.series?.config?.name ?? data.series?.name ?? '';
        this.sharedPoints = this.sharedPoints.filter(p => p.series.name !== name);
      }
      this.scheduleHide();
    });

    if (config.followPointer) {
      const handler = throttle((e: MouseEvent) => {
        this.lastMouseEvent = e;
        if (this.element && this.element.style.display !== 'none') {
          this.positionAtMouse(e);
        }
      }, 16);
      container.addEventListener('mousemove', handler as EventListener);
      this.boundHandlers.push({ el: container, type: 'mousemove', fn: handler as EventListener });
    }

    if (config.stickOnContact) {
      const handler = throttle((e: MouseEvent) => {
        if (this.element && this.element.style.display !== 'none') {
          const rect = this.element.getBoundingClientRect();
          const inside = e.clientX >= rect.left && e.clientX <= rect.right &&
                         e.clientY >= rect.top && e.clientY <= rect.bottom;
          if (inside && this.hideTimeout) {
            clearTimeout(this.hideTimeout);
            this.hideTimeout = null;
          }
        }
      }, 16);
      container.addEventListener('mousemove', handler as EventListener);
      this.boundHandlers.push({ el: container, type: 'mousemove', fn: handler as EventListener });
    }

    if (config.followTouchMove !== false) {
      const handler = throttle((e: TouchEvent) => {
        if (this.element && this.element.style.display !== 'none' && e.touches.length === 1) {
          const touch = e.touches[0];
          const containerRect = container.getBoundingClientRect();
          const dist = this.config.distance ?? 16;
          let x = touch.clientX - containerRect.left + dist;
          let y = touch.clientY - containerRect.top - 10;
          const elWidth = this.element.offsetWidth || 120;
          if (x + elWidth > containerRect.width) x = touch.clientX - containerRect.left - elWidth - dist;
          if (y < 0) y = 5;
          this.element.style.left = `${x}px`;
          this.element.style.top = `${y}px`;
        }
      }, 16);
      container.addEventListener('touchmove', handler as EventListener, { passive: true });
      this.boundHandlers.push({ el: container, type: 'touchmove', fn: handler as EventListener });
    }
  }

  show(rawData: any): void {
    if (this.config.enabled === false) return;
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }

    const pointWithIndex = rawData.index !== undefined
      ? { ...rawData.point, index: rawData.index }
      : rawData.point;

    const data: TooltipPointData = {
      point: pointWithIndex,
      plotX: rawData.plotX,
      plotY: rawData.plotY,
      series: {
        name: rawData.series?.config?.name ?? rawData.series?.name ?? '',
        color: rawData.series?.getColor?.() ?? rawData.series?.color ?? '#333',
        config: rawData.series?.config,
      },
    };

    if (this.config.shared) {
      const currentX = data.point.x ?? data.plotX;
      const staleX = this.sharedPoints.length > 0 &&
        (this.sharedPoints[0].point.x ?? this.sharedPoints[0].plotX) !== currentX;
      if (staleX) {
        this.sharedPoints = [];
      }
      const existingIdx = this.sharedPoints.findIndex(
        p => p.series.name === data.series.name
      );
      if (existingIdx >= 0) {
        this.sharedPoints[existingIdx] = data;
      } else {
        this.sharedPoints.push(data);
      }
    }

    if (this.config.split) {
      this.showSplit(data);
      return;
    }

    if (!this.element) {
      this.element = this.createElement();
    }

    if (this.config.stickOnContact) {
      this.element.style.pointerEvents = 'auto';
    }

    if (this.config.borderColor === undefined) {
      const autoColor = data.point.color || data.series.color || '#333';
      this.element.style.borderColor = autoColor;
    }

    if (this.config.shared && this.sharedPoints.length > 0) {
      this.element.innerHTML = this.formatSharedContent(this.sharedPoints);
    } else {
      this.element.innerHTML = this.formatContent(data);
    }

    if (this.config.followPointer && this.lastMouseEvent) {
      this.positionAtMouse(this.lastMouseEvent);
    } else {
      this.position(data);
    }

    this.element.style.display = 'block';

    if (this.config.animation !== false) {
      this.element.style.opacity = '1';
    } else {
      this.element.style.transition = 'none';
      this.element.style.opacity = '1';
    }
  }

  hide(): void {
    if (this.element) {
      this.element.style.opacity = '0';
      this.element.style.display = 'none';
    }
    this.hideSplitElements();
    this.sharedPoints = [];
  }

  private scheduleHide(): void {
    const delay = this.config.hideDelay ?? 500;
    this.hideTimeout = setTimeout(() => this.hide(), delay);
  }

  private showSplit(data: TooltipPointData): void {
    this.hideSplitElements();

    const content = this.formatContent(data);
    if (!content) return;

    const el = this.createSplitElement(data.series.color || '#333');
    el.innerHTML = content;

    const dist = this.config.distance ?? 16;
    const plotOffset = this.plotArea;
    const x = plotOffset.x + data.plotX + dist;
    const y = plotOffset.y + data.plotY;

    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.display = 'block';
    el.style.opacity = '1';

    this.splitElements.push(el);
  }

  private hideSplitElements(): void {
    for (const el of this.splitElements) {
      removeElement(el);
    }
    this.splitElements = [];
  }

  private createSplitElement(borderColor: string): HTMLDivElement {
    const el = createDiv('katucharts-tooltip-split', this.container);
    const bgColor = this.config.backgroundColor || 'rgba(247,247,247,0.85)';
    const borderRadius = this.config.borderRadius ?? 3;
    const padding = this.config.padding ?? 8;

    Object.assign(el.style, {
      position: 'absolute',
      pointerEvents: 'none',
      zIndex: String(this.config.zIndex ?? 10),
      backgroundColor: bgColor,
      border: `${this.config.borderWidth ?? 1}px solid ${borderColor}`,
      borderRadius: `${borderRadius}px`,
      padding: `${padding}px`,
      fontSize: this.config.style?.fontSize || '12px',
      color: this.config.style?.color || '#333333',
      boxShadow: this.config.shadow !== false ? '2px 2px 6px rgba(0,0,0,0.15)' : 'none',
      transition: this.config.animation !== false ? 'opacity 0.15s' : 'none',
      whiteSpace: 'nowrap',
      display: 'none',
    });

    return el;
  }

  private createElement(): HTMLDivElement {
    const el = createDiv(
      `katucharts-tooltip${this.config.className ? ' ' + this.config.className : ''}`,
      this.container
    );
    const bgColor = this.config.backgroundColor || 'rgba(247,247,247,0.85)';
    const borderRadius = this.config.borderRadius ?? 3;
    const padding = this.config.padding ?? 8;
    const shape = this.config.shape || 'callout';

    let borderRadiusCss = `${borderRadius}px`;
    if (shape === 'circle') {
      borderRadiusCss = '50%';
    }

    Object.assign(el.style, {
      position: this.config.outside ? 'fixed' : 'absolute',
      pointerEvents: this.config.stickOnContact ? 'auto' : 'none',
      zIndex: String(this.config.zIndex ?? 10),
      backgroundColor: bgColor,
      border: `${this.config.borderWidth ?? 1}px solid ${this.config.borderColor || '#ccc'}`,
      borderRadius: borderRadiusCss,
      padding: `${padding}px`,
      fontSize: this.config.style?.fontSize || '12px',
      color: this.config.style?.color || '#333333',
      boxShadow: this.config.shadow !== false ? '2px 2px 6px rgba(0,0,0,0.15)' : 'none',
      transition: this.config.animation !== false ? 'opacity 0.15s' : 'none',
      whiteSpace: 'nowrap',
      display: 'none',
    });

    return el;
  }

  private formatValue(val: number | null | undefined): string {
    if (val === null || val === undefined) return '';
    let str: string;
    if (this.config.valueDecimals !== undefined) {
      str = val.toFixed(this.config.valueDecimals);
    } else {
      str = String(val);
    }
    const prefix = this.config.valuePrefix || '';
    const suffix = this.config.valueSuffix || '';
    return `${prefix}${str}${suffix}`;
  }

  private resolveKey(data: TooltipPointData): string | number {
    let key: string | number = data.point.name ?? data.point.x ?? '';
    if (this.categories && typeof data.point.x === 'number' && this.categories[data.point.x]) {
      key = this.categories[data.point.x];
    }
    return key;
  }

  private getPointCategory(point: PointOptions): string | number | undefined {
    if ((point as any).category !== undefined) return (point as any).category;
    if (this.categories && typeof point.x === 'number' && this.categories[point.x] !== undefined) {
      return this.categories[point.x];
    }
    return point.name;
  }

  private buildFormatterPoint(data: TooltipPointData, overrides: Record<string, unknown> = {}): any {
    const key = this.resolveKey(data);
    const category = this.getPointCategory(data.point);
    return {
      ...data.point,
      ...overrides,
      key,
      category,
      color: data.point.color || data.series.color || '#333',
      series: {
        name: data.series.name || '',
        color: data.series.color || '#333',
      },
    };
  }

  private buildFormatterContext(
    data: TooltipPointData,
    extras: Record<string, unknown> = {}
  ): {
    point: any;
    series: any;
    x: any;
    y: any;
    percentage?: number;
    total?: number;
    key?: any;
    color?: string;
    points?: any[];
  } {
    const key = this.resolveKey(data);
    return {
      point: this.buildFormatterPoint(data),
      series: data.series,
      x: data.point.x,
      y: data.point.y,
      percentage: (data.point as any).percentage,
      total: (data.point as any).total,
      key,
      color: data.point.color || data.series.color,
      ...extras,
    };
  }

  private formatContent(data: TooltipPointData): string {
    const seriesTooltip = data.series.config?.tooltip as TooltipOptions | undefined;

    if (data.point.y === null || data.point.y === undefined) {
      const nullFmt = seriesTooltip?.nullFormatter ?? this.config.nullFormatter;
      const nullFmtStr = seriesTooltip?.nullFormat ?? this.config.nullFormat;
      if (nullFmt) {
        return nullFmt.call({
          point: data.point,
          series: data.series,
        });
      }
      if (nullFmtStr) {
        return nullFmtStr;
      }
    }

    if (this.config.formatter) {
      const result = this.config.formatter.call(this.buildFormatterContext(data));
      if (result === false) return '';
      return result;
    }

    const key = this.resolveKey(data);
    const pointName = data.point.name
      ?? (this.categories && typeof data.point.x === 'number' ? this.categories[data.point.x] : undefined)
      ?? key;

    const mergedDecimals = seriesTooltip?.valueDecimals ?? this.config.valueDecimals;
    const mergedPrefix = seriesTooltip?.valuePrefix ?? this.config.valuePrefix ?? '';
    const mergedSuffix = seriesTooltip?.valueSuffix ?? this.config.valueSuffix ?? '';
    const formattedY = this.formatValueWith(data.point.y, mergedDecimals, mergedPrefix, mergedSuffix);

    let formattedX: string | number = pointName;
    const xDateFmt = seriesTooltip?.xDateFormat ?? this.config.xDateFormat;
    if (xDateFmt && typeof data.point.x === 'number') {
      formattedX = dateFormat(xDateFmt, data.point.x);
    }

    const context = {
      point: this.buildFormatterPoint(data, {
        name: pointName,
        key: formattedX,
        y: formattedY || data.point.y,
      }),
      series: {
        ...data.series,
        name: data.series.name || '',
      },
    };

    const pointFormatter = seriesTooltip?.pointFormatter ?? this.config.pointFormatter;
    if (pointFormatter) {
      const pointBody = pointFormatter.call(this.buildFormatterContext(data));
      const headerFmt = seriesTooltip?.headerFormat ?? this.config.headerFormat ?? '';
      const footerFmt = seriesTooltip?.footerFormat ?? this.config.footerFormat ?? '';
      return templateFormat(headerFmt, context) + pointBody + templateFormat(footerFmt, context);
    }

    if (this.config.format) {
      return templateFormat(this.config.format, context);
    }

    const headerFmt = seriesTooltip?.headerFormat ?? this.config.headerFormat ?? '';
    const pointFmt = seriesTooltip?.pointFormat ?? this.config.pointFormat ?? '';
    const footerFmt = seriesTooltip?.footerFormat ?? this.config.footerFormat ?? '';

    const header = templateFormat(headerFmt, context);
    const body = templateFormat(pointFmt, context);
    const footer = templateFormat(footerFmt, context);

    let totalLine = '';
    const hasCustomPointFmt = !!(seriesTooltip?.pointFormat ?? this.config.pointFormat);
    if ((data.point as any).total !== undefined && !footerFmt && !hasCustomPointFmt) {
      const raw = (data.point as any).total as number;
      const rounded = Math.round(raw * 1e6) / 1e6;
      const totalVal = this.formatValue(rounded);
      totalLine = `<span style="font-size:10px">Total: <b>${totalVal}</b></span><br/>`;
    }

    return header + body + footer + totalLine;
  }

  private formatValueWith(val: number | null | undefined, decimals?: number, prefix?: string, suffix?: string): string {
    if (val === null || val === undefined) return '';
    let str: string;
    if (decimals !== undefined) {
      str = val.toFixed(decimals);
    } else {
      str = String(val);
    }
    return `${prefix || ''}${str}${suffix || ''}`;
  }

  private formatSharedContent(points: TooltipPointData[]): string {
    if (this.config.formatter) {
      const first = points[0];
      const key = first ? this.resolveKey(first) : '';
      const result = this.config.formatter.call({
        point: first ? this.buildFormatterPoint(first) : undefined,
        series: first?.series,
        x: first?.point.x,
        y: first?.point.y,
        key,
        color: first?.point.color || first?.series.color,
        points: points.map(p => ({
          point: this.buildFormatterPoint(p),
          series: p.series,
          x: p.point.x,
          y: p.point.y,
          percentage: (p.point as any).percentage,
          total: (p.point as any).total,
          key: this.resolveKey(p),
          color: p.point.color || p.series.color,
        })),
      });
      if (result === false) return '';
      return result;
    }

    const parts: string[] = [];

    const firstPoint = points[0]?.point;
    let headerKey = firstPoint?.name ?? firstPoint?.x ?? '';
    if (this.categories && typeof firstPoint?.x === 'number' && this.categories[firstPoint.x]) {
      headerKey = this.categories[firstPoint.x];
    }
    if (headerKey !== '') {
      parts.push(`<span style="font-size:10px">${headerKey}</span><br/>`);
    }

    for (const p of points) {
      const color = p.point.color || p.series.color || '#333';
      const name = p.series.name || '';
      const formattedY = this.formatValue(p.point.y);
      parts.push(
        `<span style="color:${color}">\u25CF</span> ${name}: <b>${formattedY}</b><br/>`
      );
    }

    return parts.join('');
  }

  private position(data: TooltipPointData): void {
    if (!this.element) return;

    if (this.config.positioner) {
      const pos = this.config.positioner(
        this.element.offsetWidth,
        this.element.offsetHeight,
        data
      );
      this.element.style.left = `${pos.x}px`;
      this.element.style.top = `${pos.y}px`;
      return;
    }

    const dist = this.config.distance ?? 16;
    const plotOffset = this.plotArea;
    let x = plotOffset.x + data.plotX + dist;
    let y = plotOffset.y + data.plotY - 10;

    const elWidth = this.element.offsetWidth || 120;
    const elHeight = this.element.offsetHeight || 50;
    const containerWidth = this.config.outside ? window.innerWidth : (this.container.offsetWidth || this.container.parentElement?.offsetWidth || 800);
    const containerHeight = this.config.outside ? window.innerHeight : (this.container.offsetHeight || this.container.parentElement?.offsetHeight || 600);

    if (x + elWidth > containerWidth) {
      x = plotOffset.x + data.plotX - elWidth - dist;
    }
    if (y + elHeight > containerHeight) {
      y = containerHeight - elHeight - 5;
    }
    if (y < 0) y = 5;
    if (x < 0) x = 5;

    this.element.style.left = `${x}px`;
    this.element.style.top = `${y}px`;
  }

  private positionAtMouse(event: MouseEvent): void {
    if (!this.element) return;

    const dist = this.config.distance ?? 16;

    if (this.config.outside) {
      let x = event.clientX + dist;
      let y = event.clientY - 10;
      const elWidth = this.element.offsetWidth || 120;
      const elHeight = this.element.offsetHeight || 50;

      if (x + elWidth > window.innerWidth) x = event.clientX - elWidth - dist;
      if (y + elHeight > window.innerHeight) y = window.innerHeight - elHeight - 5;
      if (y < 0) y = 5;
      if (x < 0) x = 5;

      this.element.style.left = `${x}px`;
      this.element.style.top = `${y}px`;
      return;
    }

    const containerRect = this.container.getBoundingClientRect();
    let x = event.clientX - containerRect.left + dist;
    let y = event.clientY - containerRect.top - 10;

    const elWidth = this.element.offsetWidth || 120;
    const elHeight = this.element.offsetHeight || 50;

    if (x + elWidth > containerRect.width) {
      x = event.clientX - containerRect.left - elWidth - dist;
    }
    if (y + elHeight > containerRect.height) {
      y = containerRect.height - elHeight - 5;
    }
    if (y < 0) y = 5;
    if (x < 0) x = 5;

    this.element.style.left = `${x}px`;
    this.element.style.top = `${y}px`;
  }

  updatePlotArea(plotArea: PlotArea): void {
    this.plotArea = plotArea;
  }

  setCategories(categories: string[]): void {
    this.categories = categories;
  }

  destroy(): void {
    if (this.hideTimeout) clearTimeout(this.hideTimeout);
    for (const { el, type, fn } of this.boundHandlers) {
      el.removeEventListener(type, fn);
    }
    this.boundHandlers = [];
    removeElement(this.element);
    this.element = null;
    this.hideSplitElements();
  }
}

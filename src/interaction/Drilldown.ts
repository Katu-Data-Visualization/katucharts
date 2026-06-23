import type { DrilldownOptions, SeriesOptions } from '../types/options';
import { EventBus } from '../core/EventBus';

interface DrilldownLevel {
  seriesOptions: SeriesOptions[];
  title?: string;
}

export class Drilldown {
  private config: DrilldownOptions;
  private events: EventBus;
  private stack: DrilldownLevel[] = [];
  private drilldownMap: Map<string, SeriesOptions>;
  private breadcrumbsEl: HTMLDivElement | null = null;
  private container: HTMLElement | null = null;
  private pointClickHandler: (data: any) => void;

  constructor(config: DrilldownOptions, events: EventBus, container?: HTMLElement) {
    this.config = config;
    this.events = events;
    this.container = container || null;
    this.drilldownMap = new Map();

    if (config.series) {
      for (const s of config.series) {
        if (s.id) this.drilldownMap.set(s.id, s);
      }
    }

    this.pointClickHandler = (data: any) => {
      const drilldownId = data.point.drilldown;
      if (drilldownId && this.drilldownMap.has(drilldownId)) {
        this.drillDown(drilldownId, data);
      }
    };
    events.on('point:click', this.pointClickHandler);
  }

  addSeriesAsDrilldown(point: any, seriesOptions: SeriesOptions): void {
    if (seriesOptions.id) {
      this.drilldownMap.set(seriesOptions.id, seriesOptions);
    }

    const drilldownId = point.drilldown || seriesOptions.id;
    if (drilldownId) {
      this.drillDown(drilldownId, { point, series: {} });
    }
  }

  private drillDown(id: string, sourceData: any): void {
    const targetSeries = this.drilldownMap.get(id);
    if (!targetSeries) return;

    this.stack.push({
      seriesOptions: sourceData.series?.config ? [sourceData.series.config] : [],
      title: sourceData.point?.name,
    });

    this.events.emit('drilldown:drilldown', {
      point: sourceData.point,
      seriesOptions: targetSeries,
    });

    this.updateBreadcrumbs();
  }

  drillUp(): void {
    const level = this.stack.pop();
    if (level) {
      this.events.emit('drilldown:drillup', level);
      this.updateBreadcrumbs();
    }
  }

  drillUpToLevel(targetLevel: number): void {
    while (this.stack.length > targetLevel) {
      this.drillUp();
    }
  }

  hasLevels(): boolean {
    return this.stack.length > 0;
  }

  getCurrentLevel(): number {
    return this.stack.length;
  }

  private get breadcrumbsConfig(): Exclude<DrilldownOptions['breadcrumbs'], false | undefined> {
    const bc = this.config.breadcrumbs;
    return bc && typeof bc === 'object' ? bc : {};
  }

  private isBreadcrumbsEnabled(): boolean {
    const bc = this.config.breadcrumbs;
    if (bc === false) return false;
    if (bc && typeof bc === 'object' && bc.enabled === false) return false;
    return true;
  }

  /**
   * Renders breadcrumb navigation trail for drilldown levels. Shown by default once
   * a drill happens; suppress via `drilldown.breadcrumbs: false` or `{ enabled: false }`.
   * Renders a back arrow and clickable path ("\u25C0 Root / Level"), or a single back button
   * when `showFullPath` is false. Positioned as floating overlay to avoid layout shifts.
   */
  private updateBreadcrumbs(): void {
    if (!this.container || !this.isBreadcrumbsEnabled()) return;

    const bc = this.breadcrumbsConfig;
    const floating = bc.floating !== false;

    if (!this.breadcrumbsEl) {
      this.breadcrumbsEl = document.createElement('div');
      this.breadcrumbsEl.className = 'katucharts-breadcrumbs';
      const pos = bc.position || {};
      if (floating) {
        const cs = getComputedStyle(this.container);
        if (cs.position === 'static') this.container.style.position = 'relative';
      }
      Object.assign(this.breadcrumbsEl.style, {
        position: floating ? 'absolute' : 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '3px 10px',
        borderRadius: '999px',
        fontSize: (bc.style?.fontSize as string) || '12px',
        fontWeight: (bc.style?.fontWeight as string) || '500',
        lineHeight: '1.4',
        color: (bc.style?.color as string) || '#1b1a15',
        background: (bc.style?.background as string) || 'rgba(255,255,255,0.86)',
        boxShadow: (bc.style?.boxShadow as string) || '0 1px 3px rgba(27,26,21,0.18)',
        zIndex: '10',
        top: floating ? `${pos.y ?? 8}px` : '',
        left: floating ? `${pos.x ?? 8}px` : '',
        userSelect: 'none',
      });
      this.container.appendChild(this.breadcrumbsEl);
    }

    this.breadcrumbsEl.innerHTML = '';

    if (this.stack.length === 0) {
      this.breadcrumbsEl.style.display = 'none';
      return;
    }

    this.breadcrumbsEl.style.display = 'flex';

    const linkColor = (bc.style?.linkColor as string) || '#003399';
    const separator = bc.separator?.text ?? '/';
    const separatorStyle = bc.separator?.style || {};
    const showFullPath = bc.showFullPath !== false;
    const showBackButton = bc.showBackButton !== false;
    const rootText = bc.rootText ?? 'Main';

    const addBackArrow = (onClick: () => void) => {
      const arrow = document.createElement('span');
      arrow.textContent = '\u25C0';
      arrow.setAttribute('role', 'button');
      arrow.setAttribute('aria-label', 'Drill up');
      Object.assign(arrow.style, {
        cursor: 'pointer',
        color: linkColor,
        fontSize: '0.8em',
        lineHeight: '1',
        transition: 'opacity 120ms ease',
      });
      arrow.addEventListener('mouseenter', () => { arrow.style.opacity = '0.55'; });
      arrow.addEventListener('mouseleave', () => { arrow.style.opacity = '1'; });
      arrow.addEventListener('click', onClick);
      this.breadcrumbsEl!.appendChild(arrow);
    };

    const addCrumb = (text: string, level: number, isLink: boolean) => {
      const span = document.createElement('span');
      span.textContent = text;
      if (isLink) {
        Object.assign(span.style, {
          cursor: 'pointer',
          color: linkColor,
          transition: 'opacity 120ms ease',
        });
        span.addEventListener('mouseenter', () => { span.style.textDecoration = 'underline'; });
        span.addEventListener('mouseleave', () => { span.style.textDecoration = 'none'; });
        span.addEventListener('click', () => {
          if (bc.events?.click) bc.events.click.call(this, { level });
          this.drillUpToLevel(level);
        });
      }
      this.breadcrumbsEl!.appendChild(span);
    };

    const addSeparator = () => {
      const sep = document.createElement('span');
      sep.textContent = separator;
      sep.style.opacity = '0.55';
      if (separatorStyle.color) sep.style.color = separatorStyle.color as string;
      this.breadcrumbsEl!.appendChild(sep);
    };

    if (showFullPath) {
      if (showBackButton) addBackArrow(() => this.drillUp());
      addCrumb(rootText, 0, true);
      for (let i = 0; i < this.stack.length; i++) {
        addSeparator();
        const isLast = i === this.stack.length - 1;
        const label = this.getCrumbLabel(i);
        addCrumb(label, i + 1, !isLast);
      }
    } else {
      addBackArrow(() => this.drillUp());
      const backText = document.createElement('span');
      backText.textContent = 'Back';
      backText.style.cursor = 'pointer';
      backText.style.color = linkColor;
      backText.addEventListener('click', () => this.drillUp());
      this.breadcrumbsEl.appendChild(backText);
    }
  }

  private getCrumbLabel(index: number): string {
    const level = this.stack[index];
    const bc = this.breadcrumbsConfig;
    if (bc.formatter) {
      return bc.formatter.call({ level: index, levelOptions: level });
    }
    return level.title || `Level ${index + 1}`;
  }

  destroy(): void {
    this.events.off('point:click', this.pointClickHandler);
    if (this.breadcrumbsEl) {
      this.breadcrumbsEl.remove();
      this.breadcrumbsEl = null;
    }
  }
}

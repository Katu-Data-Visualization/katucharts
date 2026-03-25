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

  private updateBreadcrumbs(): void {
    if (!this.config.breadcrumbs || !this.container) return;

    if (!this.breadcrumbsEl) {
      this.breadcrumbsEl = document.createElement('div');
      this.breadcrumbsEl.className = 'katucharts-breadcrumbs';
      const pos = this.config.breadcrumbs.position || {};
      Object.assign(this.breadcrumbsEl.style, {
        position: this.config.breadcrumbs.floating ? 'absolute' : 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '4px 8px',
        fontSize: (this.config.breadcrumbs.style?.fontSize as string) || '12px',
        color: (this.config.breadcrumbs.style?.color as string) || '#333',
        zIndex: '10',
        top: pos.y !== undefined ? `${pos.y}px` : '',
        left: pos.x !== undefined ? `${pos.x}px` : '',
      });
      this.container.appendChild(this.breadcrumbsEl);
    }

    this.breadcrumbsEl.innerHTML = '';

    if (this.stack.length === 0) {
      this.breadcrumbsEl.style.display = 'none';
      return;
    }

    this.breadcrumbsEl.style.display = 'flex';
    const separator = this.config.breadcrumbs.separator?.text ?? ' / ';
    const separatorStyle = this.config.breadcrumbs.separator?.style || {};
    const showFullPath = this.config.breadcrumbs.showFullPath !== false;

    const addCrumb = (text: string, level: number, isLink: boolean) => {
      const span = document.createElement('span');
      span.textContent = text;
      if (isLink) {
        span.style.cursor = 'pointer';
        span.style.color = '#003399';
        span.style.textDecoration = 'underline';
        span.addEventListener('click', () => {
          if (this.config.breadcrumbs?.events?.click) {
            this.config.breadcrumbs.events.click.call(this, { level });
          }
          this.drillUpToLevel(level);
        });
      }
      this.breadcrumbsEl!.appendChild(span);
    };

    const addSeparator = () => {
      const sep = document.createElement('span');
      sep.textContent = separator;
      if (separatorStyle.color) sep.style.color = separatorStyle.color as string;
      this.breadcrumbsEl!.appendChild(sep);
    };

    if (showFullPath) {
      addCrumb('Main', 0, true);
      for (let i = 0; i < this.stack.length; i++) {
        addSeparator();
        const isLast = i === this.stack.length - 1;
        const label = this.getCrumbLabel(i);
        addCrumb(label, i + 1, !isLast);
      }
    } else {
      const backBtn = document.createElement('span');
      backBtn.textContent = '\u25C0 Back';
      backBtn.style.cursor = 'pointer';
      backBtn.style.color = '#003399';
      backBtn.addEventListener('click', () => this.drillUp());
      this.breadcrumbsEl.appendChild(backBtn);
    }
  }

  private getCrumbLabel(index: number): string {
    const level = this.stack[index];
    if (this.config.breadcrumbs?.formatter) {
      return this.config.breadcrumbs.formatter.call({
        level: index,
        levelOptions: level,
      });
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

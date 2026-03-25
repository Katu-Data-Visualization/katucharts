import { Selection } from 'd3-selection';
import type { AccessibilityOptions } from '../types/options';
import type { BaseSeries } from '../series/BaseSeries';

export class A11yModule {
  private config: AccessibilityOptions;

  constructor(config: AccessibilityOptions) {
    this.config = config;
  }

  private lastSeriesCount = 0;
  private lastPointCounts: number[] = [];

  apply(
    svg: Selection<SVGSVGElement, unknown, null, undefined>,
    series: BaseSeries[],
    chartTitle?: string
  ): void {
    if (this.config.enabled === false) return;

    const verbosity = this.config.landmarkVerbosity || 'all';

    svg.attr('role', 'img');
    if (chartTitle) {
      svg.attr('aria-label', this.config.description || `Chart: ${chartTitle}`);
    }

    const descId = 'katucharts-desc-' + Math.random().toString(36).slice(2, 8);
    svg.append('desc')
      .attr('id', descId)
      .text(this.config.description || this.generateDescription(series, chartTitle));
    svg.attr('aria-describedby', descId);

    svg.attr('tabindex', '0');
    svg.style('outline', 'none');

    this.renderScreenReaderSections(svg, series, chartTitle);
    this.applyLandmarks(svg, series, verbosity);

    if (this.config.keyboardNavigation?.enabled !== false) {
      this.setupKeyboardNav(svg, series);
    }

    if (this.config.announceNewData?.enabled) {
      this.setupAnnounceNewData(series);
    }
  }

  private setupAnnounceNewData(series: BaseSeries[]): void {
    const minInterval = this.config.announceNewData?.minAnnounceInterval ?? 5000;
    let lastAnnounce = 0;

    this.lastSeriesCount = series.length;
    this.lastPointCounts = series.map(s => s.data.length);

    const check = () => {
      const now = Date.now();
      if (now - lastAnnounce < minInterval) return;

      let changed = false;
      let message = '';

      if (series.length !== this.lastSeriesCount) {
        changed = true;
        message = `Chart updated. Now showing ${series.length} data series.`;
      } else {
        for (let i = 0; i < series.length; i++) {
          const current = series[i].data.length;
          const prev = this.lastPointCounts[i] ?? 0;
          if (current !== prev) {
            changed = true;
            const diff = current - prev;
            message = `${series[i].config.name || 'Series'} updated with ${Math.abs(diff)} ${diff > 0 ? 'new' : 'fewer'} point${Math.abs(diff) !== 1 ? 's' : ''}. Total: ${current}.`;
            break;
          }
        }
      }

      if (changed) {
        this.announce(message);
        lastAnnounce = now;
        this.lastSeriesCount = series.length;
        this.lastPointCounts = series.map(s => s.data.length);
      }
    };

    setInterval(check, Math.max(1000, minInterval / 2));
  }

  private renderScreenReaderSections(
    svg: Selection<SVGSVGElement, unknown, null, undefined>,
    series: BaseSeries[],
    title?: string
  ): void {
    const srSection = this.config.screenReaderSection;
    const container = svg.node()?.parentElement;
    if (!container) return;

    if (srSection?.beforeChartFormat) {
      const before = this.createScreenReaderDiv(
        this.formatSectionTemplate(srSection.beforeChartFormat, series, title)
      );
      container.insertBefore(before, svg.node());
    }

    if (srSection?.afterChartFormat) {
      const after = this.createScreenReaderDiv(
        this.formatSectionTemplate(srSection.afterChartFormat, series, title)
      );
      container.appendChild(after);
    }
  }

  private createScreenReaderDiv(content: string): HTMLDivElement {
    const div = document.createElement('div');
    div.className = 'katucharts-screen-reader-region';
    div.setAttribute('role', 'region');
    div.setAttribute('aria-label', 'Chart information');
    div.innerHTML = content;
    Object.assign(div.style, {
      position: 'absolute', width: '1px', height: '1px',
      overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap',
    });
    return div;
  }

  private formatSectionTemplate(template: string, series: BaseSeries[], title?: string): string {
    return template
      .replace('{chartTitle}', title || 'Chart')
      .replace('{numSeries}', String(series.length))
      .replace('{seriesList}', series.map(s => s.config.name || 'Series').join(', '));
  }

  private applyLandmarks(
    svg: Selection<SVGSVGElement, unknown, null, undefined>,
    series: BaseSeries[],
    verbosity: 'all' | 'one' | 'disabled'
  ): void {
    if (verbosity === 'disabled') return;

    if (verbosity === 'one') {
      svg.attr('role', 'region');
      return;
    }

    svg.selectAll('.katucharts-legend').attr('role', 'region').attr('aria-label', 'Chart legend');

    const seriesConfig = this.config.series;
    const describeSingle = seriesConfig?.describeSingleSeries ?? false;

    if (series.length === 1 && !describeSingle) return;

    series.forEach((s, i) => {
      const groupNode = (s as any).group;
      if (groupNode) {
        const name = s.config.name || `Series ${i + 1}`;
        const descFormat = seriesConfig?.descriptionFormat;
        const desc = descFormat
          ? descFormat.replace('{name}', name).replace('{index}', String(i))
          : `${name}, ${s.data.length} data points`;

        groupNode.attr('role', 'region')
          .attr('aria-label', desc);
      }
    });
  }

  private generateDescription(series: BaseSeries[], title?: string): string {
    const parts: string[] = [];
    if (title) parts.push(`${title}.`);
    parts.push(`Chart with ${series.length} data series.`);

    for (const s of series) {
      const name = s.config.name || `Series ${s.config.index + 1}`;
      const count = s.data.length;
      parts.push(`${name}: ${count} data points.`);
    }

    return parts.join(' ');
  }

  private setupKeyboardNav(
    svg: Selection<SVGSVGElement, unknown, null, undefined>,
    series: BaseSeries[]
  ): void {
    let currentSeries = 0;
    let currentPoint = 0;

    svg.on('keydown', (event: KeyboardEvent) => {
      const s = series[currentSeries];
      if (!s) return;

      switch (event.key) {
        case 'ArrowRight':
          event.preventDefault();
          currentPoint = Math.min(currentPoint + 1, s.data.length - 1);
          this.announcePoint(s, currentPoint);
          break;
        case 'ArrowLeft':
          event.preventDefault();
          currentPoint = Math.max(currentPoint - 1, 0);
          this.announcePoint(s, currentPoint);
          break;
        case 'ArrowUp':
          event.preventDefault();
          currentSeries = Math.max(currentSeries - 1, 0);
          currentPoint = 0;
          this.announceSeries(series[currentSeries]);
          break;
        case 'ArrowDown':
          event.preventDefault();
          currentSeries = Math.min(currentSeries + 1, series.length - 1);
          currentPoint = 0;
          this.announceSeries(series[currentSeries]);
          break;
        case 'Enter':
        case ' ':
          event.preventDefault();
          this.announcePoint(s, currentPoint);
          break;
      }
    });
  }

  private announcePoint(series: BaseSeries, index: number): void {
    const point = series.data[index];
    if (!point) return;

    let text: string;

    if (this.config.point?.descriptionFormatter) {
      text = this.config.point.descriptionFormatter(point);
    } else if (this.config.point?.valueDescriptionFormat) {
      text = this.config.point.valueDescriptionFormat
        .replace('{index}', String(index + 1))
        .replace('{value}', String(point.y ?? ''))
        .replace('{xDescription}', point.name || String(point.x ?? ''))
        .replace('{point.name}', point.name || '')
        .replace('{point.y}', String(point.y ?? ''))
        .replace('{point.x}', String(point.x ?? ''))
        .replace('{series.name}', series.config.name || 'Series');
    } else {
      text = `${series.config.name || 'Series'}, point ${index + 1}: ` +
        `${point.name ? point.name + ', ' : ''}value ${point.y}`;
    }

    this.announce(text);
  }

  private announceSeries(series: BaseSeries): void {
    const text = `${series.config.name || 'Series'}, ${series.data.length} points`;
    this.announce(text);
  }

  private announce(text: string): void {
    let announcer = document.getElementById('katucharts-announcer');
    if (!announcer) {
      announcer = document.createElement('div');
      announcer.id = 'katucharts-announcer';
      announcer.setAttribute('role', 'status');
      announcer.setAttribute('aria-live', 'polite');
      announcer.setAttribute('aria-atomic', 'true');
      Object.assign(announcer.style, {
        position: 'absolute', width: '1px', height: '1px',
        overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap',
      });
      document.body.appendChild(announcer);
    }
    announcer.textContent = text;
  }
}

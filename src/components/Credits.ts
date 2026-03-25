import { Selection } from 'd3-selection';
import { LicenseManager } from '../license/LicenseManager';
import type { CreditsOptions } from '../types/options';

const DEFAULT_TEXT = 'Powered by: KatuCharts';
const DEFAULT_HREF = 'https://charts.katudv.com';

export class Credits {
  private element: Selection<SVGTextElement, unknown, null, undefined> | null = null;
  private observer: MutationObserver | null = null;
  private intervalId: number | null = null;
  private svg: Selection<SVGSVGElement, unknown, null, undefined>;
  private chartWidth: number;
  private chartHeight: number;

  constructor(
    config: CreditsOptions,
    svg: Selection<SVGSVGElement, unknown, null, undefined>,
    chartWidth: number,
    chartHeight: number
  ) {
    this.svg = svg;
    this.chartWidth = chartWidth;
    this.chartHeight = chartHeight;

    if (config.enabled === false && LicenseManager.isLicensed()) return;

    this.render(config);
    this.startProtection();
  }

  private render(config?: CreditsOptions): void {
    if (this.element) {
      this.element.remove();
      this.element = null;
    }

    const isLicensed = LicenseManager.isLicensed();
    const text = !isLicensed && (!config?.text || !config.text.trim())
      ? DEFAULT_TEXT
      : (config?.text || DEFAULT_TEXT);
    const href = config?.href ?? DEFAULT_HREF;

    const pos = config?.position || {};
    const align = pos.align || 'right';
    const vAlign = pos.verticalAlign || 'bottom';

    let x: number;
    let anchor: string;
    if (align === 'left') {
      x = (pos.x ?? 10);
      anchor = 'start';
    } else if (align === 'center') {
      x = this.chartWidth / 2 + (pos.x ?? 0);
      anchor = 'middle';
    } else {
      x = this.chartWidth + (pos.x ?? -10);
      anchor = 'end';
    }

    let y: number;
    if (vAlign === 'top') {
      y = (pos.y ?? 15);
    } else if (vAlign === 'middle') {
      y = this.chartHeight / 2 + (pos.y ?? 0);
    } else {
      y = this.chartHeight + (pos.y ?? -5);
    }

    this.element = this.svg.append('text')
      .attr('class', 'katucharts-credits')
      .attr('x', x)
      .attr('y', y)
      .attr('text-anchor', anchor)
      .attr('fill', config?.style?.color as string || '#999999')
      .attr('font-size', config?.style?.fontSize as string || '9px')
      .style('cursor', href ? 'pointer' : 'default')
      .text(text);

    if (config?.style) {
      const s = config.style;
      if (s.fontFamily) this.element.attr('font-family', s.fontFamily as string);
      if (s.fontWeight) this.element.attr('font-weight', s.fontWeight as string);
      if (s.textDecoration) this.element.style('text-decoration', s.textDecoration as string);
    }

    if (href) {
      this.element.on('click', () => {
        window.open(href, '_blank');
      });
    }
  }

  private startProtection(): void {
    if (LicenseManager.isLicensed()) return;
    if (typeof MutationObserver === 'undefined') return;

    const svgNode = this.svg.node();
    if (!svgNode) return;

    this.observer = new MutationObserver(() => {
      if (!svgNode.querySelector('.katucharts-credits')) {
        this.render();
      }
    });
    this.observer.observe(svgNode, { childList: true });

    if (typeof window !== 'undefined') {
      this.intervalId = window.setInterval(() => {
        if (!svgNode.querySelector('.katucharts-credits')) {
          this.render();
        }
      }, 3000);
    }
  }

  destroy(): void {
    this.observer?.disconnect();
    this.observer = null;
    if (this.intervalId != null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.element) this.element.remove();
    this.element = null;
  }
}

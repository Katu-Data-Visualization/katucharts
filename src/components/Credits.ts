import { Selection } from 'd3-selection';
import { color as d3Color } from 'd3-color';
import { LicenseManager } from '../license/LicenseManager';
import { readableTextColor } from '../utils/chartText';
import type { CreditsOptions } from '../types/options';

const DEFAULT_TEXT = 'Powered by: KatuCharts';
const DEFAULT_HREF = 'https://charts.katudv.com';

const CREDIT_ON_LIGHT = '#707070';
const CREDIT_ON_DARK = '#b0b0b0';

/**
 * Maps a background fill to a muted grey for the credit. It keeps the credit a
 * subtle watermark while flipping sides so it stays legible whether the corner
 * is empty page background or covered by a chart shape.
 */
function creditColorFor(background: string): string {
  return readableTextColor(background) === '#ffffff' ? CREDIT_ON_DARK : CREDIT_ON_LIGHT;
}

export class Credits {
  private element: Selection<SVGTextElement, unknown, null, undefined> | null = null;
  private observer: MutationObserver | null = null;
  private intervalId: number | null = null;
  private svg: Selection<SVGSVGElement, unknown, null, undefined>;
  private chartWidth: number;
  private chartHeight: number;
  private config: CreditsOptions;
  private unsubscribe: (() => void) | null = null;

  constructor(
    config: CreditsOptions,
    svg: Selection<SVGSVGElement, unknown, null, undefined>,
    chartWidth: number,
    chartHeight: number
  ) {
    this.svg = svg;
    this.chartWidth = chartWidth;
    this.chartHeight = chartHeight;
    this.config = config;

    this.apply();

    /**
     * React to async (online) license transitions: a confirmed license removes
     * the watermark; a revocation re-applies it.
     */
    this.unsubscribe = LicenseManager.onChange(() => this.apply());
  }

  /**
   * Renders or hides the credits to match the current license state.
   */
  private apply(): void {
    const licensed = LicenseManager.isLicensed();
    if (this.config.enabled === false && licensed) {
      this.stopProtection();
      if (this.element) {
        this.element.remove();
        this.element = null;
      }
      return;
    }
    this.render(this.config);
    if (licensed) {
      this.stopProtection();
    } else {
      this.startProtection();
    }
  }

  updatePosition(chartWidth: number, chartHeight: number): void {
    this.chartWidth = chartWidth;
    this.chartHeight = chartHeight;
    if (this.config.enabled === false && LicenseManager.isLicensed()) return;
    this.render(this.config);
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

    const explicitColor = config?.style?.color as string | undefined;

    this.element = this.svg.append('text')
      .attr('class', 'katucharts-credits')
      .attr('x', x)
      .attr('y', y)
      .attr('text-anchor', anchor)
      .attr('fill', explicitColor || CREDIT_ON_LIGHT)
      .attr('font-size', config?.style?.fontSize as string || '9px')
      .style('cursor', href ? 'pointer' : 'default')
      .text(text);

    if (config?.style) {
      const s = config.style;
      if (s.fontFamily) this.element.attr('font-family', s.fontFamily as string);
      if (s.fontWeight) this.element.attr('font-weight', s.fontWeight as string);
      if (s.textDecoration) this.element.style('text-decoration', s.textDecoration as string);
    }

    /**
     * Resolve contrast once the element is in the DOM, so its measured position
     * can be tested against whatever is painted behind it.
     */
    if (!explicitColor) {
      const behind = this.resolveBehindColor() || this.resolvePageBackground();
      this.element.attr('fill', creditColorFor(behind));
    }

    if (href) {
      this.element.on('click', () => {
        if (/^https?:\/\//i.test(href)) {
          window.open(href, '_blank', 'noopener,noreferrer');
        }
      });
    }
  }

  /**
   * Re-resolves the credit colour after the series have been painted, so it can
   * account for chart shapes that end up behind it. Called once the plot is drawn.
   */
  refresh(): void {
    if (this.config.enabled === false && LicenseManager.isLicensed()) return;
    this.render(this.config);
  }

  /**
   * Returns the fill of the topmost chart shape painted under the credit's
   * centre, or null when the corner is empty (transparent background).
   */
  private resolveBehindColor(): string | null {
    try {
      const textNode = this.element?.node();
      const svgNode = this.svg.node();
      if (!textNode || !svgNode) return null;
      const r = textNode.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      const px = r.left + r.width / 2;
      const py = r.top + r.height / 2;

      let found: string | null = null;
      svgNode.querySelectorAll('rect, path, circle, polygon, ellipse').forEach((el) => {
        const cls = el.getAttribute('class') || '';
        if (/katucharts-(credits|export|border)/.test(cls)) return;
        const fill = this.elementFill(el);
        if (!fill) return;
        const b = el.getBoundingClientRect();
        if (px >= b.left && px <= b.right && py >= b.top && py <= b.bottom) {
          found = fill;
        }
      });
      return found;
    } catch {
      return null;
    }
  }

  /**
   * Reads the first opaque background-color walking up from the SVG, which
   * covers the common case of a transparent chart over a coloured page/card.
   */
  private resolvePageBackground(): string {
    try {
      let node: Element | null = this.svg.node();
      while (node) {
        if (typeof getComputedStyle === 'function') {
          const bg = getComputedStyle(node).backgroundColor;
          const parsed = bg ? d3Color(bg) : null;
          if (parsed && parsed.opacity > 0) return bg;
        }
        node = node.parentElement;
      }
    } catch {}
    return '#ffffff';
  }

  private elementFill(el: Element): string | null {
    const tag = el.tagName.toLowerCase();
    if (tag === 'text' || tag === 'tspan') return null;
    let fill = el.getAttribute('fill');
    if (!fill || fill === 'none') {
      const styleFill = (el as SVGElement).style?.fill;
      fill = styleFill && styleFill !== 'none' ? styleFill : null;
    }
    if (!fill || fill === 'none' || fill.indexOf('url(') === 0) return null;
    const parsed = d3Color(fill);
    if (!parsed || parsed.opacity === 0) return null;
    return fill;
  }

  private startProtection(): void {
    if (LicenseManager.isLicensed()) return;
    if (this.observer || this.intervalId != null) return;
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

  private stopProtection(): void {
    this.observer?.disconnect();
    this.observer = null;
    if (this.intervalId != null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  destroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.stopProtection();
    if (this.element) this.element.remove();
    this.element = null;
  }
}

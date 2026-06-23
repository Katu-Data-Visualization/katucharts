/**
 * Wraps d3-selection to manage the root SVG element and provide drawing primitives.
 */

import { select, Selection } from 'd3-selection';

/**
 * Thin chainable wrapper around a single SVG element, mirroring the subset of the
 * `SVGElement` API (`attr`/`css`/`add`/`getBBox`/`destroy`) that consumers rely on inside
 * custom `chart.events.render` callbacks (e.g. drawing corner labels). Elements are attached on
 * creation, so `add()` is a no-op kept only for API compatibility.
 */
export class RendererElement {
  constructor(private readonly el: Selection<SVGElement, unknown, null, undefined>) {}

  attr(attrs: Record<string, any>): this {
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'zIndex') continue;
      this.el.attr(key, value as any);
    }
    return this;
  }

  css(styles: Record<string, any>): this {
    for (const [key, value] of Object.entries(styles)) {
      const prop = key.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
      this.el.style(prop, value as any);
      if (key === 'color') this.el.attr('fill', value as any);
    }
    return this;
  }

  add(): this {
    return this;
  }

  getBBox(): { x: number; y: number; width: number; height: number } {
    const node = this.el.node() as SVGGraphicsElement | null;
    if (!node || typeof node.getBBox !== 'function') return { x: 0, y: 0, width: 0, height: 0 };
    try {
      return node.getBBox();
    } catch {
      return { x: 0, y: 0, width: 0, height: 0 };
    }
  }

  destroy(): void {
    this.el.remove();
  }
}

export class SVGRenderer {
  readonly svg: Selection<SVGSVGElement, unknown, null, undefined>;
  readonly defs: Selection<SVGDefsElement, unknown, null, undefined>;
  private static clipPathCounter = 0;
  private static gradientCounter = 0;

  constructor(container: HTMLElement, width: number, height: number) {
    this.svg = select(container)
      .append('svg')
      .attr('class', 'katucharts-root')
      .attr('xmlns', 'http://www.w3.org/2000/svg')
      .attr('width', width)
      .attr('height', height)
      .style('overflow', 'hidden')
      .style('outline', 'none')
      .style('display', 'block')
      .style('max-width', '100%');

    this.defs = this.svg.append('defs') as any;
  }

  setSize(width: number, height: number): void {
    this.svg.attr('width', width).attr('height', height);
  }

  createGroup(className?: string, parent?: Selection<any, any, any, any>): Selection<SVGGElement, unknown, null, undefined> {
    const target: any = parent || this.svg;
    const g = target.append('g') as Selection<SVGGElement, unknown, null, undefined>;
    if (className) g.attr('class', className);
    return g;
  }

  /**
   * Text factory. Appends a `<text>` to the SVG root at absolute
   * coordinates and returns a chainable {@link RendererElement}. Used by custom render callbacks.
   */
  text(str: string, x: number, y: number): RendererElement {
    const t = this.svg.append('text')
      .attr('x', x)
      .attr('y', y)
      .style('pointer-events', 'none')
      .text(str) as unknown as Selection<SVGElement, unknown, null, undefined>;
    return new RendererElement(t);
  }

  createClipPath(x: number, y: number, width: number, height: number): string {
    const id = `katucharts-clip-${++SVGRenderer.clipPathCounter}`;
    this.defs.append('clipPath')
      .attr('id', id)
      .append('rect')
      .attr('x', x)
      .attr('y', y)
      .attr('width', width)
      .attr('height', height);
    return id;
  }

  updateClipPath(id: string, x: number, y: number, width: number, height: number): void {
    this.defs.select(`#${id} rect`)
      .attr('x', x)
      .attr('y', y)
      .attr('width', width)
      .attr('height', height);
  }

  createLinearGradient(
    id: string | null,
    x1: string, y1: string, x2: string, y2: string,
    stops: { offset: string; color: string; opacity?: number }[]
  ): string {
    const gradId = id || `katucharts-grad-${++SVGRenderer.gradientCounter}`;
    const gradient = this.defs.append('linearGradient')
      .attr('id', gradId)
      .attr('x1', x1).attr('y1', y1)
      .attr('x2', x2).attr('y2', y2);

    for (const stop of stops) {
      gradient.append('stop')
        .attr('offset', stop.offset)
        .attr('stop-color', stop.color)
        .attr('stop-opacity', stop.opacity ?? 1);
    }

    return gradId;
  }

  getSVGNode(): SVGSVGElement | null {
    return this.svg.node();
  }

  destroy(): void {
    this.svg.remove();
  }

  getSerializedSVG(): string {
    const svgNode = this.svg.node();
    if (!svgNode) return '';
    const serializer = new XMLSerializer();
    return serializer.serializeToString(svgNode);
  }
}

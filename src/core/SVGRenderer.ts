/**
 * Wraps d3-selection to manage the root SVG element and provide drawing primitives.
 */

import { select, Selection } from 'd3-selection';

export class SVGRenderer {
  readonly svg: Selection<SVGSVGElement, unknown, null, undefined>;
  readonly defs: Selection<SVGDefsElement, unknown, null, undefined>;
  private clipPathCounter = 0;
  private gradientCounter = 0;

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

  createClipPath(x: number, y: number, width: number, height: number): string {
    const id = `katucharts-clip-${++this.clipPathCounter}`;
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
    const gradId = id || `katucharts-grad-${++this.gradientCounter}`;
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

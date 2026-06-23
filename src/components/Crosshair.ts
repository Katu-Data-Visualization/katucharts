import { Selection } from 'd3-selection';
import type { CrosshairOptions, PlotArea } from '../types/options';
import { EventBus } from '../core/EventBus';

export class Crosshair {
  private xLine: Selection<SVGLineElement, unknown, null, undefined> | null = null;
  private yLine: Selection<SVGLineElement, unknown, null, undefined> | null = null;
  private xLabel: Selection<SVGGElement, unknown, null, undefined> | null = null;
  private yLabel: Selection<SVGGElement, unknown, null, undefined> | null = null;
  private plotArea: PlotArea;

  constructor(
    xConfig: boolean | CrosshairOptions | undefined,
    yConfig: boolean | CrosshairOptions | undefined,
    plotGroup: Selection<SVGGElement, unknown, null, undefined>,
    plotArea: PlotArea,
    events: EventBus
  ) {
    this.plotArea = plotArea;

    if (xConfig) {
      const opts = typeof xConfig === 'object' ? xConfig : {};
      const dashArray = this.getDashArray(opts.dashStyle);

      this.xLine = plotGroup.append('line')
        .attr('class', `katucharts-crosshair-x${opts.className ? ' ' + opts.className : ''}`)
        .attr('y1', 0)
        .attr('y2', plotArea.height)
        .attr('stroke', opts.color || '#ccc')
        .attr('stroke-width', opts.width || 1)
        .attr('stroke-dasharray', dashArray)
        .style('display', 'none');

      if (opts.zIndex !== undefined) {
        this.xLine.style('z-index', opts.zIndex);
      }

      if (opts.label?.enabled) {
        this.xLabel = this.createLabel(plotGroup, opts.label, 'x');
      }
    }

    if (yConfig) {
      const opts = typeof yConfig === 'object' ? yConfig : {};
      const dashArray = this.getDashArray(opts.dashStyle);

      this.yLine = plotGroup.append('line')
        .attr('class', `katucharts-crosshair-y${opts.className ? ' ' + opts.className : ''}`)
        .attr('x1', 0)
        .attr('x2', plotArea.width)
        .attr('stroke', opts.color || '#ccc')
        .attr('stroke-width', opts.width || 1)
        .attr('stroke-dasharray', dashArray)
        .style('display', 'none');

      if (opts.zIndex !== undefined) {
        this.yLine.style('z-index', opts.zIndex);
      }

      if (opts.label?.enabled) {
        this.yLabel = this.createLabel(plotGroup, opts.label, 'y');
      }
    }

    const xOpts = typeof xConfig === 'object' ? xConfig : {};
    const yOpts = typeof yConfig === 'object' ? yConfig : {};
    const xSnap = xOpts.snap !== false;
    const ySnap = yOpts.snap !== false;

    events.on('point:mouseover', (data: any) => {
      if (this.xLine) {
        const xPos = xSnap ? data.plotX : (data.event?.offsetX ?? data.plotX);
        this.xLine.attr('x1', xPos).attr('x2', xPos).style('display', null);

        if (this.xLabel) {
          this.updateLabel(this.xLabel, xOpts.label!, data.point?.x ?? data.plotX, xPos, plotArea.height + 2, 'x');
        }
      }
      if (this.yLine) {
        const yPos = ySnap ? data.plotY : (data.event?.offsetY ?? data.plotY);
        this.yLine.attr('y1', yPos).attr('y2', yPos).style('display', null);

        if (this.yLabel) {
          this.updateLabel(this.yLabel, yOpts.label!, data.point?.y ?? data.plotY, -2, yPos, 'y');
        }
      }
    });

    events.on('point:mouseout', () => {
      if (this.xLine) this.xLine.style('display', 'none');
      if (this.yLine) this.yLine.style('display', 'none');
      if (this.xLabel) this.xLabel.style('display', 'none');
      if (this.yLabel) this.yLabel.style('display', 'none');
    });
  }

  private getDashArray(style?: string): string {
    if (!style) return 'none';
    const map: Record<string, string> = {
      'Solid': 'none', 'ShortDash': '6,2', 'ShortDot': '2,2',
      'ShortDashDot': '6,2,2,2', 'Dot': '2,6', 'Dash': '8,6',
      'LongDash': '16,6', 'DashDot': '8,6,2,6', 'LongDashDot': '16,6,2,6',
      'LongDashDotDot': '16,6,2,6,2,6',
    };
    return map[style] || 'none';
  }

  private createLabel(
    group: Selection<SVGGElement, unknown, null, undefined>,
    labelCfg: NonNullable<CrosshairOptions['label']>,
    axis: 'x' | 'y'
  ): Selection<SVGGElement, unknown, null, undefined> {
    const g = group.append('g')
      .attr('class', `katucharts-crosshair-label-${axis}`)
      .style('display', 'none');

    g.append('rect')
      .attr('rx', labelCfg.borderRadius ?? 3)
      .attr('fill', labelCfg.backgroundColor || 'rgba(0,0,0,0.75)')
      .attr('stroke', labelCfg.borderColor || 'none')
      .attr('stroke-width', labelCfg.borderWidth ?? 0);

    g.append('text')
      .attr('fill', (labelCfg.style?.color as string) || '#fff')
      .attr('font-size', (labelCfg.style?.fontSize as string) || '10px')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central');

    return g;
  }

  private updateLabel(
    labelGroup: Selection<SVGGElement, unknown, null, undefined>,
    labelCfg: NonNullable<CrosshairOptions['label']>,
    value: any,
    x: number,
    y: number,
    axis: 'x' | 'y'
  ): void {
    labelGroup.style('display', null);

    let text: string;
    if (labelCfg.formatter) {
      text = labelCfg.formatter.call({ value });
    } else if (labelCfg.format) {
      text = labelCfg.format.replace('{value}', String(value));
    } else {
      text = typeof value === 'number' ? value.toFixed(2) : String(value);
    }

    const padding = labelCfg.padding ?? 4;
    const textEl = labelGroup.select('text');
    textEl.text(text).attr('x', x).attr('y', y);

    const bbox = (textEl.node() as SVGTextElement)?.getBBox();
    if (bbox) {
      labelGroup.select('rect')
        .attr('x', bbox.x - padding)
        .attr('y', bbox.y - padding)
        .attr('width', bbox.width + padding * 2)
        .attr('height', bbox.height + padding * 2);
    }
  }

  destroy(): void {
    if (this.xLine) this.xLine.remove();
    if (this.yLine) this.yLine.remove();
    if (this.xLabel) this.xLabel.remove();
    if (this.yLabel) this.yLabel.remove();
  }
}

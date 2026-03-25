import { select, Selection } from 'd3-selection';
import { brushX } from 'd3-brush';
import { scaleLinear } from 'd3-scale';
import { line } from 'd3-shape';
import type { NavigatorOptions, PlotArea } from '../types/options';
import { EventBus } from '../core/EventBus';

export class Navigator {
  private group: Selection<SVGGElement, unknown, null, undefined>;
  private config: NavigatorOptions;
  private events: EventBus;
  private width = 0;
  private height = 0;

  constructor(
    config: NavigatorOptions,
    svg: Selection<SVGSVGElement, unknown, null, undefined>,
    plotArea: PlotArea,
    chartHeight: number,
    events: EventBus,
    seriesData: { x: number; y: number }[]
  ) {
    this.config = config;
    this.events = events;

    if (!config.enabled) {
      this.group = svg.append('g').style('display', 'none');
      return;
    }

    this.height = config.height || 40;
    const margin = config.margin || 25;
    const navY = chartHeight - this.height - 10;
    this.width = plotArea.width;

    this.group = svg.append('g')
      .attr('class', 'katucharts-navigator')
      .attr('transform', `translate(${plotArea.x},${navY})`);

    const maskFill = config.maskFill ?? 'rgba(102,133,194,0.3)';
    const maskInside = config.maskInside ?? true;
    const seriesColor = (config.series as any)?.color ?? '#6699cc';
    const handlesCfg = config.handles || {};
    const handleBg = handlesCfg.backgroundColor ?? '#f2f2f2';
    const handleBorder = handlesCfg.borderColor ?? '#999999';
    const handlesEnabled = handlesCfg.enabled !== false;

    this.group.append('rect')
      .attr('width', this.width).attr('height', this.height)
      .attr('fill', '#f2f2f2')
      .attr('stroke', config.outlineColor || '#cccccc')
      .attr('stroke-width', config.outlineWidth || 1);

    this.renderSeriesLine(seriesData, seriesColor);

    const brush = brushX()
      .extent([[0, 0], [this.width, this.height]])
      .on('end', (event) => {
        if (!event.selection) return;
        const [x0, x1] = event.selection as [number, number];
        events.emit('navigator:brushed', { x0: x0 / this.width, x1: x1 / this.width });
      });

    const brushGroup = this.group.append('g')
      .attr('class', 'katucharts-navigator-brush')
      .call(brush);

    brushGroup.selectAll('.selection')
      .attr('fill', maskInside ? maskFill : 'none')
      .attr('stroke', 'none');

    if (handlesEnabled) {
      brushGroup.selectAll('.handle')
        .attr('fill', handleBg)
        .attr('stroke', handleBorder)
        .attr('stroke-width', handlesCfg.lineWidth ?? 1);
    } else {
      brushGroup.selectAll('.handle').style('display', 'none');
    }

    if (config.adaptToUpdatedData !== false) {
      events.on('series:dataUpdated', (data: { x: number; y: number }[]) => {
        this.updateSeriesLine(data, seriesColor);
      });
    }
  }

  private renderSeriesLine(seriesData: { x: number; y: number }[], color: string): void {
    if (seriesData.length === 0) return;

    const xExtent = [
      Math.min(...seriesData.map(d => d.x)),
      Math.max(...seriesData.map(d => d.x)),
    ];
    const yExtent = [
      Math.min(...seriesData.map(d => d.y)),
      Math.max(...seriesData.map(d => d.y)),
    ];

    const xScale = scaleLinear().domain(xExtent).range([0, this.width]);
    const yScale = scaleLinear().domain(yExtent).range([this.height - 2, 2]);

    const lineGen = line<any>()
      .x(d => xScale(d.x))
      .y(d => yScale(d.y));

    this.group.selectAll('.katucharts-navigator-line').remove();
    this.group.append('path')
      .datum(seriesData)
      .attr('class', 'katucharts-navigator-line')
      .attr('d', lineGen)
      .attr('fill', 'none')
      .attr('stroke', color)
      .attr('stroke-width', 1);
  }

  private updateSeriesLine(seriesData: { x: number; y: number }[], color: string): void {
    this.renderSeriesLine(seriesData, color);
  }

  destroy(): void {
    this.group.remove();
  }
}

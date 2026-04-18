import { BaseSeries } from '../BaseSeries';
import { area as d3area, line as d3line, curveLinear } from 'd3-shape';
import type { InternalSeriesConfig } from '../../types/options';
import { ENTRY_DURATION, EASE_ENTRY } from '../../core/animationConstants';

export class AreaRangeChart extends BaseSeries {
  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  render(): void {
    const { xAxis, yAxis, plotArea } = this.context;
    const animate = this.context.animate;
    const data = this.data;

    const color = this.getColor();
    const fillOpacity = (this.config as any).fillOpacity ?? 0.3;
    const fillColor = (this.config as any).fillColor || color;
    const lineColor = (this.config as any).lineColor || color;
    const lineWidth = this.config.lineWidth ?? 1;

    const validData = data.filter(d => {
      const low = (d as any).low;
      const high = (d as any).high ?? d.y;
      return low !== undefined && low !== null && high !== undefined && high !== null;
    });

    if (validData.length === 0) return;

    const xVal = (d: any, i: number) => xAxis.getPixelForValue(d.x ?? i);
    const lowVal = (d: any) => yAxis.getPixelForValue(d.low);
    const highVal = (d: any) => yAxis.getPixelForValue(d.high ?? d.y);

    const areaGen = d3area<any>()
      .x((d, i) => xVal(d, i))
      .y0(d => lowVal(d))
      .y1(d => highVal(d))
      .curve(curveLinear);

    const areaPath = this.group.append('path')
      .datum(validData)
      .attr('class', 'katucharts-arearange-fill')
      .attr('d', areaGen)
      .attr('fill', fillColor)
      .attr('fill-opacity', fillOpacity)
      .attr('stroke', 'none');

    if (lineWidth > 0) {
      const topLineGen = d3line<any>()
        .x((d, i) => xVal(d, i))
        .y(d => highVal(d))
        .curve(curveLinear);

      const bottomLineGen = d3line<any>()
        .x((d, i) => xVal(d, i))
        .y(d => lowVal(d))
        .curve(curveLinear);

      this.group.append('path')
        .datum(validData)
        .attr('class', 'katucharts-arearange-line-top')
        .attr('d', topLineGen)
        .attr('fill', 'none')
        .attr('stroke', lineColor)
        .attr('stroke-width', lineWidth);

      this.group.append('path')
        .datum(validData)
        .attr('class', 'katucharts-arearange-line-bottom')
        .attr('d', bottomLineGen)
        .attr('fill', 'none')
        .attr('stroke', lineColor)
        .attr('stroke-width', lineWidth);
    }

    if (animate) {
      const midY = plotArea.height / 2;

      const flatArea = d3area<any>()
        .x((d, i) => xVal(d, i))
        .y0(() => midY)
        .y1(() => midY)
        .curve(curveLinear);

      areaPath
        .attr('d', flatArea)
        .transition().duration(ENTRY_DURATION).ease(EASE_ENTRY)
        .attr('d', areaGen);

      if (lineWidth > 0) {
        const flatLine = d3line<any>()
          .x((d, i) => xVal(d, i))
          .y(() => midY)
          .curve(curveLinear);

        const flatLinePath = flatLine(validData) || '';
        const topLinePath = d3line<any>().x((d, i) => xVal(d, i)).y(d => highVal(d)).curve(curveLinear)(validData) || '';
        const bottomLinePath = d3line<any>().x((d, i) => xVal(d, i)).y(d => lowVal(d)).curve(curveLinear)(validData) || '';

        this.group.select('.katucharts-arearange-line-top')
          .attr('d', flatLinePath)
          .transition().duration(ENTRY_DURATION).ease(EASE_ENTRY)
          .attr('d', topLinePath);

        this.group.select('.katucharts-arearange-line-bottom')
          .attr('d', flatLinePath)
          .transition().duration(ENTRY_DURATION).ease(EASE_ENTRY)
          .attr('d', bottomLinePath);
      }

      this.emitAfterAnimate(ENTRY_DURATION);
    }
  }

  /**
   * Computes extents using low/high values for the y-axis range.
   */
  getDataExtents(): { xMin: number; xMax: number; yMin: number; yMax: number } {
    let xMin = Infinity, xMax = -Infinity;
    let yMin = Infinity, yMax = -Infinity;

    for (const d of this.data) {
      const x = d.x ?? 0;
      if (x < xMin) xMin = x;
      if (x > xMax) xMax = x;

      const low = (d as any).low;
      const high = (d as any).high ?? d.y;

      if (low !== undefined && low !== null) {
        if (low < yMin) yMin = low;
        if (low > yMax) yMax = low;
      }
      if (high !== undefined && high !== null) {
        if (high < yMin) yMin = high;
        if (high > yMax) yMax = high;
      }
    }

    return { xMin, xMax, yMin, yMax };
  }
}

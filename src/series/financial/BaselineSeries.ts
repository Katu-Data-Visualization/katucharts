import { select } from 'd3-selection';
import { BaseSeries } from '../BaseSeries';
import { area as d3area, line as d3line, curveLinear } from 'd3-shape';
import type { InternalSeriesConfig } from '../../types/options';

interface ZoneConfig {
  color: string;
  fillColor: string;
  fillOpacity: number;
}

export class BaselineSeries extends BaseSeries {
  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  render(): void {
    const { xAxis, yAxis, plotArea } = this.context;
    const animate = this.context.animate;
    const data = this.data;

    const threshold = (this.config as any).threshold ?? 0;
    const thresholdPx = yAxis.getPixelForValue(threshold);

    const topLine: ZoneConfig = {
      color: (this.config as any).topLine?.color ?? '#2f7ed8',
      fillColor: (this.config as any).topLine?.fillColor ?? 'rgba(47,126,216,0.2)',
      fillOpacity: (this.config as any).topLine?.fillOpacity ?? 1,
    };

    const bottomLine: ZoneConfig = {
      color: (this.config as any).bottomLine?.color ?? '#f45b5b',
      fillColor: (this.config as any).bottomLine?.fillColor ?? 'rgba(244,91,91,0.2)',
      fillOpacity: (this.config as any).bottomLine?.fillOpacity ?? 1,
    };

    const lineWidth = this.config.lineWidth ?? 2;

    const validData = data.filter(d => d.y !== null && d.y !== undefined);
    if (validData.length === 0) return;

    const xVal = (d: any, i: number) => xAxis.getPixelForValue(d.x ?? i);
    const yVal = (d: any) => yAxis.getPixelForValue(d.y ?? 0);

    const clipTopId = `katucharts-baseline-top-${this.config.index}-${Date.now()}`;
    const clipBottomId = `katucharts-baseline-bottom-${this.config.index}-${Date.now()}`;

    const svg = this.group.select(function () {
      return (this as unknown as SVGElement).ownerSVGElement;
    }) as any;

    if (svg.empty()) return;

    let defs = svg.select('defs');
    if (defs.empty()) defs = svg.append('defs');

    defs.append('clipPath')
      .attr('id', clipTopId)
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', plotArea.width)
      .attr('height', Math.max(0, thresholdPx));

    defs.append('clipPath')
      .attr('id', clipBottomId)
      .append('rect')
      .attr('x', 0)
      .attr('y', thresholdPx)
      .attr('width', plotArea.width)
      .attr('height', Math.max(0, plotArea.height - thresholdPx));

    const areaGen = d3area<any>()
      .x((d, i) => xVal(d, i))
      .y0(() => thresholdPx)
      .y1(d => yVal(d))
      .curve(curveLinear);

    const lineGen = d3line<any>()
      .x((d, i) => xVal(d, i))
      .y(d => yVal(d))
      .curve(curveLinear);

    this.renderZone(validData, areaGen, lineGen, clipTopId, topLine, lineWidth, 'top');
    this.renderZone(validData, areaGen, lineGen, clipBottomId, bottomLine, lineWidth, 'bottom');

    if (this.config.lineWidth !== 0) {
      this.group.append('line')
        .attr('class', 'katucharts-baseline-threshold')
        .attr('x1', 0)
        .attr('x2', plotArea.width)
        .attr('y1', thresholdPx)
        .attr('y2', thresholdPx)
        .attr('stroke', '#999')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '4,3')
        .attr('opacity', 0.6);
    }

    if (animate) {
      this.animateDrawIn(lineWidth);
    }
  }

  /**
   * Renders an area + line pair clipped to one side of the threshold.
   */
  private renderZone(
    data: any[],
    areaGen: any,
    lineGen: any,
    clipId: string,
    zone: ZoneConfig,
    lineWidth: number,
    label: string
  ): void {
    const zoneGroup = this.group.append('g')
      .attr('class', `katucharts-baseline-zone-${label}`)
      .attr('clip-path', `url(#${clipId})`);

    zoneGroup.append('path')
      .datum(data)
      .attr('class', `katucharts-baseline-area-${label}`)
      .attr('d', areaGen)
      .attr('fill', zone.fillColor)
      .attr('fill-opacity', zone.fillOpacity)
      .attr('stroke', 'none');

    zoneGroup.append('path')
      .datum(data)
      .attr('class', `katucharts-baseline-line-${label}`)
      .attr('d', lineGen)
      .attr('fill', 'none')
      .attr('stroke', zone.color)
      .attr('stroke-width', lineWidth);
  }

  /**
   * Stroke-dasharray draw-in animation from left to right.
   */
  private animateDrawIn(_lineWidth: number): void {
    this.group.selectAll<SVGPathElement, unknown>('[class*="katucharts-baseline-line-"]')
      .each(function () {
        const path = this as SVGPathElement;
        const totalLength = path.getTotalLength?.() ?? 0;
        if (totalLength === 0) return;

        const sel = select(path);
        sel
          .attr('stroke-dasharray', `${totalLength} ${totalLength}`)
          .attr('stroke-dashoffset', totalLength)
          .transition().duration(1000)
          .attr('stroke-dashoffset', 0)
          .on('end', () => {
            sel.attr('stroke-dasharray', null);
          });
      });

    this.group.selectAll<SVGPathElement, unknown>('[class*="katucharts-baseline-area-"]')
      .attr('opacity', 0)
      .transition().delay(400).duration(600)
      .attr('opacity', 1);

    this.emitAfterAnimate(1000);
  }

  getDataExtents(): { xMin: number; xMax: number; yMin: number; yMax: number } {
    let xMin = Infinity, xMax = -Infinity;
    let yMin = Infinity, yMax = -Infinity;

    const threshold = (this.config as any).threshold ?? 0;

    for (const d of this.data) {
      const x = d.x ?? 0;
      if (x < xMin) xMin = x;
      if (x > xMax) xMax = x;
      const y = d.y ?? 0;
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
    }

    if (threshold < yMin) yMin = threshold;
    if (threshold > yMax) yMax = threshold;

    return { xMin, xMax, yMin, yMax };
  }
}

/**
 * Kaplan-Meier survival curve with step function, confidence interval bands,
 * censoring marks, and optional at-risk table.
 */

import { line as d3Line, area as d3Area, curveStepAfter } from 'd3-shape';
import 'd3-transition';
import { BaseSeries } from '../BaseSeries';
import type { InternalSeriesConfig, PointOptions } from '../../types/options';
import {
  ENTRY_DURATION,
  HOVER_DURATION,
  EASE_ENTRY,
  EASE_HOVER,
} from '../../core/animationConstants';

export class KaplanMeierSeries extends BaseSeries {
  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  render(): void {
    const { xAxis, yAxis, plotArea } = this.context;
    const animate = this.context.animate;
    const data = this.data.filter(d => d.y !== null && d.y !== undefined);
    const color = this.getColor();

    const showCI = this.config.showConfidenceInterval !== false;
    const ciOpacity = this.config.confidenceIntervalOpacity ?? 0.15;
    const showCensor = this.config.showCensorMarks !== false;
    const censorSize = this.config.censorMarkSize ?? 6;
    const showMedian = this.config.medianSurvivalLine ?? false;
    const showAtRisk = this.config.showAtRiskTable ?? false;
    const lineWidth = this.config.lineWidth ?? 2;

    const animOpts = typeof this.config.animation === 'object' ? this.config.animation : {};
    const entryDur = animOpts.duration ?? ENTRY_DURATION;

    if (showCI) {
      this.renderConfidenceInterval(data, color, ciOpacity, !!animate, entryDur);
    }

    this.renderSurvivalCurve(data, color, lineWidth, !!animate, entryDur);

    if (showCensor) {
      this.renderCensoringMarks(data, color, censorSize, !!animate, entryDur);
    }

    if (showMedian) {
      this.renderMedianLine(data, color);
    }

    if (showAtRisk) {
      this.renderAtRiskTable(data, color);
    }

    if (animate) {
      this.emitAfterAnimate(entryDur + 200);
    }
  }

  private renderSurvivalCurve(
    data: PointOptions[], color: string, lineWidth: number,
    animate: boolean, duration: number
  ): void {
    const { xAxis, yAxis, plotArea } = this.context;

    const lineGen = d3Line<PointOptions>()
      .x(d => xAxis.getPixelForValue(d.x ?? 0))
      .y(d => yAxis.getPixelForValue(d.y ?? 0))
      .curve(curveStepAfter);

    const path = this.group.append('path')
      .datum(data)
      .attr('d', lineGen)
      .attr('fill', 'none')
      .attr('stroke', color)
      .attr('stroke-width', lineWidth)
      .attr('stroke-linecap', 'round');

    if (animate) {
      const totalLength = (path.node() as SVGPathElement)?.getTotalLength?.() ?? plotArea.width;
      path
        .attr('stroke-dasharray', `${totalLength} ${totalLength}`)
        .attr('stroke-dashoffset', totalLength)
        .transition().duration(duration).ease(EASE_ENTRY)
        .attr('stroke-dashoffset', 0)
        .on('end', () => {
          path.attr('stroke-dasharray', null).attr('stroke-dashoffset', null);
        });
    }
  }

  private renderConfidenceInterval(
    data: PointOptions[], color: string, opacity: number,
    animate: boolean, duration: number
  ): void {
    const { xAxis, yAxis } = this.context;

    const ciData = data.filter(d => d.custom?.ciLower !== undefined && d.custom?.ciUpper !== undefined);
    if (ciData.length === 0) return;

    const areaGen = d3Area<PointOptions>()
      .x(d => xAxis.getPixelForValue(d.x ?? 0))
      .y0(d => yAxis.getPixelForValue(d.custom?.ciLower ?? d.y ?? 0))
      .y1(d => yAxis.getPixelForValue(d.custom?.ciUpper ?? d.y ?? 0))
      .curve(curveStepAfter);

    const band = this.group.append('path')
      .datum(ciData)
      .attr('d', areaGen)
      .attr('fill', color)
      .attr('fill-opacity', opacity)
      .attr('stroke', 'none');

    if (animate) {
      band.attr('opacity', 0)
        .transition().duration(duration).ease(EASE_ENTRY)
        .attr('opacity', 1);
    }
  }

  private renderCensoringMarks(
    data: PointOptions[], color: string, size: number,
    animate: boolean, duration: number
  ): void {
    const { xAxis, yAxis } = this.context;

    const censored = data.filter(d => d.custom?.censored === true);
    if (censored.length === 0) return;

    const censorGroup = this.group.append('g').attr('class', 'katucharts-km-censors');
    const censorColor = this.config.censorMarkColor ?? color;

    for (const d of censored) {
      const px = xAxis.getPixelForValue(d.x ?? 0);
      const py = yAxis.getPixelForValue(d.y ?? 0);

      const mark = censorGroup.append('line')
        .attr('x1', px).attr('x2', px)
        .attr('y1', py - size / 2).attr('y2', py + size / 2)
        .attr('stroke', censorColor)
        .attr('stroke-width', 2)
        .style('cursor', 'pointer');

      if (animate) {
        mark.attr('opacity', 0)
          .transition().duration(duration).ease(EASE_ENTRY)
          .attr('opacity', 1);
      }

      if (this.config.enableMouseTracking !== false) {
        mark
          .on('mouseover', (event: MouseEvent) => {
            this.context.events.emit('point:mouseover', {
              point: d, index: data.indexOf(d), series: this, event,
              plotX: px, plotY: py,
            });
          })
          .on('mouseout', (event: MouseEvent) => {
            this.context.events.emit('point:mouseout', {
              point: d, index: data.indexOf(d), series: this, event,
            });
          });
      }
    }
  }

  private renderMedianLine(data: PointOptions[], color: string): void {
    const { xAxis, yAxis, plotArea } = this.context;

    let medianTime: number | null = null;
    for (let i = 0; i < data.length; i++) {
      if ((data[i].y ?? 1) <= 0.5) {
        medianTime = data[i].x ?? 0;
        break;
      }
    }
    if (medianTime === null) return;

    const medianGroup = this.group.append('g').attr('class', 'katucharts-km-median');
    const medianX = xAxis.getPixelForValue(medianTime);
    const medianY = yAxis.getPixelForValue(0.5);

    medianGroup.append('line')
      .attr('x1', 0).attr('x2', medianX)
      .attr('y1', medianY).attr('y2', medianY)
      .attr('stroke', '#999').attr('stroke-width', 1)
      .attr('stroke-dasharray', '4,3')
      .attr('opacity', 0.6);

    medianGroup.append('line')
      .attr('x1', medianX).attr('x2', medianX)
      .attr('y1', medianY).attr('y2', plotArea.height)
      .attr('stroke', '#999').attr('stroke-width', 1)
      .attr('stroke-dasharray', '4,3')
      .attr('opacity', 0.6);
  }

  private renderAtRiskTable(data: PointOptions[], color: string): void {
    const { xAxis, plotArea } = this.context;

    const atRiskData = data.filter(d => d.custom?.atRisk !== undefined);
    if (atRiskData.length === 0) return;

    const nTicks = Math.min(atRiskData.length, 8);
    const step = Math.max(1, Math.floor(atRiskData.length / nTicks));
    const tableGroup = this.group.append('g').attr('class', 'katucharts-km-atrisk');

    for (let i = 0; i < atRiskData.length; i += step) {
      const d = atRiskData[i];
      const px = xAxis.getPixelForValue(d.x ?? 0);

      tableGroup.append('text')
        .attr('x', px)
        .attr('y', plotArea.height + 32)
        .attr('text-anchor', 'middle')
        .attr('font-size', '9px')
        .attr('fill', color)
        .text(String(d.custom?.atRisk ?? ''));
    }

    tableGroup.append('text')
      .attr('x', -8)
      .attr('y', plotArea.height + 32)
      .attr('text-anchor', 'end')
      .attr('font-size', '9px')
      .attr('fill', color)
      .text('At risk');
  }

  getDataExtents() {
    let xMin = 0, xMax = -Infinity;
    const yMin = 0;
    const yMax = 1;

    for (const d of this.data) {
      if (d.x !== undefined && d.x !== null) {
        xMax = Math.max(xMax, d.x);
      }
    }

    return { xMin, xMax, yMin, yMax };
  }
}

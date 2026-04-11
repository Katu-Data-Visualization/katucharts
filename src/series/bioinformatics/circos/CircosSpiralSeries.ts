/**
 * Spiral Plot — data rendered along an Archimedean spiral path.
 * Each revolution represents one period (day, week, month, year, or custom
 * length). Data values are shown as colored segments whose intensity follows
 * a configurable color scale.
 */

import { scaleSequential } from 'd3-scale';
import 'd3-transition';
import { select } from 'd3-selection';
import { BaseSeries } from '../../BaseSeries';
import type { InternalSeriesConfig } from '../../../types/options';
import { getColorInterpolator } from './CircosColorScales';
import type { CircosColorScaleName } from './CircosTypes';
import { safeMinMax, parseRadius } from './CircosLayoutEngine';
import {
  ENTRY_DURATION,
  ENTRY_STAGGER_PER_ITEM,
  HOVER_DURATION,
  EASE_ENTRY,
  EASE_HOVER,
} from '../../../core/animationConstants';

type PeriodType = 'hour' | 'day' | 'week' | 'month' | 'year';

interface SpiralValue {
  date?: string | Date;
  value: number;
}

interface SpiralData {
  values: SpiralValue[] | number[];
  period?: PeriodType;
  periodLength?: number;
  colorScale?: CircosColorScaleName;
  spacing?: number;
  showLabels?: boolean;
  labelFormat?: string;
  spiralParam?: { a?: number; b?: number };
}

interface ResolvedSegment {
  index: number;
  value: number;
  theta0: number;
  theta1: number;
  r0: number;
  r1: number;
}

const PERIOD_LENGTHS: Record<PeriodType, number> = {
  hour: 60,
  day: 24,
  week: 7,
  month: 30,
  year: 12,
};

export class CircosSpiralSeries extends BaseSeries {
  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  render(): void {
    const { plotArea } = this.context;
    const animate = !!this.context.animate;
    const spiralData = this.getSpiralData();
    if (!spiralData) return;

    const rawValues = this.normalizeValues(spiralData.values);
    if (rawValues.length === 0) return;

    const periodLength = spiralData.periodLength
      ?? (spiralData.period ? PERIOD_LENGTHS[spiralData.period] : rawValues.length);
    const numericValues = rawValues.map(v => v.value);
    const { min: minVal, max: maxVal } = safeMinMax(numericValues);

    const minDim = Math.min(plotArea.width, plotArea.height);
    const outerR = parseRadius(this.config.outerRadius, minDim) ?? (minDim / 2 * 0.85);
    const cx = plotArea.width / 2;
    const cy = plotArea.height / 2;

    const revolutions = Math.ceil(rawValues.length / periodLength);
    const spacing = spiralData.spacing ?? (outerR / (revolutions + 1));

    const innerStartR = spacing * 0.5;
    const a = innerStartR;
    const b = (outerR - innerStartR) / (revolutions * 2 * Math.PI);

    const segments = this.computeSegments(rawValues, periodLength, a, b);

    const interpolator = getColorInterpolator(
      (spiralData.colorScale as CircosColorScaleName) || 'Viridis',
    );
    const colorScale: (v: number) => string = scaleSequential(interpolator).domain([minVal, maxVal]) as any;

    const animOpts = typeof this.config.animation === 'object' ? this.config.animation : {};
    const entryDur = animOpts.duration ?? ENTRY_DURATION;

    const mainGroup = this.group.append('g')
      .attr('class', 'katucharts-spiral')
      .attr('transform', `translate(${cx},${cy})`);

    this.renderSegments(mainGroup, segments, colorScale, animate, entryDur);

    if (spiralData.showLabels !== false) {
      this.renderRevolutionLabels(mainGroup, revolutions, a, b, periodLength, spiralData);
    }

    if (animate) {
      this.emitAfterAnimate(entryDur + 100);
    }
  }

  getDataExtents() {
    return { xMin: 0, xMax: 0, yMin: 0, yMax: 0 };
  }

  private getSpiralData(): SpiralData | null {
    if (this.data.length > 0) {
      const first = this.data[0] as any;
      if (first.custom?.values) {
        return {
          values: first.custom.values,
          period: first.custom.period,
          periodLength: first.custom.periodLength,
          colorScale: first.custom.colorScale,
          spacing: first.custom.spacing,
          showLabels: first.custom.showLabels,
          labelFormat: first.custom.labelFormat,
          spiralParam: first.custom.spiralParam,
        };
      }
    }
    if (this.config.values) {
      return {
        values: this.config.values as SpiralValue[] | number[],
        period: this.config.period as PeriodType,
        periodLength: this.config.periodLength as number,
        colorScale: this.config.colorScale as CircosColorScaleName,
        spacing: this.config.spacing as number,
        showLabels: this.config.showLabels as boolean,
        labelFormat: this.config.labelFormat as string,
        spiralParam: this.config.spiralParam as { a?: number; b?: number },
      };
    }
    return null;
  }

  private normalizeValues(values: SpiralValue[] | number[]): SpiralValue[] {
    if (values.length === 0) return [];
    if (typeof values[0] === 'number') {
      return (values as number[]).map(v => ({ value: v }));
    }
    return values as SpiralValue[];
  }

  /**
   * Compute segment positions along the Archimedean spiral r = a + b*theta.
   * Each segment spans one angular slice of 2pi/periodLength.
   */
  private computeSegments(
    values: SpiralValue[],
    periodLength: number,
    a: number,
    b: number,
  ): ResolvedSegment[] {
    const angularWidth = (2 * Math.PI) / periodLength;
    const segments: ResolvedSegment[] = [];

    for (let i = 0; i < values.length; i++) {
      const theta0 = (i % periodLength) * angularWidth;
      const theta1 = theta0 + angularWidth;
      const revolution = Math.floor(i / periodLength);
      const globalTheta0 = revolution * 2 * Math.PI + theta0;
      const globalTheta1 = revolution * 2 * Math.PI + theta1;
      const r0 = a + b * globalTheta0;
      const r1 = a + b * globalTheta1;

      segments.push({
        index: i,
        value: values[i].value,
        theta0,
        theta1,
        r0,
        r1,
      });
    }

    return segments;
  }

  private renderSegments(
    group: any,
    segments: ResolvedSegment[],
    colorScale: (v: number) => string,
    animate: boolean,
    duration: number,
  ): void {
    const segGroup = group.append('g').attr('class', 'katucharts-spiral-segments');

    const segmentsPerRev = segments.length > 0
      ? Math.round(2 * Math.PI / Math.abs(segments[0].theta1 - segments[0].theta0))
      : 100;
    const useStroke = segmentsPerRev <= 60;

    const paths = segGroup.selectAll('.katucharts-spiral-seg')
      .data(segments)
      .join('path')
      .attr('class', 'katucharts-spiral-seg')
      .attr('d', (d: ResolvedSegment) => this.buildSegmentPath(d))
      .attr('fill', (d: ResolvedSegment) => colorScale(d.value))
      .attr('stroke', useStroke ? '#fff' : 'none')
      .attr('stroke-width', useStroke ? 0.3 : 0)
      .style('cursor', 'pointer');

    if (this.context.events) {
      paths
        .on('mouseover', (event: MouseEvent, d: ResolvedSegment) => {
          const target = event.currentTarget as SVGElement;
          target.style.filter = 'brightness(1.15)';
          select(target).interrupt('hover')
            .transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER)
            .attr('opacity', 1);
          this.context.events.emit('point:mouseover', {
            point: { name: `segment-${d.index}`, custom: { value: d.value, index: d.index } },
            index: d.index, series: this, event,
            plotX: 0, plotY: 0,
          });
        })
        .on('mouseout', (event: MouseEvent, d: ResolvedSegment) => {
          const target = event.currentTarget as SVGElement;
          target.style.filter = '';
          select(target).interrupt('hover')
            .transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER)
            .attr('opacity', 1);
          this.context.events.emit('point:mouseout', {
            point: { name: `segment-${d.index}` },
            index: d.index, series: this, event,
          });
        });
    }

    if (animate) {
      paths
        .attr('opacity', 0)
        .transition()
        .duration(duration).ease(EASE_ENTRY)
        .delay((d: ResolvedSegment) => d.index * ENTRY_STAGGER_PER_ITEM)
        .attr('opacity', 1);
    }
  }

  /**
   * Build an arc-like SVG path for a single spiral segment.
   * Track width derived from spiral b parameter: each revolution adds 2πb of
   * radial distance, so track width = 2πb * fillFraction (default 0.8).
   */
  private buildSegmentPath(seg: ResolvedSegment): string {
    const a0 = seg.theta0 - Math.PI / 2;
    const a1 = seg.theta1 - Math.PI / 2;
    const rMid = (seg.r0 + seg.r1) / 2;
    const revolutionWidth = seg.r1 - seg.r0 > 0.01
      ? (seg.r1 - seg.r0) / ((seg.theta1 - seg.theta0) / (2 * Math.PI))
      : rMid * 0.15;
    const trackWidth = revolutionWidth * 0.95;
    const halfWidth = trackWidth / 2;

    const rIn = Math.max(0, rMid - halfWidth);
    const rOut = rMid + halfWidth;

    const x0i = rIn * Math.cos(a0);
    const y0i = rIn * Math.sin(a0);
    const x0o = rOut * Math.cos(a0);
    const y0o = rOut * Math.sin(a0);
    const x1i = rIn * Math.cos(a1);
    const y1i = rIn * Math.sin(a1);
    const x1o = rOut * Math.cos(a1);
    const y1o = rOut * Math.sin(a1);

    const angularSpan = Math.abs(a1 - a0);
    const largeArc = angularSpan > Math.PI ? 1 : 0;

    return `M${x0i},${y0i}`
      + `L${x0o},${y0o}`
      + `A${rOut},${rOut},0,${largeArc},1,${x1o},${y1o}`
      + `L${x1i},${y1i}`
      + `A${rIn},${rIn},0,${largeArc},0,${x0i},${y0i}`
      + `Z`;
  }

  /**
   * Render period labels at the 12 o'clock position for each revolution.
   * Each revolution is at a different radius, so labels naturally separate.
   * If data has date fields, use the first date of each revolution.
   */
  private renderRevolutionLabels(
    group: any,
    revolutions: number,
    a: number,
    b: number,
    periodLength: number,
    spiralData: SpiralData,
  ): void {
    const rawValues = this.normalizeValues(spiralData.values);
    const labels: { text: string; y: number }[] = [];

    for (let rev = 0; rev < revolutions; rev++) {
      const theta = rev * 2 * Math.PI;
      const r = a + b * theta;

      let labelText: string;
      const firstIdx = rev * periodLength;
      const firstVal = firstIdx < rawValues.length ? rawValues[firstIdx] : null;

      if (firstVal?.date) {
        const d = new Date(firstVal.date);
        labelText = spiralData.labelFormat
          ? spiralData.labelFormat.replace('{year}', String(d.getFullYear()))
          : d.getFullYear().toString();
      } else if (spiralData.period) {
        labelText = `${spiralData.period} ${rev + 1}`;
      } else {
        labelText = `${rev + 1}`;
      }

      labels.push({ text: labelText, y: -r });
    }

    group.selectAll('.katucharts-spiral-label')
      .data(labels)
      .join('text')
      .attr('class', 'katucharts-spiral-label')
      .attr('x', 4)
      .attr('y', (d: any) => d.y)
      .attr('text-anchor', 'start')
      .attr('dominant-baseline', 'central')
      .attr('font-size', '8px')
      .attr('fill', '#555')
      .text((d: any) => d.text);
  }
}

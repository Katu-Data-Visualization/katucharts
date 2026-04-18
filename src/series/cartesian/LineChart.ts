/**
 * Line series with features: negativeColor,
 * zones, markers, dashStyle, linecap, step, connectNulls,
 * data labels, point selection, and animated updates.
 */

import { line, curveLinear, curveStep, curveStepAfter, curveStepBefore, symbol as d3Symbol, symbolCircle, symbolSquare, symbolDiamond, symbolTriangle, symbolTriangle2, symbolCross } from 'd3-shape';
import { Selection } from 'd3-selection';
import 'd3-transition';
import { BaseSeries, resolveDashArray, staggerDelay } from '../BaseSeries';
import type { InternalSeriesConfig, PointOptions, MarkerOptions } from '../../types/options';
import { lttbDecimate } from '../../utils/decimation';
import { HoverManager } from '../../interaction/HoverManager';
import {
  ENTRY_DURATION,
  ENTRY_DATALABEL_DELAY,
  ENTRY_STAGGER_PER_ITEM,
  EASE_ENTRY,
} from '../../core/animationConstants';

const symbolMap: Record<string, any> = {
  circle: symbolCircle,
  square: symbolSquare,
  diamond: symbolDiamond,
  triangle: symbolTriangle,
  'triangle-down': symbolTriangle2,
  cross: symbolCross,
};

export class LineChart extends BaseSeries {
  protected pathSelection: Selection<SVGPathElement, any, any, any> | null = null;

  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  render(): void {
    const color = this.getColor();
    const filteredData = this.getFilteredData();
    const animate = this.context.animate;

    if (this.config.zones?.length) {
      this.renderZones(filteredData, color);
    } else if (this.config.negativeColor && this.config.threshold !== null) {
      this.renderNegativeColor(filteredData, color);
    } else {
      this.renderMainLine(filteredData, color, animate);
    }

    this.renderMarkers(filteredData, color, !!animate);
    this.renderHoverTargets(filteredData, color);
    this.renderDataLabels(
      filteredData.filter(d => d.y !== null && d.y !== undefined),
      (d, i) => this.context.xAxis.getPixelForValue(d.x ?? i),
      (d) => this.context.yAxis.getPixelForValue(d.y ?? 0)
    );

    if (animate) {
      this.emitAfterAnimate(ENTRY_DURATION + ENTRY_DATALABEL_DELAY);
    }
  }

  private renderMainLine(data: PointOptions[], color: string, animate?: boolean): void {
    const lineGen = this.buildLineGenerator();

    this.pathSelection = this.group.append('path')
      .datum(data)
      .attr('d', lineGen as any)
      .attr('fill', 'none')
      .attr('stroke', color)
      .attr('stroke-width', this.config.lineWidth ?? 2)
      .attr('stroke-dasharray', resolveDashArray(this.config.dashStyle))
      .attr('stroke-linecap', this.config.linecap || 'round')
      .attr('class', 'katucharts-line');

    if (animate) {
      this.animateLineEntry(this.pathSelection);
    }
  }

  /**
   * Split line into positive/negative segments using threshold and negativeColor.
   */
  private renderNegativeColor(data: PointOptions[], baseColor: string): void {
    const threshold = this.config.threshold ?? 0;
    const negColor = this.config.negativeColor!;
    const lineWidth = this.config.lineWidth ?? 2;
    const linecap = this.config.linecap || 'round';
    const dashArray = resolveDashArray(this.config.dashStyle);

    const segments: { points: PointOptions[]; negative: boolean }[] = [];
    let current: PointOptions[] = [];
    let currentNeg: boolean | null = null;

    for (const d of data) {
      if (d.y === null || d.y === undefined) {
        if (current.length > 0) {
          segments.push({ points: current, negative: currentNeg! });
          current = [];
          currentNeg = null;
        }
        continue;
      }
      const neg = d.y < threshold;
      if (currentNeg !== null && neg !== currentNeg && current.length > 0) {
        segments.push({ points: [...current], negative: currentNeg });
        current = [current[current.length - 1]];
      }
      currentNeg = neg;
      current.push(d);
    }
    if (current.length > 0) {
      segments.push({ points: current, negative: currentNeg! });
    }

    for (const seg of segments) {
      const lineGen = this.buildLineGenerator();
      this.group.append('path')
        .datum(seg.points)
        .attr('d', lineGen as any)
        .attr('fill', 'none')
        .attr('stroke', seg.negative ? negColor : baseColor)
        .attr('stroke-width', lineWidth)
        .attr('stroke-linecap', linecap)
        .attr('stroke-dasharray', dashArray)
        .attr('class', 'katucharts-line katucharts-negative-segment');
    }
  }

  protected renderZones(data: PointOptions[], baseColor: string): void {
    const zones = this.config.zones!;
    const zoneAxis = this.config.zoneAxis || 'y';
    const lineWidth = this.config.lineWidth ?? 2;
    const linecap = this.config.linecap || 'round';

    this.pathSelection?.remove();
    this.pathSelection = null;

    const sortedZones = [...zones].sort((a, b) => (a.value ?? Infinity) - (b.value ?? Infinity));
    const getVal = (d: PointOptions) => zoneAxis === 'x' ? (d.x ?? 0) : (d.y ?? 0);
    const validData = data.filter(d => d.y !== null && d.y !== undefined);

    const buckets: PointOptions[][] = sortedZones.map(() => []);
    const remainingBucket: PointOptions[] = [];

    for (const d of validData) {
      const val = getVal(d);
      let placed = false;
      for (let z = 0; z < sortedZones.length; z++) {
        if (val < (sortedZones[z].value ?? Infinity)) {
          buckets[z].push(d);
          placed = true;
          break;
        }
      }
      if (!placed) remainingBucket.push(d);
    }

    for (let z = 0; z < sortedZones.length; z++) {
      if (buckets[z].length === 0) continue;
      if (z > 0 && buckets[z - 1].length > 0) {
        buckets[z].unshift(buckets[z - 1][buckets[z - 1].length - 1]);
      }
      if (z < sortedZones.length - 1 && buckets[z + 1]?.length > 0) {
        buckets[z].push(buckets[z + 1][0]);
      } else if (remainingBucket.length > 0) {
        buckets[z].push(remainingBucket[0]);
      }
    }

    for (let z = 0; z < sortedZones.length; z++) {
      const zonePoints = buckets[z];
      if (zonePoints.length < 2) continue;

      const zone = sortedZones[z];
      const lineGen = this.buildLineGenerator();
      this.group.append('path')
        .datum(zonePoints)
        .attr('d', lineGen as any)
        .attr('fill', 'none')
        .attr('stroke', zone.color || baseColor)
        .attr('stroke-width', lineWidth)
        .attr('stroke-linecap', linecap)
        .attr('stroke-dasharray', resolveDashArray(zone.dashStyle || this.config.dashStyle))
        .attr('class', 'katucharts-line katucharts-zone');
    }

    if (remainingBucket.length > 0) {
      const lastBucket = buckets[buckets.length - 1];
      if (lastBucket?.length > 0) {
        remainingBucket.unshift(lastBucket[lastBucket.length - 1]);
      }
      if (remainingBucket.length > 1) {
        const lineGen = this.buildLineGenerator();
        this.group.append('path')
          .datum(remainingBucket)
          .attr('d', lineGen as any)
          .attr('fill', 'none')
          .attr('stroke', baseColor)
          .attr('stroke-width', lineWidth)
          .attr('stroke-linecap', linecap)
          .attr('stroke-dasharray', resolveDashArray(this.config.dashStyle))
          .attr('class', 'katucharts-line katucharts-zone');
      }
    }
  }

  animateUpdate(duration: number): void {
    const filteredData = this.getFilteredData();
    const lineGen = this.buildLineGenerator();
    const color = this.getColor();

    if (this.pathSelection && !this.pathSelection.empty()) {
      this.pathSelection
        .datum(filteredData)
        .transition().duration(duration)
        .attr('d', lineGen as any);
    } else {
      this.group.selectAll('.katucharts-line').remove();
      this.renderMainLine(filteredData, color, false);
    }

    this.group.selectAll('.katucharts-markers').remove();
    this.group.selectAll('.katucharts-hover-targets').remove();
    this.group.selectAll('.katucharts-data-labels').remove();

    this.renderMarkers(filteredData, color, false);
    this.renderHoverTargets(filteredData, color);
    this.renderDataLabels(
      filteredData.filter(d => d.y !== null && d.y !== undefined),
      (d, i) => this.context.xAxis.getPixelForValue(d.x ?? i),
      (d) => this.context.yAxis.getPixelForValue(d.y ?? 0)
    );
  }

  protected buildLineGenerator() {
    const { xAxis, yAxis } = this.context;
    const connectNulls = this.config.connectNulls;
    const inverted = !!this.context.inverted;

    const gen = line<PointOptions>()
      .x(d => inverted ? yAxis.getPixelForValue(d.y ?? 0) : xAxis.getPixelForValue(d.x ?? 0))
      .y(d => inverted ? xAxis.getPixelForValue(d.x ?? 0) : yAxis.getPixelForValue(d.y ?? 0))
      .curve(this.getCurve());

    if (!connectNulls) {
      gen.defined(d => d.y !== null && d.y !== undefined);
    }

    return gen;
  }

  protected getFilteredData(): PointOptions[] {
    let filtered: PointOptions[];
    if (this.config.connectNulls) {
      filtered = this.data.filter(d => d.y !== null && d.y !== undefined);
    } else {
      filtered = this.data;
    }

    if (this.context?.plotArea) {
      const pixelWidth = this.context.plotArea.width;
      const threshold = pixelWidth * 4;
      if (filtered.length > threshold) {
        filtered = lttbDecimate(filtered, Math.floor(threshold));
      }
    }

    return filtered;
  }

  protected getCurve() {
    const step = this.config.step;
    if (step === 'left') return curveStepAfter;
    if (step === 'center') return curveStep;
    if (step === 'right') return curveStepBefore;
    return curveLinear;
  }

  protected animateLineEntry(path: Selection<SVGPathElement, any, any, any>): void {
    const totalLength = (path.node() as SVGPathElement)?.getTotalLength?.() || 0;
    if (totalLength > 0) {
      const animOpts = typeof this.config.animation === 'object' ? this.config.animation : {};
      const duration = animOpts.duration ?? ENTRY_DURATION;
      const defer = animOpts.defer ?? 0;
      const origDash = path.attr('stroke-dasharray');
      path
        .attr('stroke-dasharray', `${totalLength} ${totalLength}`)
        .attr('stroke-dashoffset', totalLength)
        .transition().delay(defer).duration(duration).ease(EASE_ENTRY)
        .attr('stroke-dashoffset', 0)
        .on('end', () => {
          path.attr('stroke-dasharray', origDash === 'none' ? null : origDash);
        });
    }
  }

  protected renderMarkers(data: PointOptions[], color: string, animate: boolean): void {
    const markerConfig = this.config.marker;
    const enabledThreshold = markerConfig?.enabledThreshold ?? 2;
    const shouldShowMarkers = markerConfig?.enabled === true
      || (markerConfig?.enabled !== false && data.length <= enabledThreshold * this.context.plotArea.width / 12);

    if (!shouldShowMarkers) return;

    const { xAxis, yAxis } = this.context;
    const radius = markerConfig?.radius ?? 4;
    const markerSymbol = markerConfig?.symbol || 'circle';
    const markersGroup = this.group.append('g').attr('class', 'katucharts-markers');
    const validData = data.filter(d => d.y !== null && d.y !== undefined);

    if (markerSymbol === 'circle') {
      const circles = markersGroup.selectAll('circle')
        .data(validData)
        .join('circle')
        .attr('cx', d => xAxis.getPixelForValue(d.x ?? 0))
        .attr('cy', d => yAxis.getPixelForValue(d.y ?? 0))
        .attr('fill', (d, i) => this.getMarkerFill(d, i, markerConfig, color))
        .attr('stroke', markerConfig?.lineColor || '#fff')
        .attr('stroke-width', markerConfig?.lineWidth ?? 1)
        .attr('class', 'katucharts-marker');

      if (animate) {
        circles.attr('r', 0)
          .transition()
          .delay((_, i) => staggerDelay(i, ENTRY_DATALABEL_DELAY, ENTRY_STAGGER_PER_ITEM, validData.length))
          .duration(ENTRY_DURATION).ease(EASE_ENTRY)
          .attr('r', (d) => d.marker?.radius ?? radius);
      } else {
        circles.attr('r', (d) => d.marker?.radius ?? radius);
      }
    } else {
      const symbolType = symbolMap[markerSymbol] || symbolCircle;
      const symbolSize = Math.PI * radius * radius;
      const gen = d3Symbol().type(symbolType).size(symbolSize);

      const paths = markersGroup.selectAll('path')
        .data(validData)
        .join('path')
        .attr('transform', d =>
          `translate(${xAxis.getPixelForValue(d.x ?? 0)},${yAxis.getPixelForValue(d.y ?? 0)})`
        )
        .attr('fill', (d, i) => this.getMarkerFill(d, i, markerConfig, color))
        .attr('stroke', markerConfig?.lineColor || '#fff')
        .attr('stroke-width', markerConfig?.lineWidth ?? 1)
        .attr('class', 'katucharts-marker');

      if (animate) {
        const zeroGen = d3Symbol().type(symbolType).size(0);
        paths.attr('d', zeroGen as any)
          .transition()
          .delay((_, i) => staggerDelay(i, ENTRY_DATALABEL_DELAY, ENTRY_STAGGER_PER_ITEM, validData.length))
          .duration(ENTRY_DURATION).ease(EASE_ENTRY)
          .attr('d', (d) => {
            const r = d.marker?.radius ?? radius;
            return d3Symbol().type(symbolType).size(Math.PI * r * r)() as string;
          });
      } else {
        paths.attr('d', (d) => {
          const r = d.marker?.radius ?? radius;
          return d3Symbol().type(symbolType).size(Math.PI * r * r)() as string;
        });
      }
    }
  }

  private getMarkerFill(d: PointOptions, i: number, markerConfig: MarkerOptions | undefined, seriesColor: string): string {
    if (d.color) return d.color;
    if (d.marker?.fillColor) return d.marker.fillColor;
    if (markerConfig?.fillColor) return markerConfig.fillColor;
    if (this.config.negativeColor && (d.y ?? 0) < (this.config.threshold ?? 0)) {
      return this.config.negativeColor;
    }
    return seriesColor;
  }

  protected renderHoverTargets(data: PointOptions[], color: string): void {
    if (this.config.enableMouseTracking === false) return;

    const markerRadius = this.config.marker?.radius ?? 4;
    const hoverState = this.config.marker?.states?.hover;
    const hoverRadiusPlus = hoverState?.radiusPlus ?? 2;
    const hoverRadius = hoverState?.radius ?? (markerRadius + hoverRadiusPlus);
    const hoverLineWidthPlus = hoverState?.lineWidthPlus ?? 1;
    const hoverLineWidth = hoverState?.lineWidth ?? ((this.config.marker?.lineWidth ?? 1) + hoverLineWidthPlus);
    const lineWidthPlus = this.config.states?.hover?.lineWidthPlus ?? 1;
    const haloConfig = this.config.states?.hover?.halo;

    new HoverManager({
      series: this,
      group: this.group,
      data,
      xAxis: this.context.xAxis,
      yAxis: this.context.yAxis,
      plotArea: this.context.plotArea,
      events: this.context.events,
      haloSize: haloConfig?.size ?? 10,
      haloOpacity: haloConfig?.opacity ?? 0.25,
      markerRadius,
      hoverRadius,
      hoverLineWidth,
      cursor: this.config.cursor || 'pointer',
      pathSelection: this.pathSelection,
      lineWidthPlus,
      baseLineWidth: this.config.lineWidth ?? 2,
      getColor: (d) => d.color || color,
    });
  }
}

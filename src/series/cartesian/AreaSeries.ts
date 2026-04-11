/**
 * Area and AreaSpline series with features:
 * stacking (normal/percent), negativeFillColor, zones, markers,
 * trackByArea, connectNulls, dashStyle, data labels, and animated updates.
 */

import { area, line, curveLinear, curveCatmullRom, curveStep, curveStepAfter, curveStepBefore, symbol as d3Symbol, symbolCircle, symbolSquare, symbolDiamond, symbolTriangle, symbolTriangle2, symbolCross } from 'd3-shape';
import { Selection } from 'd3-selection';
import 'd3-transition';
import { BaseSeries, resolveDashArray, staggerDelay } from '../BaseSeries';
import type { InternalSeriesConfig, PointOptions } from '../../types/options';
import { lttbDecimate } from '../../utils/decimation';
import {
  ENTRY_DURATION,
  ENTRY_DATALABEL_DELAY,
  ENTRY_STAGGER_PER_ITEM,
  HOVER_DURATION,
  EASE_ENTRY,
  EASE_HOVER,
} from '../../core/animationConstants';

const symbolMap: Record<string, any> = {
  circle: symbolCircle,
  square: symbolSquare,
  diamond: symbolDiamond,
  triangle: symbolTriangle,
  'triangle-down': symbolTriangle2,
  cross: symbolCross,
};

export class AreaSeries extends BaseSeries {
  protected isSpline = false;
  private areaPath: Selection<SVGPathElement, any, any, any> | null = null;
  private linePath: Selection<SVGPathElement, any, any, any> | null = null;
  private negAreaPath: Selection<SVGPathElement, any, any, any> | null = null;

  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  render(): void {
    const color = this.getColor();
    const data = this.getFilteredData();
    const animate = this.context.animate;

    if (this.config.zones?.length) {
      this.renderZones(data, color);
    } else if (this.config.negativeFillColor || this.config.negativeColor) {
      this.renderWithNegativeColor(data, color, !!animate);
    } else {
      this.renderMainArea(data, color, !!animate);
    }

    this.renderMarkers(data, color, !!animate);

    if (this.config.trackByArea) {
      this.renderAreaHoverTargets(data, color);
    } else {
      this.renderHoverTargets(data, color);
    }

    this.renderDataLabels(
      data.filter(d => d.y !== null && d.y !== undefined),
      (d, i) => this.context.xAxis.getPixelForValue(d.x ?? i),
      (d) => this.context.yAxis.getPixelForValue(d.y ?? 0)
    );

    if (animate) {
      this.emitAfterAnimate(ENTRY_DURATION + ENTRY_DATALABEL_DELAY);
    }
  }

  private renderMainArea(data: PointOptions[], color: string, animate: boolean): void {
    const { areaGen, lineGen } = this.buildGenerators();
    const lineColor = this.config.lineColor || color;

    this.areaPath = this.group.append('path')
      .datum(data)
      .attr('d', areaGen as any)
      .attr('fill', this.config.fillColor || color)
      .attr('class', 'katucharts-area');

    this.linePath = this.group.append('path')
      .datum(data)
      .attr('d', lineGen as any)
      .attr('fill', 'none')
      .attr('stroke', lineColor)
      .attr('stroke-width', this.config.lineWidth ?? 2)
      .attr('stroke-linecap', this.config.linecap || 'round')
      .attr('stroke-dasharray', resolveDashArray(this.config.dashStyle))
      .attr('class', 'katucharts-area-line');

    if (animate) {
      const animOpts = typeof this.config.animation === 'object' ? this.config.animation : {};
      const duration = animOpts.duration ?? ENTRY_DURATION;
      this.areaPath
        .attr('fill-opacity', 0)
        .transition().duration(duration).ease(EASE_ENTRY)
        .attr('fill-opacity', this.config.fillOpacity ?? 0.75);

      this.animateLineEntry(this.linePath);
    } else {
      this.areaPath.attr('fill-opacity', this.config.fillOpacity ?? 0.75);
    }
  }

  private renderWithNegativeColor(data: PointOptions[], color: string, animate: boolean): void {
    const { xAxis, yAxis } = this.context;
    const threshold = this.config.threshold ?? 0;
    const baseline = yAxis.getPixelForValue(threshold);
    const curveFactory = this.getCurve();
    const fillOpacity = this.config.fillOpacity ?? 0.75;
    const negFill = this.config.negativeFillColor || this.config.negativeColor || color;
    const posFill = this.config.fillColor || color;
    const lineColor = this.config.lineColor || color;

    const posData = data.filter(d => d.y !== null && d.y !== undefined && (d.y ?? 0) >= threshold);
    const negData = data.filter(d => d.y !== null && d.y !== undefined && (d.y ?? 0) < threshold);

    if (posData.length > 0) {
      const posArea = area<PointOptions>()
        .x(d => xAxis.getPixelForValue(d.x ?? 0))
        .y0(baseline)
        .y1(d => yAxis.getPixelForValue(d.y ?? 0))
        .curve(curveFactory);

      this.areaPath = this.group.append('path')
        .datum(posData)
        .attr('d', posArea as any)
        .attr('fill', posFill)
        .attr('fill-opacity', fillOpacity)
        .attr('class', 'katucharts-area katucharts-area-positive');
    }

    if (negData.length > 0) {
      const negArea = area<PointOptions>()
        .x(d => xAxis.getPixelForValue(d.x ?? 0))
        .y0(baseline)
        .y1(d => yAxis.getPixelForValue(d.y ?? 0))
        .curve(curveFactory);

      this.negAreaPath = this.group.append('path')
        .datum(negData)
        .attr('d', negArea as any)
        .attr('fill', negFill)
        .attr('fill-opacity', fillOpacity)
        .attr('class', 'katucharts-area katucharts-area-negative');
    }

    const lineGen = line<PointOptions>()
      .defined(d => d.y !== null && d.y !== undefined)
      .x(d => xAxis.getPixelForValue(d.x ?? 0))
      .y(d => yAxis.getPixelForValue(d.y ?? 0))
      .curve(curveFactory);

    this.linePath = this.group.append('path')
      .datum(data)
      .attr('d', lineGen as any)
      .attr('fill', 'none')
      .attr('stroke', lineColor)
      .attr('stroke-width', this.config.lineWidth ?? 2)
      .attr('stroke-linecap', this.config.linecap || 'round')
      .attr('stroke-dasharray', resolveDashArray(this.config.dashStyle))
      .attr('class', 'katucharts-area-line');

    if (animate) {
      const animOpts = typeof this.config.animation === 'object' ? this.config.animation : {};
      const duration = animOpts.duration ?? ENTRY_DURATION;
      if (this.areaPath) {
        this.areaPath.attr('fill-opacity', 0)
          .transition().duration(duration).ease(EASE_ENTRY)
          .attr('fill-opacity', fillOpacity);
      }
      if (this.negAreaPath) {
        this.negAreaPath.attr('fill-opacity', 0)
          .transition().duration(duration).ease(EASE_ENTRY)
          .attr('fill-opacity', fillOpacity);
      }
      this.animateLineEntry(this.linePath);
    }
  }

  private renderZones(data: PointOptions[], baseColor: string): void {
    const { xAxis, yAxis } = this.context;
    const zones = this.config.zones!;
    const zoneAxis = this.config.zoneAxis || 'y';
    const fillOpacity = this.config.fillOpacity ?? 0.75;
    const lineWidth = this.config.lineWidth ?? 2;
    const curveFactory = this.getCurve();
    const baseline = yAxis.getPixelForValue(this.config.threshold ?? 0);

    const sortedZones = [...zones].sort((a, b) => (a.value ?? Infinity) - (b.value ?? Infinity));
    const getVal = (d: PointOptions) => zoneAxis === 'x' ? (d.x ?? 0) : (d.y ?? 0);
    const validData = data.filter(d => d.y !== null && d.y !== undefined);

    let prevThreshold = -Infinity;
    const renderZoneSegment = (points: PointOptions[], color: string, fillColor?: string, dashStyle?: string) => {
      if (points.length < 2) return;

      const aGen = area<PointOptions>()
        .x(d => xAxis.getPixelForValue(d.x ?? 0))
        .y0(baseline)
        .y1(d => yAxis.getPixelForValue(d.y ?? 0))
        .curve(curveFactory);

      this.group.append('path')
        .datum(points)
        .attr('d', aGen as any)
        .attr('fill', fillColor || color)
        .attr('fill-opacity', fillOpacity)
        .attr('class', 'katucharts-area katucharts-zone');

      const lGen = line<PointOptions>()
        .x(d => xAxis.getPixelForValue(d.x ?? 0))
        .y(d => yAxis.getPixelForValue(d.y ?? 0))
        .curve(curveFactory);

      this.group.append('path')
        .datum(points)
        .attr('d', lGen as any)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', lineWidth)
        .attr('stroke-dasharray', resolveDashArray(dashStyle || this.config.dashStyle))
        .attr('class', 'katucharts-area-line katucharts-zone');
    };

    for (const zone of sortedZones) {
      const threshold = zone.value ?? Infinity;
      const zoneColor = zone.color || baseColor;
      const zoneFill = zone.fillColor || zoneColor;

      const points: PointOptions[] = [];
      for (let j = 0; j < validData.length; j++) {
        const val = getVal(validData[j]);
        if (val >= prevThreshold && val < threshold) {
          if (points.length === 0 && j > 0) points.push(validData[j - 1]);
          points.push(validData[j]);
        } else if (val >= threshold && points.length > 0) {
          points.push(validData[j]);
          break;
        }
      }

      renderZoneSegment(points, zoneColor, zoneFill, zone.dashStyle);
      prevThreshold = threshold;
    }

    if (prevThreshold !== Infinity) {
      const remaining: PointOptions[] = [];
      for (let j = 0; j < validData.length; j++) {
        const val = getVal(validData[j]);
        if (val >= prevThreshold) {
          if (remaining.length === 0 && j > 0) remaining.push(validData[j - 1]);
          remaining.push(validData[j]);
        }
      }
      renderZoneSegment(remaining, baseColor, this.config.fillColor);
    }
  }

  protected getCurve() {
    if (this.isSpline) return curveCatmullRom.alpha(0.5);
    const step = this.config.step;
    if (step === 'left') return curveStepAfter;
    if (step === 'center') return curveStep;
    if (step === 'right') return curveStepBefore;
    return curveLinear;
  }

  private getFilteredData(): PointOptions[] {
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

  private buildGenerators() {
    const { xAxis, yAxis } = this.context;
    const baseline = yAxis.getPixelForValue(this.config.threshold ?? 0);
    const curveFactory = this.getCurve();
    const stackOffsets = this.context.stackOffsets;
    const stacking = this.config.stacking;
    const connectNulls = this.config.connectNulls;

    const getStackedY = (d: PointOptions): number => {
      if (!stacking || !stackOffsets) return d.y ?? 0;
      const offset = stackOffsets.get(d.x ?? 0) || 0;
      return offset + (d.y ?? 0);
    };

    const getStackedBase = (d: PointOptions): number => {
      if (!stacking || !stackOffsets) return this.config.threshold ?? 0;
      return stackOffsets.get(d.x ?? 0) || 0;
    };

    const areaGen = area<PointOptions>()
      .x(d => xAxis.getPixelForValue(d.x ?? 0))
      .y0(d => stacking ? yAxis.getPixelForValue(getStackedBase(d)) : baseline)
      .y1(d => yAxis.getPixelForValue(getStackedY(d)))
      .curve(curveFactory);

    const lineGen = line<PointOptions>()
      .x(d => xAxis.getPixelForValue(d.x ?? 0))
      .y(d => yAxis.getPixelForValue(getStackedY(d)))
      .curve(curveFactory);

    if (!connectNulls) {
      areaGen.defined(d => d.y !== null && d.y !== undefined);
      lineGen.defined(d => d.y !== null && d.y !== undefined);
    }

    return { areaGen, lineGen };
  }

  animateUpdate(duration: number): void {
    const data = this.getFilteredData();
    const { areaGen, lineGen } = this.buildGenerators();
    const color = this.getColor();

    if (this.areaPath && !this.areaPath.empty()) {
      this.areaPath.datum(data).transition().duration(duration).attr('d', areaGen as any);
    }
    if (this.linePath && !this.linePath.empty()) {
      this.linePath.datum(data).transition().duration(duration).attr('d', lineGen as any);
    }

    this.group.selectAll('.katucharts-hover-targets').remove();
    this.group.selectAll('.katucharts-markers').remove();
    this.group.selectAll('.katucharts-data-labels').remove();

    this.renderMarkers(data, color, false);
    if (this.config.trackByArea) {
      this.renderAreaHoverTargets(data, color);
    } else {
      this.renderHoverTargets(data, color);
    }
    this.renderDataLabels(
      data.filter(d => d.y !== null && d.y !== undefined),
      (d, i) => this.context.xAxis.getPixelForValue(d.x ?? i),
      (d) => this.context.yAxis.getPixelForValue(d.y ?? 0)
    );
  }

  private animateLineEntry(path: Selection<SVGPathElement, any, any, any>): void {
    const totalLen = (path.node() as SVGPathElement)?.getTotalLength?.() || 0;
    if (totalLen > 0) {
      const animOpts = typeof this.config.animation === 'object' ? this.config.animation : {};
      const duration = animOpts.duration ?? ENTRY_DURATION;
      const defer = animOpts.defer ?? 0;
      const origDash = path.attr('stroke-dasharray');
      path
        .attr('stroke-dasharray', `${totalLen} ${totalLen}`)
        .attr('stroke-dashoffset', totalLen)
        .transition().delay(defer).duration(duration).ease(EASE_ENTRY)
        .attr('stroke-dashoffset', 0)
        .on('end', () => path.attr('stroke-dasharray', origDash === 'none' ? null : origDash));
    }
  }

  protected renderMarkers(data: PointOptions[], color: string, animate: boolean): void {
    const markerConfig = this.config.marker;
    if (markerConfig?.enabled !== true) return;

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
        .attr('fill', d => d.color || markerConfig?.fillColor || color)
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

      const paths = markersGroup.selectAll('path')
        .data(validData)
        .join('path')
        .attr('transform', d =>
          `translate(${xAxis.getPixelForValue(d.x ?? 0)},${yAxis.getPixelForValue(d.y ?? 0)})`
        )
        .attr('fill', d => d.color || markerConfig?.fillColor || color)
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

  /**
   * Track hover by area fill region, not just individual points.
   */
  private renderAreaHoverTargets(data: PointOptions[], color: string): void {
    if (this.config.enableMouseTracking === false) return;

    const { xAxis, yAxis } = this.context;
    const baseline = yAxis.getPixelForValue(this.config.threshold ?? 0);
    const curveFactory = this.getCurve();

    const hitArea = area<PointOptions>()
      .x(d => xAxis.getPixelForValue(d.x ?? 0))
      .y0(baseline)
      .y1(d => yAxis.getPixelForValue(d.y ?? 0))
      .curve(curveFactory);

    const validData = data.filter(d => d.y !== null && d.y !== undefined);

    const hitPath = this.group.append('path')
      .datum(validData)
      .attr('d', hitArea as any)
      .attr('fill', 'transparent')
      .attr('class', 'katucharts-hover-targets')
      .style('cursor', this.config.cursor || 'pointer');

    hitPath
      .on('mousemove', (event: MouseEvent) => {
        const [mx] = [event.offsetX - (this.context.plotArea.x || 0)];
        let closestIdx = 0;
        let closestDist = Infinity;
        validData.forEach((d, i) => {
          const px = xAxis.getPixelForValue(d.x ?? 0);
          const dist = Math.abs(px - mx);
          if (dist < closestDist) {
            closestDist = dist;
            closestIdx = i;
          }
        });
        const d = validData[closestIdx];
        this.context.events.emit('point:mouseover', {
          point: d, index: closestIdx, series: this, event,
          plotX: xAxis.getPixelForValue(d.x ?? 0),
          plotY: yAxis.getPixelForValue(d.y ?? 0),
        });
      })
      .on('mouseout', (event: MouseEvent) => {
        this.context.events.emit('point:mouseout', { point: validData[0], index: 0, series: this, event });
      })
      .on('click', (event: MouseEvent) => {
        const [mx] = [event.offsetX - (this.context.plotArea.x || 0)];
        let closestIdx = 0;
        let closestDist = Infinity;
        validData.forEach((d, i) => {
          const px = xAxis.getPixelForValue(d.x ?? 0);
          const dist = Math.abs(px - mx);
          if (dist < closestDist) {
            closestDist = dist;
            closestIdx = i;
          }
        });
        const d = validData[closestIdx];
        this.context.events.emit('point:click', { point: d, index: closestIdx, series: this, event });
        d.events?.click?.call(d, event);
        this.config.events?.click?.call(this, event);
      });
  }

  private renderHoverTargets(data: PointOptions[], color: string): void {
    if (this.config.enableMouseTracking === false) return;

    const { xAxis, yAxis } = this.context;
    const hoverGroup = this.group.append('g').attr('class', 'katucharts-hover-targets');
    const hoverRadius = this.config.marker?.states?.hover?.radius ?? 6;
    const validData = data.filter(d => d.y !== null && d.y !== undefined);
    const haloConfig = this.config.states?.hover?.halo;
    const haloSize = haloConfig?.size ?? 10;
    const haloOpacity = haloConfig?.opacity ?? 0.25;

    validData.forEach((d, i) => {
      const cx = xAxis.getPixelForValue(d.x ?? 0);
      const cy = yAxis.getPixelForValue(d.y ?? 0);

      const halo = hoverGroup.append('circle')
        .attr('cx', cx).attr('cy', cy)
        .attr('r', 0)
        .attr('fill', d.color || color)
        .attr('opacity', 0)
        .attr('class', 'katucharts-halo');

      const marker = hoverGroup.append('circle')
        .attr('cx', cx).attr('cy', cy)
        .attr('r', 0)
        .attr('fill', d.color || color)
        .attr('stroke', '#fff')
        .attr('stroke-width', 1)
        .attr('class', 'katucharts-hover-marker');

      const hitArea = hoverGroup.append('circle')
        .attr('cx', cx).attr('cy', cy)
        .attr('r', 15)
        .attr('fill', 'transparent')
        .style('cursor', this.config.cursor || 'pointer');

      hitArea
        .on('mouseover', (event: MouseEvent) => {
          halo.transition().duration(HOVER_DURATION).ease(EASE_HOVER)
            .attr('r', haloSize)
            .attr('opacity', haloOpacity);
          marker.transition().duration(HOVER_DURATION).ease(EASE_HOVER).attr('r', hoverRadius);
          this.context.events.emit('point:mouseover', {
            point: d, index: i, series: this, event, plotX: cx, plotY: cy,
          });
          d.events?.mouseOver?.call(d, event);
          this.config.point?.events?.mouseOver?.call(d, event);
        })
        .on('mouseout', (event: MouseEvent) => {
          halo.transition().duration(HOVER_DURATION).ease(EASE_HOVER)
            .attr('r', 0)
            .attr('opacity', 0);
          marker.transition().duration(HOVER_DURATION).ease(EASE_HOVER).attr('r', 0);
          this.context.events.emit('point:mouseout', { point: d, index: i, series: this, event });
          d.events?.mouseOut?.call(d, event);
          this.config.point?.events?.mouseOut?.call(d, event);
        })
        .on('click', (event: MouseEvent) => {
          this.context.events.emit('point:click', { point: d, index: i, series: this, event });
          d.events?.click?.call(d, event);
          this.config.point?.events?.click?.call(d, event);
          this.config.events?.click?.call(this, event);
          this.handlePointSelect(marker, d, i, event);
        });
    });
  }
}

export class AreaSplineSeries extends AreaSeries {
  protected isSpline = true;
}

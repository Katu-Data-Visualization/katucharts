import { BaseSeries } from '../BaseSeries';
import { area as d3area, line as d3line, curveLinear, curveCatmullRom, type CurveFactory } from 'd3-shape';
import type { InternalSeriesConfig } from '../../types/options';
import { ENTRY_DURATION, EASE_ENTRY } from '../../core/animationConstants';
import { isGradientColor, resolveFillPaint } from '../../utils/gradient';

export class AreaRangeChart extends BaseSeries {
  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  /** Curve used for the band edges. Overridden by areasplinerange for smoothing. */
  protected getCurve(): CurveFactory {
    return curveLinear;
  }

  render(): void {
    const { xAxis, yAxis, plotArea } = this.context;
    const animate = this.context.animate;
    const data = this.data;

    /**
     * `color` may be a gradient object (the Highcharts pattern for arearange
     * bands). Keep a solid base color for the line/legend, and resolve the fill
     * — from `fillColor` or `color` — into an SVG paint (a `<linearGradient>`
     * def referenced by url) so the band shows the gradient instead of a broken
     * "[object Object]" black fill.
     */
    const rawColor = this.config.color;
    const paletteColor = this.context.colors[this.context.colorIndex % this.context.colors.length];
    const baseColor = this.gradientBaseColor(rawColor)
      ?? (isGradientColor(rawColor) ? paletteColor : (rawColor || paletteColor));
    const fillSource = (this.config as any).fillColor ?? rawColor;
    const fillColor = resolveFillPaint(fillSource, this.group, baseColor);
    const fillOpacity = (this.config as any).fillOpacity ?? (isGradientColor(fillSource) ? 1 : 0.3);
    const lineColor = (this.config as any).lineColor || baseColor;
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
      .curve(this.getCurve());

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
        .curve(this.getCurve());

      const bottomLineGen = d3line<any>()
        .x((d, i) => xVal(d, i))
        .y(d => lowVal(d))
        .curve(this.getCurve());

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
        .curve(this.getCurve());

      areaPath
        .attr('d', flatArea)
        .transition().duration(ENTRY_DURATION).ease(EASE_ENTRY)
        .attr('d', areaGen);

      if (lineWidth > 0) {
        const flatLine = d3line<any>()
          .x((d, i) => xVal(d, i))
          .y(() => midY)
          .curve(this.getCurve());

        const flatLinePath = flatLine(validData) || '';
        const topLinePath = d3line<any>().x((d, i) => xVal(d, i)).y(d => highVal(d)).curve(this.getCurve())(validData) || '';
        const bottomLinePath = d3line<any>().x((d, i) => xVal(d, i)).y(d => lowVal(d)).curve(this.getCurve())(validData) || '';

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

    this.setupHoverMarkers(validData, xVal, lowVal, highVal, baseColor);
  }

  /**
   * Picks a solid representative color from a gradient `color` (the first fully
   * opaque stop, else the middle stop) so line/markers match the band instead
   * of falling back to an unrelated palette color. Returns null for non-gradients.
   */
  private gradientBaseColor(color: unknown): string | null {
    if (!isGradientColor(color)) return null;
    const stops = (color as any).stops as [number, string][] | undefined;
    if (!Array.isArray(stops) || stops.length === 0) return null;
    for (const [, c] of stops) {
      if (typeof c === 'string' && !/rgba?\([^)]*,\s*0?\.\d+\s*\)/.test(c)) return c;
    }
    return stops[Math.floor(stops.length / 2)]?.[1] ?? null;
  }

  private hoverHandlers?: { over: (p: any) => void; out: () => void };

  /**
   * Shows diamond markers at the band's high and low for the hovered category,
   * so a shared-tooltip hover highlights the range extremes (the line series
   * draws its own marker). Driven by the `point:mouseover` event the hovered
   * series emits, matched by x so it works in shared mode.
   */
  private setupHoverMarkers(
    validData: any[],
    xVal: (d: any, i: number) => number,
    lowVal: (d: any) => number,
    highVal: (d: any) => number,
    color: string
  ): void {
    const events = this.context.events;
    if (this.hoverHandlers) {
      events.off('point:mouseover', this.hoverHandlers.over);
      events.off('point:mouseout', this.hoverHandlers.out);
      events.off('series:mouseleave', this.hoverHandlers.out);
    }
    if (this.config.enableMouseTracking === false) return;

    const g = this.group.append('g').attr('class', 'katucharts-arearange-hover').style('pointer-events', 'none');
    const radius = this.config.marker?.radius ?? 4;
    const mk = () => g.append('circle').attr('r', radius).attr('fill', color)
      .attr('stroke', '#ffffff').attr('stroke-width', 1).attr('opacity', 0);
    const high = mk();
    const low = mk();

    const byX = new Map<number | string, { x: number; hi: number; lo: number }>();
    validData.forEach((d, i) => byX.set(d.x ?? i, { x: xVal(d, i), hi: highVal(d), lo: lowVal(d) }));

    const over = (p: any): void => {
      const pos = byX.get(p?.point?.x);
      if (!pos) { high.attr('opacity', 0); low.attr('opacity', 0); return; }
      high.attr('cx', pos.x).attr('cy', pos.hi).attr('opacity', 1);
      low.attr('cx', pos.x).attr('cy', pos.lo).attr('opacity', 1);
    };
    const out = (): void => { high.attr('opacity', 0); low.attr('opacity', 0); };

    events.on('point:mouseover', over);
    events.on('point:mouseout', out);
    events.on('series:mouseleave', out);
    this.hoverHandlers = { over, out };
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

/**
 * Area range with smoothed (Catmull-Rom) band edges.
 */
export class AreaSplineRangeChart extends AreaRangeChart {
  protected getCurve(): CurveFactory {
    return curveCatmullRom.alpha(0.5);
  }
}

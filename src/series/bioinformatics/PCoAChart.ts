/**
 * PCoA / Ordination scatter plot with an optional confidence ellipse per series.
 *
 * Behaves like scatter for point rendering but owns the ellipse: its extents are
 * contributed to the axis domain calculation and the ellipse path is rendered inside
 * the series group, so ellipses always fit inside the plot area without callers having
 * to pre-compute axis min/max.
 */

import { BaseSeries } from '../BaseSeries';
import { ScatterChart } from '../cartesian/ScatterChart';
import type { InternalSeriesConfig } from '../../types/options';

const ELLIPSE_SAMPLES = 180;
const ELLIPSE_EXTENT_PADDING = 0.08;

export class PCoAChart extends ScatterChart {
  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  getDataExtents(): { xMin: number; xMax: number; yMin: number; yMax: number } {
    const base = BaseSeries.prototype.getDataExtents.call(this);
    const ellipse = this.config.ellipse;
    if (!ellipse) return base;

    const bbox = computeEllipseBBox(ellipse);
    if (!bbox) return base;

    const pointsValid = isFinite(base.xMin) && isFinite(base.xMax)
      && isFinite(base.yMin) && isFinite(base.yMax);

    const xMin = pointsValid ? Math.min(base.xMin, bbox.xMin) : bbox.xMin;
    const xMax = pointsValid ? Math.max(base.xMax, bbox.xMax) : bbox.xMax;
    const yMin = pointsValid ? Math.min(base.yMin, bbox.yMin) : bbox.yMin;
    const yMax = pointsValid ? Math.max(base.yMax, bbox.yMax) : bbox.yMax;

    const xPad = (xMax - xMin) * ELLIPSE_EXTENT_PADDING || Math.abs(xMax) * ELLIPSE_EXTENT_PADDING || ELLIPSE_EXTENT_PADDING;
    const yPad = (yMax - yMin) * ELLIPSE_EXTENT_PADDING || Math.abs(yMax) * ELLIPSE_EXTENT_PADDING || ELLIPSE_EXTENT_PADDING;

    return {
      xMin: xMin - xPad,
      xMax: xMax + xPad,
      yMin: yMin - yPad,
      yMax: yMax + yPad,
    };
  }

  render(): void {
    this.renderEllipse();
    super.render();
  }

  animateUpdate(duration: number): void {
    this.group.select('.katucharts-pcoa-ellipse').remove();
    this.renderEllipse();
    super.animateUpdate(duration);
  }

  private renderEllipse(): void {
    const ellipse = this.config.ellipse;
    if (!ellipse) return;

    const { xAxis, yAxis } = this.context;
    const polyline = ellipse.boundary?.length
      ? ellipse.boundary
      : sampleParametricEllipse(ellipse);
    if (!polyline || polyline.length < 3) return;

    const d = polyline.map(([x, y], i) => {
      const px = xAxis.getPixelForValue(x);
      const py = yAxis.getPixelForValue(y);
      return `${i === 0 ? 'M' : 'L'} ${px} ${py}`;
    }).join(' ') + ' Z';

    const color = this.getColor();
    this.group.insert('path', ':first-child')
      .attr('class', 'katucharts-pcoa-ellipse')
      .attr('d', d)
      .attr('fill', ellipse.fill ?? color)
      .attr('fill-opacity', ellipse.fillOpacity ?? 0.15)
      .attr('stroke', ellipse.stroke ?? color)
      .attr('stroke-width', ellipse.strokeWidth ?? 2)
      .style('pointer-events', 'none');
  }
}

interface EllipseBBox {
  xMin: number; xMax: number; yMin: number; yMax: number;
}

function computeEllipseBBox(ellipse: NonNullable<InternalSeriesConfig['ellipse']>): EllipseBBox | null {
  if (ellipse.boundary?.length) {
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    for (const [x, y] of ellipse.boundary) {
      if (x < xMin) xMin = x;
      if (x > xMax) xMax = x;
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
    }
    if (!isFinite(xMin)) return null;
    return { xMin, xMax, yMin, yMax };
  }

  const { cx, cy, rx, ry, rotation } = ellipse;
  if (cx === undefined || cy === undefined || rx === undefined || ry === undefined) return null;

  const theta = rotation ?? 0;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const dx = Math.sqrt(rx * rx * cos * cos + ry * ry * sin * sin);
  const dy = Math.sqrt(rx * rx * sin * sin + ry * ry * cos * cos);
  return {
    xMin: cx - dx,
    xMax: cx + dx,
    yMin: cy - dy,
    yMax: cy + dy,
  };
}

function sampleParametricEllipse(
  ellipse: NonNullable<InternalSeriesConfig['ellipse']>
): [number, number][] | null {
  const { cx, cy, rx, ry, rotation } = ellipse;
  if (cx === undefined || cy === undefined || rx === undefined || ry === undefined) return null;
  const theta = rotation ?? 0;
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const out: [number, number][] = [];
  for (let i = 0; i < ELLIPSE_SAMPLES; i++) {
    const t = (i / ELLIPSE_SAMPLES) * Math.PI * 2;
    const ux = rx * Math.cos(t);
    const uy = ry * Math.sin(t);
    out.push([cx + ux * cosT - uy * sinT, cy + ux * sinT + uy * cosT]);
  }
  return out;
}

import { scaleSequential, scaleLinear, scaleLog } from 'd3-scale';
import { interpolateYlOrRd } from 'd3-scale-chromatic';
import { select } from 'd3-selection';
import { color as d3Color, rgb } from 'd3-color';
import { interpolateRgb } from 'd3-interpolate';
import 'd3-transition';
import { BaseSeries } from '../BaseSeries';
import type { InternalSeriesConfig, ColorAxisOptions, BorderRadiusOptions } from '../../types/options';
import { templateFormat, stripHtmlTags } from '../../utils/format';
import { HOVER_DURATION, EASE_HOVER } from '../../core/animationConstants';
import { DEFAULT_CHART_TEXT_COLOR, DEFAULT_CHART_TEXT_SIZE } from '../../utils/chartText';

function resolveBorderRadius(val: number | BorderRadiusOptions | undefined): number {
  if (val === undefined) return 4;
  if (typeof val === 'number') return val;
  return val.radius ?? 4;
}

export class HeatmapSeries extends BaseSeries {
  constructor(config: InternalSeriesConfig) {
    super(config);
    config.showInLegend = false;
  }

  render(): void {
    const { plotArea } = this.context;
    const animate = this.context.animate;
    const data = this.data;

    const colorAxisCfg: ColorAxisOptions = (this.config as any).colorAxis || {};
    const values = data
      .map(d => (d as any).value ?? (d as any).z ?? d.y ?? 0)
      .filter(v => v !== null && v !== undefined);
    const minVal = colorAxisCfg.min ?? (values.length > 0 ? Math.min(...values) : 0);
    const maxVal = colorAxisCfg.max ?? (values.length > 0 ? Math.max(...values) : 1);
    const nullColor = this.config.nullColor ?? '#e4e4e4';
    const inactiveOpacity = this.config.states?.inactive?.opacity ?? 0.4;

    const colorScale = this.buildColorScale(colorAxisCfg, minVal, maxVal);
    const useInterpolation = (this.config as any).interpolation === true;

    const colsize = (this.config as any).colsize ?? 1;
    const rowsize = (this.config as any).rowsize ?? 1;
    const pointPadding = this.config.pointPadding ?? 0;

    const xCategories = this.getUniqueValues('x');
    const yCategories = this.getUniqueValues('yCategory');

    const useCategorical = xCategories.length > 0 && yCategories.length > 0;
    const cellWidth = useCategorical
      ? plotArea.width / xCategories.length
      : plotArea.width / Math.max(1, Math.ceil((Math.max(...data.map(d => d.x ?? 0)) + colsize) / colsize));
    const cellHeight = useCategorical
      ? plotArea.height / yCategories.length
      : plotArea.height / Math.max(1, Math.ceil((Math.max(...data.map(d => d.y ?? 0)) + rowsize) / rowsize));

    const getCellColor = (d: any): string => {
      if (d.color) return d.color;
      const val = d.value ?? d.z ?? d.y;
      if (val === null || val === undefined) return nullColor;
      return colorScale(val);
    };

    const getCellX = (d: any): number => {
      if (useCategorical) {
        const xIdx = typeof d.x === 'number' ? d.x : 0;
        return xIdx * cellWidth;
      }
      return ((d.x ?? 0) / colsize) * cellWidth;
    };

    const getCellY = (d: any): number => {
      if (useCategorical) {
        const yIdx = typeof (d as any).yCategory === 'number'
          ? (d as any).yCategory
          : (typeof d.y === 'number' ? d.y : 0);
        return yIdx * cellHeight;
      }
      return ((d.y ?? 0) / rowsize) * cellHeight;
    };

    const padX = pointPadding * cellWidth;
    const padY = pointPadding * cellHeight;
    const effectiveCellW = cellWidth * colsize - (this.config.borderWidth ?? 1);
    const effectiveCellH = cellHeight * rowsize - (this.config.borderWidth ?? 1);

    const cellW = Math.max(1, (useCategorical ? cellWidth - 1 : effectiveCellW) - padX * 2);
    const cellH = Math.max(1, (useCategorical ? cellHeight - 1 : effectiveCellH) - padY * 2);

    if (useInterpolation) {
      this.renderInterpolated(data, plotArea, colorScale, nullColor, getCellX, getCellY, cellWidth, cellHeight, getCellColor);
      this.renderHeatmapLabels(data, getCellX, getCellY, cellWidth, cellHeight);
      this.renderColorAxis(colorScale, minVal, maxVal);
      return;
    }

    const cells = this.group.selectAll('.katucharts-heatmap-cell')
      .data(data)
      .join('rect')
      .attr('class', 'katucharts-heatmap-cell')
      .attr('x', (d: any) => getCellX(d) + padX)
      .attr('y', (d: any) => getCellY(d) + padY)
      .attr('width', cellW)
      .attr('height', cellH)
      .attr('stroke', this.config.borderColor || '#ffffff')
      .attr('stroke-width', this.config.borderWidth ?? 1)
      .attr('rx', resolveBorderRadius(this.config.borderRadius))
      .style('cursor', this.config.cursor || 'pointer');

    if (animate) {
      cells.attr('fill', '#fff')
        .transition().duration(600).delay((_: any, i: number) => i * 8)
        .attr('fill', (d: any) => getCellColor(d));
    } else {
      cells.attr('fill', (d: any) => getCellColor(d));
    }

    if (this.config.enableMouseTracking !== false) {
      cells
        .on('mouseover', (event: MouseEvent, d: any) => {
          const target = select(event.currentTarget as SVGRectElement);
          const fill = getCellColor(d);
          const brighter = d3Color(fill)?.brighter(0.4)?.toString() || fill;
          target.interrupt('hover')
            .transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER)
            .attr('fill', brighter)
            .attr('stroke', '#333').attr('stroke-width', 2);
          target.style('filter', 'drop-shadow(0 1px 3px rgba(0,0,0,0.3))');
          cells.interrupt('highlight');
          cells.attr('opacity', 1);
          cells.filter((o: any) => o !== d)
            .transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER)
            .attr('opacity', inactiveOpacity);

          const i = data.indexOf(d);
          const val = (d as any).value ?? (d as any).z ?? d.y;
          this.context.events.emit('point:mouseover', {
            point: { ...d, value: val }, index: i, series: this, event,
            plotX: getCellX(d) + cellWidth / 2,
            plotY: getCellY(d) + cellHeight / 2,
          });
          d.events?.mouseOver?.call(d, event);
        })
        .on('mouseout', (event: MouseEvent, d: any) => {
          const target = select(event.currentTarget as SVGRectElement);
          target.interrupt('hover')
            .transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER)
            .attr('fill', getCellColor(d))
            .attr('stroke', this.config.borderColor || '#ffffff')
            .attr('stroke-width', this.config.borderWidth ?? 1);
          target.style('filter', '');
          cells.interrupt('highlight');
          cells.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER)
            .attr('opacity', 1);

          const i = data.indexOf(d);
          this.context.events.emit('point:mouseout', { point: d, index: i, series: this, event });
          d.events?.mouseOut?.call(d, event);
        })
        .on('click', (event: MouseEvent, d: any) => {
          const i = data.indexOf(d);
          this.context.events.emit('point:click', { point: d, index: i, series: this, event });
          d.events?.click?.call(d, event);
          this.config.events?.click?.call(this, event);
        });
    }

    this.renderHeatmapLabels(data, getCellX, getCellY, cellWidth, cellHeight);
    this.renderColorAxis(colorScale, minVal, maxVal);
  }

  /**
   * Renders heatmap as a smoothly interpolated canvas image using bilinear interpolation.
   */
  private renderInterpolated(
    data: any[], plotArea: { width: number; height: number },
    colorScale: (v: number) => string, nullColor: string,
    getCellX: (d: any) => number, getCellY: (d: any) => number,
    cellWidth: number, cellHeight: number,
    getCellColor: (d: any) => string
  ): void {
    const xSet = new Set<number>();
    const ySet = new Set<number>();
    for (const d of data) {
      xSet.add(d.x ?? 0);
      ySet.add((d as any).yCategory ?? d.y ?? 0);
    }
    const xs = Array.from(xSet).sort((a, b) => a - b);
    const ys = Array.from(ySet).sort((a, b) => a - b);
    const cols = xs.length;
    const rows = ys.length;
    if (cols === 0 || rows === 0) return;

    const grid = new Map<string, number>();
    for (const d of data) {
      const val = (d as any).value ?? (d as any).z ?? d.y;
      const xIdx = xs.indexOf(d.x ?? 0);
      const yIdx = ys.indexOf((d as any).yCategory ?? d.y ?? 0);
      if (val !== null && val !== undefined) {
        grid.set(`${xIdx},${yIdx}`, val);
      }
    }

    const w = Math.round(plotArea.width);
    const h = Math.round(plotArea.height);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imageData = ctx.createImageData(w, h);
    const pixels = imageData.data;

    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const fx = (px / w) * cols - 0.5;
        const fy = (py / h) * rows - 0.5;
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        const tx = fx - ix;
        const ty = fy - iy;

        const getVal = (xi: number, yi: number) =>
          grid.get(`${Math.max(0, Math.min(cols - 1, xi))},${Math.max(0, Math.min(rows - 1, yi))}`) ?? null;

        const v00 = getVal(ix, iy);
        const v10 = getVal(ix + 1, iy);
        const v01 = getVal(ix, iy + 1);
        const v11 = getVal(ix + 1, iy + 1);

        const vals = [v00, v10, v01, v11].filter(v => v !== null) as number[];
        if (vals.length === 0) {
          const parsed = rgb(nullColor);
          const off = (py * w + px) * 4;
          pixels[off] = parsed.r; pixels[off + 1] = parsed.g;
          pixels[off + 2] = parsed.b; pixels[off + 3] = 255;
          continue;
        }

        const safe = (v: number | null) => v ?? vals[0];
        const interp =
          safe(v00) * (1 - tx) * (1 - ty) +
          safe(v10) * tx * (1 - ty) +
          safe(v01) * (1 - tx) * ty +
          safe(v11) * tx * ty;

        const colorStr = colorScale(interp);
        const parsed = rgb(colorStr);
        const off = (py * w + px) * 4;
        pixels[off] = parsed.r;
        pixels[off + 1] = parsed.g;
        pixels[off + 2] = parsed.b;
        pixels[off + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const dataUrl = canvas.toDataURL();

    this.group.append('image')
      .attr('class', 'katucharts-heatmap-interpolated')
      .attr('width', plotArea.width)
      .attr('height', plotArea.height)
      .attr('href', dataUrl)
      .style('image-rendering', 'auto');
  }

  /**
   * Builds a color scale from the colorAxis configuration, supporting
   * stops, dataClasses, minColor/maxColor, and fallback sequential scale.
   */
  private buildColorScale(colorAxisCfg: ColorAxisOptions, minVal: number, maxVal: number): (v: number) => string {
    const reversed = colorAxisCfg.reversed === true;
    const domainLo = reversed ? maxVal : minVal;
    const domainHi = reversed ? minVal : maxVal;

    if (colorAxisCfg.dataClasses && colorAxisCfg.dataClasses.length > 0) {
      const classes = colorAxisCfg.dataClasses;
      return (v: number) => {
        for (const cls of classes) {
          const from = cls.from ?? -Infinity;
          const to = cls.to ?? Infinity;
          if (v >= from && v < to) return cls.color || '#cccccc';
        }
        return classes[classes.length - 1]?.color || '#cccccc';
      };
    }

    const useLog = colorAxisCfg.type === 'logarithmic';
    const safeMin = useLog ? Math.max(domainLo, 1e-10) : domainLo;
    const buildNorm = () => useLog
      ? scaleLog().domain([safeMin, domainHi]).clamp(true)
      : scaleLinear().domain([domainLo, domainHi]).clamp(true);

    if (colorAxisCfg.stops && colorAxisCfg.stops.length >= 2) {
      const stops = colorAxisCfg.stops;
      const norm = buildNorm();
      return (v: number) => {
        const t = norm(useLog ? Math.max(v, 1e-10) : v) as number;
        let i = 0;
        for (; i < stops.length - 1; i++) {
          if (t <= stops[i + 1][0]) break;
        }
        const [t0, c0] = stops[i];
        const [t1, c1] = stops[Math.min(i + 1, stops.length - 1)];
        const localT = t1 !== t0 ? (t - t0) / (t1 - t0) : 0;
        return interpolateRgb(c0, c1)(localT);
      };
    }

    if (colorAxisCfg.minColor && colorAxisCfg.maxColor) {
      const interp = interpolateRgb(colorAxisCfg.minColor, colorAxisCfg.maxColor);
      const norm = buildNorm();
      return (v: number) => interp(norm(useLog ? Math.max(v, 1e-10) : v) as number);
    }

    const domain = reversed ? [maxVal, minVal] : [minVal, maxVal];
    const seq = scaleSequential(interpolateYlOrRd).domain(domain);
    return (v: number) => seq(v);
  }

  private renderColorAxis(
    colorScale: (v: number) => string,
    minVal: number, maxVal: number
  ): void {
    const colorAxisCfg: ColorAxisOptions = (this.config as any).colorAxis || {};
    if (colorAxisCfg.labels?.enabled === false) return;

    const { plotArea } = this.context;
    const legendCfg = this.context.legendConfig || {};
    const isVertical = legendCfg.layout === 'vertical';
    const steps = 50;

    const parentGroup = this.context.plotGroup || this.group;
    parentGroup.selectAll('.katucharts-color-axis').remove();
    const axisGroup = parentGroup.append('g')
      .attr('class', 'katucharts-color-axis');

    const labelStyle = colorAxisCfg.labels?.style || {};
    const fontSize = (labelStyle.fontSize as string) || DEFAULT_CHART_TEXT_SIZE;
    const fontColor = (labelStyle.color as string) || DEFAULT_CHART_TEXT_COLOR;

    const range = maxVal - minVal;
    const rawStep = range / 6;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const nice = [1, 2, 2.5, 5, 10].find(n => n * mag >= rawStep)! * mag;
    const tickStart = Math.ceil(minVal / nice) * nice;
    const ticks: number[] = [];
    for (let v = tickStart; v <= maxVal + nice * 0.01; v += nice) {
      ticks.push(Math.round(v * 1e6) / 1e6);
    }
    if (ticks.length === 0 || ticks[0] > minVal) ticks.unshift(minVal);
    if (ticks[ticks.length - 1] < maxVal) ticks.push(maxVal);
    const precision = nice >= 1 ? 0 : nice >= 0.1 ? 1 : 2;

    if (colorAxisCfg.dataClasses && colorAxisCfg.dataClasses.length > 0) {
      const classes = colorAxisCfg.dataClasses;
      const barWidth = Math.min(plotArea.width * 0.6, 300);
      const barHeight = 12;
      const x = (plotArea.width - barWidth) / 2;
      const y = plotArea.height + 60;
      const segW = barWidth / classes.length;
      for (let i = 0; i < classes.length; i++) {
        const cls = classes[i];
        axisGroup.append('rect')
          .attr('x', x + i * segW).attr('y', y)
          .attr('width', segW).attr('height', barHeight)
          .attr('fill', cls.color || '#ccc')
          .attr('stroke', '#ccc').attr('stroke-width', 0.5)
          .attr('rx', i === 0 ? 2 : 0)
          .attr('ry', i === 0 ? 2 : 0);
        if (cls.name) {
          axisGroup.append('text')
            .attr('x', x + i * segW + segW / 2).attr('y', y + barHeight + 30)
            .attr('font-size', fontSize).attr('fill', fontColor)
            .attr('text-anchor', 'middle')
            .text(cls.name);
        }
      }
      return;
    }

    if (isVertical) {
      const barWidth = 12;
      const barLength = Math.min(plotArea.height * 0.7, 200);
      const x = plotArea.width + 20;
      const y = (plotArea.height - barLength) / 2;

      const defs = axisGroup.append('defs');
      const segCount = ticks.length - 1;
      const segH = barLength / segCount;

      for (let i = 0; i < segCount; i++) {
        const fromIdx = segCount - 1 - i;
        const segGradId = `katucharts-heatmap-seg-${Math.random().toString(36).slice(2, 8)}`;
        const segGrad = defs.append('linearGradient')
          .attr('id', segGradId)
          .attr('x1', '0%').attr('y1', '0%')
          .attr('x2', '0%').attr('y2', '100%');
        segGrad.append('stop').attr('offset', '0%').attr('stop-color', colorScale(ticks[fromIdx + 1]));
        segGrad.append('stop').attr('offset', '100%').attr('stop-color', colorScale(ticks[fromIdx]));
        axisGroup.append('rect')
          .attr('x', x).attr('y', y + i * segH)
          .attr('width', barWidth).attr('height', segH + 0.5)
          .attr('fill', `url(#${segGradId})`)
          .attr('stroke', 'none');
      }

      axisGroup.append('rect')
        .attr('x', x).attr('y', y)
        .attr('width', barWidth).attr('height', barLength)
        .attr('fill', 'none')
        .attr('stroke', '#ccc').attr('stroke-width', 0.5)
        .attr('rx', 2);

      for (let i = 0; i < ticks.length; i++) {
        const ty = y + barLength - (ticks[i] - minVal) / range * barLength;
        axisGroup.append('line')
          .attr('x1', x + barWidth).attr('y1', ty)
          .attr('x2', x + barWidth + 4).attr('y2', ty)
          .attr('stroke', '#999').attr('stroke-width', 0.5);
        axisGroup.append('text')
          .attr('x', x + barWidth + 7).attr('y', ty + 4)
          .attr('font-size', fontSize).attr('fill', fontColor)
          .attr('text-anchor', 'start')
          .text(ticks[i].toFixed(precision));
      }
    } else {
      const barHeight = 12;
      const barWidth = Math.min(plotArea.width * 0.6, 300);
      const x = (plotArea.width - barWidth) / 2;
      const y = plotArea.height + 60;

      const defs = axisGroup.append('defs');
      const segCount = ticks.length - 1;
      const segW = barWidth / segCount;

      for (let i = 0; i < segCount; i++) {
        const segGradId = `katucharts-heatmap-seg-${Math.random().toString(36).slice(2, 8)}`;
        const segGrad = defs.append('linearGradient')
          .attr('id', segGradId)
          .attr('x1', '0%').attr('y1', '0%')
          .attr('x2', '100%').attr('y2', '0%');
        segGrad.append('stop').attr('offset', '0%').attr('stop-color', colorScale(ticks[i]));
        segGrad.append('stop').attr('offset', '100%').attr('stop-color', colorScale(ticks[i + 1]));
        axisGroup.append('rect')
          .attr('x', x + i * segW).attr('y', y)
          .attr('width', segW + 0.5).attr('height', barHeight)
          .attr('fill', `url(#${segGradId})`)
          .attr('stroke', 'none');
      }

      axisGroup.append('rect')
        .attr('x', x).attr('y', y)
        .attr('width', barWidth).attr('height', barHeight)
        .attr('fill', 'none')
        .attr('stroke', '#ccc').attr('stroke-width', 0.5)
        .attr('rx', 2);

      for (let i = 0; i < ticks.length; i++) {
        const tx = x + (ticks[i] - minVal) / range * barWidth;
        axisGroup.append('line')
          .attr('x1', tx).attr('y1', y + barHeight + 8)
          .attr('x2', tx).attr('y2', y + barHeight + 16)
          .attr('stroke', '#999').attr('stroke-width', 0.5);
        axisGroup.append('text')
          .attr('x', tx).attr('y', y + barHeight + 30)
          .attr('font-size', fontSize).attr('fill', fontColor)
          .attr('text-anchor', i === 0 ? 'start' : i === ticks.length - 1 ? 'end' : 'middle')
          .text(ticks[i].toFixed(precision));
      }
    }
  }

  private renderHeatmapLabels(data: any[], getCellX: (d: any) => number, getCellY: (d: any) => number, cellWidth: number, cellHeight: number): void {
    const dlCfg = this.config.dataLabels;
    if (!dlCfg?.enabled) return;
    const minCellHeight = (dlCfg as any).minCellHeight ?? 20;
    if (cellHeight < minCellHeight) return;

    const fontSize = (dlCfg.style?.fontSize as string) || DEFAULT_CHART_TEXT_SIZE;
    const fontColor = dlCfg.color || (dlCfg.style?.color as string) || DEFAULT_CHART_TEXT_COLOR;

    this.group.selectAll('.katucharts-heatmap-label')
      .data(data)
      .join('text')
      .attr('class', 'katucharts-heatmap-label')
      .attr('x', (d: any) => getCellX(d) + cellWidth / 2 + (dlCfg.x ?? 0))
      .attr('y', (d: any) => getCellY(d) + cellHeight / 2 + (dlCfg.y ?? 0))
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('font-size', fontSize)
      .attr('fill', fontColor)
      .style('pointer-events', 'none')
      .text((d: any) => {
        const val = d.value ?? d.z ?? d.y;
        if (val === null || val === undefined) {
          if (dlCfg.nullFormatter) return dlCfg.nullFormatter.call({ point: d, series: { name: this.config.name } });
          if (dlCfg.nullFormat) return dlCfg.nullFormat;
          return '';
        }
        if (dlCfg.formatter) {
          return dlCfg.formatter.call({
            point: { ...d, value: val }, series: { name: this.config.name },
            x: d.x, y: d.y,
          });
        }
        if (dlCfg.format) {
          return stripHtmlTags(templateFormat(dlCfg.format, {
            point: { ...d, value: val }, series: { name: this.config.name },
            x: d.x, y: d.y, value: val,
          }));
        }
        return String(val);
      });
  }

  private getUniqueValues(key: string): any[] {
    const set = new Set<any>();
    for (const d of this.data) {
      const val = (d as any)[key];
      if (val !== undefined) set.add(val);
    }
    return Array.from(set).sort((a, b) => a - b);
  }

  getDataExtents() {
    return { xMin: 0, xMax: 0, yMin: 0, yMax: 0 };
  }
}

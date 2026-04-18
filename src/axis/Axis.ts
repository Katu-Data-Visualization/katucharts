/**
 * Axis classes wrapping D3 scales and d3-axis.
 */

import {
  scaleLinear, scaleLog, scaleTime, scaleBand, scalePoint, scaleSequential,
  type ScaleLinear, type ScaleLogarithmic, type ScaleTime, type ScaleBand,
} from 'd3-scale';
import {
  axisBottom, axisTop, axisLeft, axisRight, type Axis as D3Axis,
} from 'd3-axis';
import { Selection, select } from 'd3-selection';
import 'd3-transition';
import { timeFormat } from 'd3-time-format';
import type { InternalAxisConfig, PlotArea, PlotBandOptions, PlotLineOptions } from '../types/options';
import { siFormat, numberFormat } from '../utils/format';
import { DEFAULT_CHART_TEXT_COLOR, DEFAULT_CHART_TEXT_SIZE } from '../utils/chartText';

export type AnyScale = ScaleLinear<number, number> | ScaleLogarithmic<number, number>
  | ScaleTime<number, number> | ScaleBand<string>;

export interface AxisInstance {
  config: InternalAxisConfig;
  scale: AnyScale;
  render(group: Selection<SVGGElement, unknown, null, undefined>, plotArea: PlotArea): void;
  updateDomain(data: { min: number; max: number; extraMinPadding?: number; extraMaxPadding?: number } | string[]): void;
  animateAxis(group: Selection<SVGGElement, unknown, null, undefined>, plotArea: PlotArea, duration: number): void;
  getPixelForValue(value: any): number;
  getValueForPixel(pixel: number): any;
  destroy(): void;
}

export function createAxis(config: InternalAxisConfig, plotArea: PlotArea): AxisInstance {
  const type = config.type || 'linear';

  switch (type) {
    case 'logarithmic':
      return new LogarithmicAxis(config, plotArea);
    case 'datetime':
      return new DateTimeAxis(config, plotArea);
    case 'category':
      return new CategoryAxis(config, plotArea);
    default:
      return new LinearAxis(config, plotArea);
  }
}

class BaseAxis {
  config: InternalAxisConfig;
  protected plotArea: PlotArea;

  constructor(config: InternalAxisConfig, plotArea: PlotArea) {
    this.config = config;
    this.plotArea = plotArea;
  }

  protected getRange(): [number, number] {
    const inv = this.config._inverted;
    if (this.config.isX) {
      if (inv) {
        const size = this.plotArea.height;
        return this.config.reversed ? [size, 0] : [0, size];
      }
      const size = this.plotArea.width;
      return this.config.reversed ? [size, 0] : [0, size];
    }
    if (inv) {
      const size = this.plotArea.width;
      return this.config.reversed ? [size, 0] : [0, size];
    }
    const size = this.plotArea.height;
    return this.config.reversed ? [0, size] : [size, 0];
  }

  protected createD3Axis(scale: any): D3Axis<any> {
    const isX = this.config.isX;
    const opposite = this.config.opposite;
    const inv = this.config._inverted;

    if (isX) {
      if (inv) return opposite ? axisRight(scale) : axisLeft(scale);
      return opposite ? axisTop(scale) : axisBottom(scale);
    }
    if (inv) return opposite ? axisTop(scale) : axisBottom(scale);
    return opposite ? axisRight(scale) : axisLeft(scale);
  }

  protected applyAxisStyles(
    axisGroup: Selection<SVGGElement, unknown, null, undefined>,
    plotArea: PlotArea
  ): void {
    const cfg = this.config;

    const tickLen = cfg.tickLength ?? 10;
    const tickPos = cfg.tickPosition || 'outside';

    axisGroup.selectAll('.tick line')
      .attr('stroke', cfg.tickColor || '#ccd6eb')
      .attr('stroke-width', cfg.tickWidth ?? 1);

    if (tickLen !== 10 || tickPos === 'inside') {
      axisGroup.selectAll('.tick line').each(function() {
        const el = select(this);
        if (cfg.isX) {
          const sign = cfg.opposite ? -1 : 1;
          if (tickPos === 'inside') {
            el.attr('y1', 0).attr('y2', -sign * tickLen);
          } else {
            el.attr('y1', 0).attr('y2', sign * tickLen);
          }
        } else {
          const sign = cfg.opposite ? 1 : -1;
          if (tickPos === 'inside') {
            el.attr('x1', 0).attr('x2', -sign * tickLen);
          } else {
            el.attr('x1', 0).attr('x2', sign * tickLen);
          }
        }
      });
    }

    axisGroup.selectAll('.domain')
      .attr('stroke', cfg.lineColor || '#ccd6eb')
      .attr('stroke-width', cfg.lineWidth ?? 1);

    if (cfg.labels?.enabled === false) {
      axisGroup.selectAll('.tick text').remove();
    } else {
      if (cfg.labels?.style) {
        const style = cfg.labels.style;
        axisGroup.selectAll('.tick text')
          .attr('fill', style.color as string || DEFAULT_CHART_TEXT_COLOR)
          .style('font-size', style.fontSize as string || DEFAULT_CHART_TEXT_SIZE);
      }

      if (cfg.labels?.x !== undefined || cfg.labels?.y !== undefined) {
        const dx = cfg.labels?.x ?? 0;
        const dy = cfg.labels?.y ?? 0;
        axisGroup.selectAll('.tick text')
          .attr('dx', dx)
          .attr('dy', (parseFloat(axisGroup.select('.tick text').attr('dy') || '0') + dy));
      }

      if (cfg.labels?.step && cfg.labels.step > 1) {
        axisGroup.selectAll('.tick text').each(function(_d: any, i: number) {
          if (i % cfg.labels!.step! !== 0) {
            select(this).remove();
          }
        });
      }

      if (cfg.showFirstLabel === false) {
        const texts = axisGroup.selectAll('.tick text').nodes();
        if (texts.length > 0) select(texts[0]).remove();
      }
      if (cfg.showLastLabel === false) {
        const texts = axisGroup.selectAll('.tick text').nodes();
        if (texts.length > 0) select(texts[texts.length - 1]).remove();
      }

      if (cfg.labels?.rotation) {
        axisGroup.selectAll('.tick text')
          .attr('transform', `rotate(${cfg.labels.rotation})`)
          .style('text-anchor', cfg.labels.rotation < 0 ? 'end' : 'start');
      } else if ((cfg.isX ? !cfg._inverted : !!cfg._inverted) && cfg.labels?.autoRotation) {
        this.applyAutoRotation(axisGroup, cfg.labels.autoRotation, plotArea);
      }
    }

    if (cfg.visible === false) {
      axisGroup.style('display', 'none');
    }
  }

  protected applyAutoRotation(
    axisGroup: Selection<SVGGElement, unknown, null, undefined>,
    rotations: number[],
    plotArea: PlotArea
  ): void {
    const ticks = axisGroup.selectAll('.tick text').nodes() as SVGTextElement[];
    if (ticks.length < 2) return;

    if (this.hasLabelOverlap(ticks)) {
      for (const rotation of (rotations.length > 0 ? rotations : [-45])) {
        axisGroup.selectAll('.tick text')
          .attr('transform', `rotate(${rotation})`)
          .style('text-anchor', rotation < 0 ? 'end' : 'start');
        break;
      }
    }
  }

  /**
   * Detects whether adjacent tick labels overlap horizontally, using a 4px gap threshold.
   */
  protected hasLabelOverlap(ticks: SVGTextElement[], rotated = false): boolean {
    for (let i = 1; i < ticks.length; i++) {
      try {
        const prev = ticks[i - 1].getBoundingClientRect();
        const curr = ticks[i].getBoundingClientRect();
        const gap = rotated ? -4 : 2;
        if (prev.right + gap > curr.left && prev.left < curr.right) {
          if (rotated) {
            if (prev.bottom + gap > curr.top && prev.top < curr.bottom) {
              return true;
            }
          } else {
            return true;
          }
        }
      } catch {
        return false;
      }
    }
    return false;
  }

  /**
   * Hides every Nth label until labels no longer overlap, matching
   * auto-step behavior for extreme ranges.
   */
  protected applyAutoStep(
    axisGroup: Selection<SVGGElement, unknown, null, undefined>,
    ticks: SVGTextElement[]
  ): void {
    const totalTicks = ticks.length;
    for (let step = 2; step <= totalTicks; step++) {
      ticks.forEach((t, i) => {
        select(t).style('display', i % step === 0 ? '' : 'none');
      });
      const visible = ticks.filter((_, i) => i % step === 0);
      if (!this.hasLabelOverlap(visible)) return;
    }
  }

  protected renderGridLines(
    group: Selection<SVGGElement, unknown, null, undefined>,
    scale: any,
    plotArea: PlotArea,
    explicitTicks?: number[]
  ): void {
    const gridWidth = this.config.gridLineWidth;
    if (!gridWidth || gridWidth <= 0) return;

    const ticks = explicitTicks || (scale.ticks ? scale.ticks() : scale.domain());
    const gridGroup = group.append('g').attr('class', 'katucharts-grid');

    if (this.config.alternateGridColor) {
      this.renderAlternateGridColor(gridGroup, ticks, scale, plotArea);
    }

    const drawsVerticalLines = this.config.isX ? !this.config._inverted : !!this.config._inverted;

    for (const tick of ticks) {
      const pos = scale(tick);
      if (drawsVerticalLines) {
        gridGroup.append('line')
          .attr('x1', pos).attr('x2', pos)
          .attr('y1', 0).attr('y2', plotArea.height)
          .attr('stroke', this.config.gridLineColor || '#e6e6e6')
          .attr('stroke-width', gridWidth)
          .attr('stroke-dasharray', this.getDashArray(this.config.gridLineDashStyle));
      } else {
        gridGroup.append('line')
          .attr('x1', 0).attr('x2', plotArea.width)
          .attr('y1', pos).attr('y2', pos)
          .attr('stroke', this.config.gridLineColor || '#e6e6e6')
          .attr('stroke-width', gridWidth)
          .attr('stroke-dasharray', this.getDashArray(this.config.gridLineDashStyle));
      }
    }

    this.renderMinorGridLines(gridGroup, ticks, scale, plotArea);
  }

  protected renderAlternateGridColor(
    gridGroup: Selection<SVGGElement, unknown, null, undefined>,
    ticks: any[],
    scale: any,
    plotArea: PlotArea
  ): void {
    const color = this.config.alternateGridColor!;
    const vertical = this.config.isX ? !this.config._inverted : !!this.config._inverted;
    for (let i = 0; i < ticks.length - 1; i += 2) {
      const pos0 = scale(ticks[i]);
      const pos1 = scale(ticks[i + 1]);
      if (vertical) {
        gridGroup.insert('rect', ':first-child')
          .attr('x', Math.min(pos0, pos1)).attr('y', 0)
          .attr('width', Math.abs(pos1 - pos0)).attr('height', plotArea.height)
          .attr('fill', color);
      } else {
        gridGroup.insert('rect', ':first-child')
          .attr('x', 0).attr('y', Math.min(pos0, pos1))
          .attr('width', plotArea.width).attr('height', Math.abs(pos1 - pos0))
          .attr('fill', color);
      }
    }
  }

  protected renderMinorGridLines(
    gridGroup: Selection<SVGGElement, unknown, null, undefined>,
    majorTicks: any[],
    scale: any,
    plotArea: PlotArea
  ): void {
    const minorInterval = this.config.minorTickInterval;
    const minorGridWidth = this.config.minorGridLineWidth ?? 1;
    const minorGridColor = this.config.minorGridLineColor || '#f2f2f2';

    if (!minorInterval || minorInterval === 'auto' || minorGridWidth <= 0) return;
    if (typeof minorInterval !== 'number' || majorTicks.length < 2) return;

    const domain = scale.domain ? scale.domain() : [0, 1];
    const start = typeof domain[0] === 'number' ? domain[0] : 0;
    const end = typeof domain[domain.length - 1] === 'number' ? domain[domain.length - 1] : 1;
    const majorSet = new Set(majorTicks.map((t: any) => Number(t)));

    const vertical = this.config.isX ? !this.config._inverted : !!this.config._inverted;
    for (let v = start; v <= end; v += minorInterval) {
      if (majorSet.has(v)) continue;
      const pos = scale(v);
      if (vertical) {
        gridGroup.append('line')
          .attr('x1', pos).attr('x2', pos)
          .attr('y1', 0).attr('y2', plotArea.height)
          .attr('stroke', minorGridColor)
          .attr('stroke-width', minorGridWidth)
          .attr('class', 'katucharts-minor-grid');
      } else {
        gridGroup.append('line')
          .attr('x1', 0).attr('x2', plotArea.width)
          .attr('y1', pos).attr('y2', pos)
          .attr('stroke', minorGridColor)
          .attr('stroke-width', minorGridWidth)
          .attr('class', 'katucharts-minor-grid');
      }
    }
  }

  protected renderPlotBands(
    group: Selection<SVGGElement, unknown, null, undefined>,
    scale: any,
    plotArea: PlotArea
  ): void {
    if (!this.config.plotBands?.length) return;

    for (const band of this.config.plotBands) {
      const from = scale(band.from ?? 0);
      const to = scale(band.to ?? 0);

      let rx: number, ry: number, rw: number, rh: number;
      const vertical = this.config.isX ? !this.config._inverted : !!this.config._inverted;
      if (vertical) {
        rx = Math.min(from, to); ry = 0;
        rw = Math.abs(to - from); rh = plotArea.height;
      } else {
        rx = 0; ry = Math.min(from, to);
        rw = plotArea.width; rh = Math.abs(to - from);
      }

      const bandEl = group.append('rect')
        .attr('x', rx).attr('y', ry)
        .attr('width', rw).attr('height', rh)
        .attr('fill', band.color || 'rgba(0,0,0,0.05)')
        .attr('class', `katucharts-plot-band${band.className ? ' ' + band.className : ''}`);

      if (band.borderColor) {
        bandEl.attr('stroke', band.borderColor)
          .attr('stroke-width', band.borderWidth ?? 0);
      }

      if (band.borderRadius) {
        bandEl.attr('rx', band.borderRadius);
      }

      if (band.zIndex !== undefined) {
        bandEl.style('z-index', band.zIndex);
      }

      if (band.events) {
        if (band.events.click) bandEl.on('click', (e: MouseEvent) => band.events!.click!.call(band, e));
        if (band.events.mouseover) bandEl.on('mouseover', (e: MouseEvent) => band.events!.mouseover!.call(band, e));
        if (band.events.mouseout) bandEl.on('mouseout', (e: MouseEvent) => band.events!.mouseout!.call(band, e));
        if (band.events.mousemove) bandEl.on('mousemove', (e: MouseEvent) => band.events!.mousemove!.call(band, e));
        bandEl.style('cursor', 'pointer');
      }

      if (band.label?.text) {
        const lbl = band.label;
        const align = lbl.align || 'center';
        const vAlign = lbl.verticalAlign || 'top';
        let lx = align === 'left' ? rx + 4 : align === 'right' ? rx + rw - 4 : rx + rw / 2;
        let ly = vAlign === 'top' ? ry + 12 : vAlign === 'bottom' ? ry + rh - 4 : ry + rh / 2;
        lx += lbl.x ?? 0;
        ly += lbl.y ?? 0;
        const anchor = align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle';

        group.append('text')
          .attr('x', lx).attr('y', ly)
          .attr('text-anchor', anchor)
          .attr('font-size', (lbl.style as any)?.fontSize || DEFAULT_CHART_TEXT_SIZE)
          .attr('fill', (lbl.style as any)?.color || DEFAULT_CHART_TEXT_COLOR)
          .attr('transform', (lbl as any).rotation ? `rotate(${(lbl as any).rotation},${lx},${ly})` : '')
          .style('pointer-events', 'none')
          .attr('class', 'katucharts-plot-band-label')
          .text(lbl.text || '');
      }
    }
  }

  protected renderPlotLines(
    group: Selection<SVGGElement, unknown, null, undefined>,
    scale: any,
    plotArea: PlotArea
  ): void {
    if (!this.config.plotLines?.length) return;

    for (const pl of this.config.plotLines) {
      const pos = scale(pl.value ?? 0);

      const vertical = this.config.isX ? !this.config._inverted : !!this.config._inverted;
      let lineEl: Selection<SVGLineElement, unknown, null, undefined>;
      if (vertical) {
        lineEl = group.append('line')
          .attr('x1', pos).attr('x2', pos)
          .attr('y1', 0).attr('y2', plotArea.height)
          .attr('stroke', pl.color || '#999')
          .attr('stroke-width', pl.width || 1)
          .attr('stroke-dasharray', this.getDashArray(pl.dashStyle))
          .attr('class', `katucharts-plot-line${pl.className ? ' ' + pl.className : ''}`);
      } else {
        lineEl = group.append('line')
          .attr('x1', 0).attr('x2', plotArea.width)
          .attr('y1', pos).attr('y2', pos)
          .attr('stroke', pl.color || '#999')
          .attr('stroke-width', pl.width || 1)
          .attr('stroke-dasharray', this.getDashArray(pl.dashStyle))
          .attr('class', `katucharts-plot-line${pl.className ? ' ' + pl.className : ''}`);
      }

      if (pl.zIndex !== undefined) {
        lineEl.style('z-index', pl.zIndex);
      }

      if (pl.events) {
        lineEl.style('pointer-events', 'stroke');
        if (pl.events.click) lineEl.on('click', (e: MouseEvent) => pl.events!.click!.call(pl, e));
        if (pl.events.mouseover) lineEl.on('mouseover', (e: MouseEvent) => pl.events!.mouseover!.call(pl, e));
        if (pl.events.mouseout) lineEl.on('mouseout', (e: MouseEvent) => pl.events!.mouseout!.call(pl, e));
        if (pl.events.mousemove) lineEl.on('mousemove', (e: MouseEvent) => pl.events!.mousemove!.call(pl, e));
        lineEl.style('cursor', 'pointer');
      }

      if (pl.label?.text) {
        const lbl = pl.label;
        const align = lbl.align || (this.config.isX ? 'left' : 'right');
        const vAlign = lbl.verticalAlign || (this.config.isX ? 'top' : 'middle');
        let lx: number, ly: number;

        if (this.config.isX) {
          lx = pos + (lbl.x ?? 4);
          ly = vAlign === 'top' ? (lbl.y ?? 12) : vAlign === 'bottom' ? plotArea.height + (lbl.y ?? -4) : plotArea.height / 2 + (lbl.y ?? 0);
        } else {
          lx = align === 'left' ? (lbl.x ?? 4) : align === 'right' ? plotArea.width + (lbl.x ?? -4) : plotArea.width / 2 + (lbl.x ?? 0);
          ly = pos + (lbl.y ?? -6);
        }

        const anchor = align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle';

        group.append('text')
          .attr('x', lx).attr('y', ly)
          .attr('text-anchor', anchor)
          .attr('font-size', (lbl.style as any)?.fontSize || DEFAULT_CHART_TEXT_SIZE)
          .attr('fill', (lbl.style as any)?.color || DEFAULT_CHART_TEXT_COLOR)
          .attr('transform', (lbl as any).rotation ? `rotate(${(lbl as any).rotation},${lx},${ly})` : '')
          .style('pointer-events', 'none')
          .attr('class', 'katucharts-plot-line-label')
          .text(lbl.text || '');
      }
    }
  }

  protected applyAxisBreaks(scale: any): void {
    if (!this.config.breaks?.length) return;

    const origScale = scale.copy();
    const domain = origScale.domain();
    const range = origScale.range();
    const totalDomain = Math.abs(domain[1] - domain[0]);
    let totalBreakSize = 0;
    for (const br of this.config.breaks) {
      const from = br.from ?? 0;
      const to = br.to ?? 0;
      totalBreakSize += Math.abs(to - from);
    }

    if (totalDomain > 0 && totalBreakSize > 0) {
      const compressionFactor = (totalDomain - totalBreakSize) / totalDomain;
      const newRange = [range[0], range[0] + (range[1] - range[0]) * compressionFactor];
      scale.range(newRange);
    }
  }

  protected renderTitle(
    group: Selection<SVGGElement, unknown, null, undefined>,
    plotArea: PlotArea
  ): void {
    if (!this.config.title?.text) return;

    const title = this.config.title;
    const offset = title.offset ?? 0;
    const margin = title.margin ?? 0;
    const rotation = title.rotation;

    const rendersHorizontally = this.config.isX ? !this.config._inverted : !!this.config._inverted;

    if (rendersHorizontally) {
      const labelsEnabled = this.config.labels?.enabled !== false;
      let yPos = (labelsEnabled ? 45 : 33) + margin + offset;

      if (labelsEnabled) {
        const ticks = group.selectAll('.tick text').nodes() as SVGTextElement[];
        if (ticks.length > 0) {
          try {
            const axisNode = group.node() as SVGGElement;
            const axisRect = axisNode.getBBox();
            yPos = Math.max(yPos, axisRect.height + 10 + margin + offset);
          } catch { /* fallback to default */ }
        }
      }

      const el = group.append('text')
        .attr('class', 'katucharts-axis-title')
        .attr('x', plotArea.width / 2)
        .attr('y', yPos)
        .attr('text-anchor', 'middle')
        .attr('font-size', title.style?.fontSize as string || DEFAULT_CHART_TEXT_SIZE)
        .attr('fill', title.style?.color as string || DEFAULT_CHART_TEXT_COLOR)
        .text(title.text!);

      if (rotation !== undefined) {
        el.attr('transform', `rotate(${rotation}, ${plotArea.width / 2}, ${yPos})`);
      }
    } else {
      const labelsEnabled = this.config.labels?.enabled !== false;
      let x = (this.config.opposite ? plotArea.width + 45 : -45) + offset;

      if (labelsEnabled) {
        try {
          const axisNode = group.node() as SVGGElement;
          const axisRect = axisNode.getBBox();
          if (this.config.opposite) {
            x = Math.max(x, axisRect.x + axisRect.width + 10 + margin + offset);
          } else {
            x = Math.min(x, axisRect.x - 10 - margin - offset);
          }
        } catch { /* fallback to default */ }
      }

      const yPos = plotArea.height / 2;
      const rot = rotation ?? -90;

      group.append('text')
        .attr('class', 'katucharts-axis-title')
        .attr('x', x)
        .attr('y', yPos)
        .attr('text-anchor', 'middle')
        .attr('transform', `rotate(${rot}, ${x}, ${yPos})`)
        .attr('font-size', title.style?.fontSize as string || DEFAULT_CHART_TEXT_SIZE)
        .attr('fill', title.style?.color as string || DEFAULT_CHART_TEXT_COLOR)
        .text(title.text!);
    }
  }

  animateAxis(
    group: Selection<SVGGElement, unknown, null, undefined>,
    plotArea: PlotArea,
    duration: number
  ): void {
    this.plotArea = plotArea;
    const scale = (this as any).scale;
    if (!scale) return;

    scale.range(this.getRange() as any);
    this.applyAxisBreaks(scale);
    const axisGen = this.createD3Axis(scale);

    if (this.config.tickPositions) {
      axisGen.tickValues(this.config.tickPositions);
    } else if (this.config.tickInterval) {
      const domain = scale.domain();
      const ticks: number[] = [];
      for (let v = domain[0]; v <= domain[1]; v += this.config.tickInterval) {
        ticks.push(v);
      }
      axisGen.tickValues(ticks);
    } else if (scale.domain && typeof scale.ticks === 'function') {
      const inv = this.config._inverted;
      const axisLength = this.config.isX
        ? (inv ? plotArea.height : plotArea.width)
        : (inv ? plotArea.width : plotArea.height);
      const rendersHoriz = this.config.isX ? !inv : !!inv;
      const tickPixelInterval = this.config.tickPixelInterval ?? 72;
      const idealTickCount = Math.min(20, Math.max(2, Math.round(axisLength / tickPixelInterval)));
      const domain = scale.domain();
      if ((this as any).computeNiceTicks) {
        const tickValues = (this as any).computeNiceTicks(domain[0], domain[1], idealTickCount);
        axisGen.tickValues(tickValues);
      } else if ((this as any).computeLogTicks) {
        const tickValues = (this as any).computeLogTicks(domain, plotArea);
        axisGen.tickValues(tickValues);
      }
    }

    if (this.config.labels?.formatter) {
      const formatter = this.config.labels.formatter;
      axisGen.tickFormat((d: any) => formatter.call({ value: d, axis: this }));
    } else if ((this as any).linearTickFormat) {
      axisGen.tickFormat((d: any) => (this as any).linearTickFormat(d as number, axisGen));
    } else {
      axisGen.tickFormat((d: any) => siFormat(d as number));
    }

    const className = `katucharts-axis-${this.config.isX ? 'x' : 'y'}`;
    const existing = group.select<SVGGElement>(`.${className}`);

    if (!existing.empty()) {
      (existing.transition().duration(duration) as any).call(axisGen as any);
      this.animateGridLines(group, scale, plotArea, duration);
    }
  }

  protected animateGridLines(
    group: Selection<SVGGElement, unknown, null, undefined>,
    scale: any,
    plotArea: PlotArea,
    duration: number
  ): void {
    const gridWidth = this.config.gridLineWidth;
    if (!gridWidth || gridWidth <= 0) return;

    group.selectAll('.katucharts-grid').remove();
    this.renderGridLines(group, scale, plotArea);
  }

  protected getDashArray(style?: string): string {
    const map: Record<string, string> = {
      'Solid': 'none', 'ShortDash': '6,2', 'ShortDot': '2,2',
      'ShortDashDot': '6,2,2,2', 'Dot': '2,6', 'Dash': '8,6',
      'LongDash': '16,6', 'DashDot': '8,6,2,6', 'LongDashDot': '16,6,2,6',
      'LongDashDotDot': '16,6,2,6,2,6',
    };
    return map[style || 'Solid'] || 'none';
  }

  destroy(): void {}
}

export class LinearAxis extends BaseAxis implements AxisInstance {
  scale: ScaleLinear<number, number>;

  constructor(config: InternalAxisConfig, plotArea: PlotArea) {
    super(config, plotArea);
    this.scale = scaleLinear().range(this.getRange()).domain([0, 1]);
  }

  updateDomain(data: { min: number; max: number; extraMinPadding?: number; extraMaxPadding?: number }): void {
    let { min, max } = data;
    const explicitMin = this.config.min !== undefined && this.config.min !== null;
    const explicitMax = this.config.max !== undefined && this.config.max !== null;
    if (explicitMin) min = this.config.min as number;
    if (explicitMax) max = this.config.max as number;
    if (this.config.softMin !== undefined && min > this.config.softMin) min = this.config.softMin;
    if (this.config.softMax !== undefined && max < this.config.softMax) max = this.config.softMax;

    if (this.config.floor !== undefined) min = Math.max(min, this.config.floor);
    if (this.config.ceiling !== undefined) max = Math.min(max, this.config.ceiling);

    const padding = this.config.isX
      ? (this.config.maxPadding || 0.01)
      : (this.config.maxPadding || 0.05);
    const range = max - min || 1;
    const originalMin = min;
    const minPadTotal = (this.config.minPadding ?? padding) + (data.extraMinPadding ?? 0);
    const maxPadTotal = padding + (data.extraMaxPadding ?? 0);
    if (!explicitMin) min -= range * minPadTotal;
    if (!explicitMax) max += range * maxPadTotal;
    const allowNegative = (data.extraMinPadding ?? 0) > 0;
    if (originalMin >= 0 && min < 0 && !allowNegative) min = 0;

    if (this.config.floor !== undefined) min = Math.max(min, this.config.floor);
    if (this.config.ceiling !== undefined) max = Math.min(max, this.config.ceiling);

    if (this.config.minRange !== undefined) {
      const currentRange = max - min;
      if (currentRange < this.config.minRange) {
        const mid = (min + max) / 2;
        min = mid - this.config.minRange / 2;
        max = mid + this.config.minRange / 2;
      }
    }
    if (this.config.maxRange !== undefined) {
      const currentRange = max - min;
      if (currentRange > this.config.maxRange) {
        max = min + this.config.maxRange;
      }
    }

    this.scale.domain([min, max]).range(this.getRange());

    const hasBothExplicit = explicitMin && explicitMax;
    if (!hasBothExplicit) {
      const shouldNice = this.config.startOnTick || this.config.endOnTick
        || (!this.config.isX && this.config.startOnTick !== false && this.config.endOnTick !== false);
      if (shouldNice) {
        this.scale.nice();
        if (explicitMin || explicitMax) {
          const [niceMin, niceMax] = this.scale.domain();
          this.scale.domain([
            explicitMin ? (this.config.min as number) : niceMin,
            explicitMax ? (this.config.max as number) : niceMax,
          ]);
        }
      }
    }
  }

  render(group: Selection<SVGGElement, unknown, null, undefined>, plotArea: PlotArea): void {
    this.plotArea = plotArea;
    this.scale.range(this.getRange());
    this.applyAxisBreaks(this.scale);

    const axisGen = this.createD3Axis(this.scale);

    if (this.config.tickPositions) {
      axisGen.tickValues(this.config.tickPositions);
    } else if (this.config.tickInterval) {
      const domain = this.scale.domain();
      const ticks: number[] = [];
      for (let v = domain[0]; v <= domain[1]; v += this.config.tickInterval) {
        ticks.push(v);
      }
      axisGen.tickValues(ticks);
    } else if (this.config.tickAmount) {
      axisGen.ticks(this.config.tickAmount);
    } else {
      const inv = this.config._inverted;
      const axisLength = this.config.isX
        ? (inv ? plotArea.height : plotArea.width)
        : (inv ? plotArea.width : plotArea.height);
      const rendersHoriz = this.config.isX ? !inv : !!inv;
      const tickPixelInterval = this.config.tickPixelInterval ?? 72;
      const idealTickCount = Math.min(20, Math.max(2, Math.round(axisLength / tickPixelInterval)));
      const domain = this.scale.domain();
      const tickValues = this.computeNiceTicks(domain[0], domain[1], idealTickCount);

      const hasExplicitMax = this.config.max !== undefined && this.config.max !== null;
      const hasExplicitMin = this.config.min !== undefined && this.config.min !== null;
      const endOnTick = !this.config.isX && this.config.endOnTick !== false;
      if (tickValues.length > 0 && endOnTick && !hasExplicitMax) {
        const lastTick = tickValues[tickValues.length - 1];
        if (lastTick < domain[1]) {
          const interval = tickValues.length > 1 ? tickValues[1] - tickValues[0] : lastTick;
          tickValues.push(lastTick + interval);
        }
        const newMax = tickValues[tickValues.length - 1];
        const newMin = hasExplicitMin ? domain[0] : tickValues[0];
        this.scale.domain([newMin, newMax]);
      }

      axisGen.tickValues(tickValues);
    }

    if (this.config.labels?.formatter) {
      const formatter = this.config.labels.formatter;
      axisGen.tickFormat((d: any) => formatter.call({ value: d, axis: this }));
    } else {
      axisGen.tickFormat((d: any) => this.linearTickFormat(d as number, axisGen));
    }

    const axisGroup = group.append('g')
      .attr('class', `katucharts-axis katucharts-axis-${this.config.isX ? 'x' : 'y'}`)
      .attr('transform', this.getTransform(plotArea));

    this.renderGridLines(group, this.scale, plotArea);
    this.renderPlotBands(group, this.scale, plotArea);
    this.renderPlotLines(group, this.scale, plotArea);

    axisGroup.call(axisGen as any);
    this.applyAxisStyles(axisGroup, plotArea);
    this.renderTitle(axisGroup, plotArea);
    this.renderStackLabels(group, this.scale, plotArea);
  }

  private renderStackLabels(
    group: Selection<SVGGElement, unknown, null, undefined>,
    scale: any,
    plotArea: PlotArea
  ): void {
    if (!this.config.stackLabels?.enabled || this.config.isX) return;
    // Stack labels are rendered by the chart orchestrator with stack totals.
    // This is a hook point for external callers.
  }

  /**
   * Computes "nice" round tick values for clean axis labels:
   * picks intervals from the sequence 1, 2, 2.5, 5 scaled by powers of 10,
   * choosing the smallest interval that produces at most `maxTicks` ticks.
   */
  private computeNiceTicks(min: number, max: number, maxTicks: number): number[] {
    const range = max - min;
    if (range <= 0) return [min];

    const rawInterval = range / maxTicks;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawInterval)));
    const residual = rawInterval / magnitude;

    let niceInterval: number;
    if (residual <= Math.SQRT2) niceInterval = magnitude;
    else if (residual <= Math.sqrt(2 * 2.5)) niceInterval = 2 * magnitude;
    else if (residual <= Math.sqrt(2.5 * 5)) niceInterval = 2.5 * magnitude;
    else if (residual <= Math.sqrt(5 * 10)) niceInterval = 5 * magnitude;
    else niceInterval = 10 * magnitude;

    const intervalStr = niceInterval.toString();
    const decimals = intervalStr.includes('.') ? intervalStr.split('.')[1].length : 0;
    const roundFactor = Math.pow(10, decimals);
    const snap = (v: number): number => Math.round(v * roundFactor) / roundFactor;

    const tickStart = snap(Math.ceil(min / niceInterval) * niceInterval);
    const ticks: number[] = [];
    const epsilon = niceInterval * 1e-6;

    for (let i = 0; i < maxTicks + 3; i++) {
      const v = snap(tickStart + i * niceInterval);
      if (v > max + epsilon) break;
      ticks.push(v);
    }

    return ticks;
  }

  getPixelForValue(value: number): number {
    return this.scale(value);
  }

  getValueForPixel(pixel: number): number {
    return this.scale.invert(pixel);
  }

  /**
   * SI suffixes (k, M, G, T) are applied only when
   * the tick interval is >= 1000. Below that, plain numbers with thousands separators are used.
   */
  private linearTickFormat(value: number, axisGen: D3Axis<any>): string {
    const tickValues = (axisGen as any).tickValues?.() as number[] | null;
    if (tickValues && tickValues.length >= 2) {
      const rawInterval = Math.abs(tickValues[1] - tickValues[0]);
      const interval = parseFloat(rawInterval.toPrecision(6));
      if (interval < 1000) {
        const intervalStr = interval.toString();
        const decimals = intervalStr.includes('.') ? intervalStr.split('.')[1].length : 0;
        const formatted = numberFormat(value, decimals);
        if (decimals === 0) return formatted;
        return formatted.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
      }
    }
    return siFormat(value);
  }

  private getTransform(plotArea: PlotArea): string {
    const inv = this.config._inverted;
    if (this.config.isX) {
      if (inv) return this.config.opposite ? `translate(${plotArea.width},0)` : '';
      return this.config.opposite ? '' : `translate(0,${plotArea.height})`;
    }
    if (inv) return this.config.opposite ? '' : `translate(0,${plotArea.height})`;
    return this.config.opposite ? `translate(${plotArea.width},0)` : '';
  }
}

export class LogarithmicAxis extends BaseAxis implements AxisInstance {
  scale: ScaleLogarithmic<number, number>;

  constructor(config: InternalAxisConfig, plotArea: PlotArea) {
    super(config, plotArea);
    this.scale = scaleLog().range(this.getRange()).domain([1, 10]);
  }

  updateDomain(data: { min: number; max: number }): void {
    let { min, max } = data;
    min = Math.max(min, 0.001);
    if (this.config.min !== undefined && this.config.min !== null) {
      min = Math.max(this.config.min, 0.001);
    }
    if (this.config.max !== undefined && this.config.max !== null) {
      max = this.config.max;
    }

    const logMin = Math.log10(Math.max(min, 1e-10));
    const logMax = Math.log10(Math.max(max, 1e-10));
    const logRange = Math.abs(logMax - logMin) || 1;
    const pad = this.config.isX
      ? (this.config.minPadding ?? 0.01)
      : (this.config.minPadding ?? 0.05);

    if (this.config.min === undefined || this.config.min === null) {
      min = Math.pow(10, logMin - logRange * pad);
    }
    if (this.config.max === undefined || this.config.max === null) {
      max = Math.pow(10, logMax + logRange * pad);
    }

    if (this.config.startOnTick) {
      min = Math.pow(10, Math.floor(Math.log10(Math.max(min, 1e-10))));
    }
    if (this.config.endOnTick) {
      max = Math.pow(10, Math.ceil(Math.log10(Math.max(max, 1e-10))));
    }

    this.scale.domain([min, max]).range(this.getRange());
  }

  /**
   * Generates tick values at powers of 10 for logarithmic axes.
   * tickInterval refers to the exponent interval (1 = every decade, 2 = every other decade).
   * When no tickInterval is set, the axis uses tickPixelInterval to auto-compute the step.
   */
  private computeLogTicks(): number[] {
    const domain = this.scale.domain();
    const lo = Math.log10(Math.max(domain[0], 1e-10));
    const hi = Math.log10(Math.max(domain[1], 1e-10));

    if (this.config.tickPositions) {
      return this.config.tickPositions;
    }

    let expStep: number;
    if (this.config.tickInterval) {
      expStep = this.config.tickInterval;
    } else {
      expStep = 1;
      const totalDecades = Math.abs(hi - lo);
      if (totalDecades > 12) {
        const axisLength = this.config.isX ? this.plotArea.width : this.plotArea.height;
        const minTickSpacing = 20;
        const maxTicks = Math.max(2, Math.floor(axisLength / minTickSpacing));
        expStep = Math.max(1, Math.ceil(totalDecades / maxTicks));
      }
    }

    const startExp = Math.floor(lo);
    const endExp = Math.ceil(hi);
    const ticks: number[] = [];

    for (let exp = startExp; exp <= endExp; exp += expStep) {
      const val = Math.pow(10, exp);
      if (val >= domain[0] * 0.999 && val <= domain[1] * 1.001) {
        ticks.push(val);
      }
    }

    if (ticks.length === 0) {
      ticks.push(domain[0], domain[1]);
    } else if (ticks.length === 1) {
      if (ticks[0] > domain[0] * 1.5) ticks.unshift(domain[0]);
      if (ticks[0] < domain[1] / 1.5) ticks.push(domain[1]);
    }

    return ticks;
  }

  render(group: Selection<SVGGElement, unknown, null, undefined>, plotArea: PlotArea): void {
    this.plotArea = plotArea;
    this.scale.range(this.getRange());

    const axisGen = this.createD3Axis(this.scale);

    const ticks = this.computeLogTicks();
    axisGen.tickValues(ticks);

    if (this.config.labels?.formatter) {
      const formatter = this.config.labels.formatter;
      axisGen.tickFormat((d: any) => formatter.call({ value: d, axis: this }));
    } else {
      axisGen.tickFormat((d: any) => siFormat(d as number));
    }

    const atBottom = this.config.isX ? !this.config._inverted : !!this.config._inverted;
    const axisGroup = group.append('g')
      .attr('class', `katucharts-axis katucharts-axis-${this.config.isX ? 'x' : 'y'}`)
      .attr('transform', atBottom ? `translate(0,${plotArea.height})` : '');

    this.renderGridLines(group, this.scale, plotArea, ticks);
    axisGroup.call(axisGen as any);
    this.applyAxisStyles(axisGroup, plotArea);
    this.renderTitle(axisGroup, plotArea);
  }

  getPixelForValue(value: number): number {
    return this.scale(Math.max(value, 0.001));
  }

  getValueForPixel(pixel: number): number {
    return this.scale.invert(pixel);
  }
}

export class DateTimeAxis extends BaseAxis implements AxisInstance {
  scale: ScaleTime<number, number>;

  constructor(config: InternalAxisConfig, plotArea: PlotArea) {
    super(config, plotArea);
    this.scale = scaleTime().range(this.getRange()).domain([new Date(), new Date()]) as any;
  }

  updateDomain(data: { min: number; max: number }): void {
    const min = this.config.min ?? data.min;
    const max = this.config.max ?? data.max;
    (this.scale as any).domain([new Date(min), new Date(max)]).range(this.getRange());
  }

  render(group: Selection<SVGGElement, unknown, null, undefined>, plotArea: PlotArea): void {
    this.plotArea = plotArea;
    this.scale.range(this.getRange() as any);

    const axisGen = this.createD3Axis(this.scale);

    if (this.config.labels?.formatter) {
      const formatter = this.config.labels.formatter;
      axisGen.tickFormat((d: any) => formatter.call({ value: d.getTime(), axis: this }));
    } else if (this.config.dateTimeLabelFormats) {
      const fmts = this.config.dateTimeLabelFormats;
      axisGen.tickFormat((d: any) => {
        const date = d as Date;
        const fmt = this.pickDateFormat(date, fmts);
        return timeFormat(fmt)(date);
      });
    }

    const atBottom = this.config.isX ? !this.config._inverted : !!this.config._inverted;
    const axisGroup = group.append('g')
      .attr('class', `katucharts-axis katucharts-axis-${this.config.isX ? 'x' : 'y'}`)
      .attr('transform', atBottom ? `translate(0,${plotArea.height})` : '');

    this.renderGridLines(group, this.scale, plotArea);
    axisGroup.call(axisGen as any);
    this.applyAxisStyles(axisGroup, plotArea);
    this.renderTitle(axisGroup, plotArea);
  }

  private pickDateFormat(date: Date, fmts: Record<string, string>): string {
    if (date.getMilliseconds() !== 0 && fmts.millisecond) return fmts.millisecond;
    if (date.getSeconds() !== 0 && fmts.second) return fmts.second;
    if (date.getMinutes() !== 0 && fmts.minute) return fmts.minute;
    if (date.getHours() !== 0 && fmts.hour) return fmts.hour;
    if (date.getDate() !== 1 && fmts.day) return fmts.day;
    if (date.getMonth() !== 0 && fmts.month) return fmts.month;
    if (fmts.year) return fmts.year;
    return fmts.day || '%b %d';
  }

  getPixelForValue(value: number): number {
    return (this.scale as any)(new Date(value));
  }

  getValueForPixel(pixel: number): number {
    return (this.scale as any).invert(pixel).getTime();
  }
}

export class CategoryAxis extends BaseAxis implements AxisInstance {
  scale: ScaleBand<string>;

  constructor(config: InternalAxisConfig, plotArea: PlotArea) {
    super(config, plotArea);
    this.scale = scaleBand<string>()
      .range(this.getRange() as [number, number])
      .padding(0.1);

    if (config.categories) {
      this.scale.domain(config.categories);
    }
  }

  updateDomain(data: string[] | { min: number; max: number }): void {
    if (Array.isArray(data)) {
      this.scale.domain(data).range(this.getRange() as [number, number]);
    }
  }

  render(group: Selection<SVGGElement, unknown, null, undefined>, plotArea: PlotArea): void {
    this.plotArea = plotArea;
    this.scale.range(this.getRange() as [number, number]);

    const axisGen = this.createD3Axis(this.scale);

    const atBottom = this.config.isX ? !this.config._inverted : !!this.config._inverted;
    const axisGroup = group.append('g')
      .attr('class', `katucharts-axis katucharts-axis-${this.config.isX ? 'x' : 'y'}`)
      .attr('transform', atBottom ? `translate(0,${plotArea.height})` : '');

    this.renderGridLines(group, this.scale, plotArea);
    axisGroup.call(axisGen as any);
    this.applyAxisStyles(axisGroup, plotArea);
    this.renderTitle(axisGroup, plotArea);
  }

  getPixelForValue(value: any): number {
    const domain = this.scale.domain();
    let key: string;
    if (typeof value === 'number') {
      const idx = Math.round(value);
      if (idx >= 0 && idx < domain.length) {
        key = domain[idx];
        const basePixel = (this.scale(key) ?? 0) + this.scale.bandwidth() / 2;
        const offset = (value - idx) * this.scale.bandwidth();
        return basePixel + offset;
      }
      key = String(value);
    } else {
      key = String(value);
    }
    return (this.scale(key) ?? 0) + this.scale.bandwidth() / 2;
  }

  getBandwidth(): number {
    return this.scale.bandwidth();
  }

  getValueForPixel(pixel: number): string {
    const domain = this.scale.domain();
    const step = this.scale.step();
    const index = Math.floor(pixel / step);
    return domain[Math.min(index, domain.length - 1)];
  }
}

import { symbol as d3Symbol, symbolCircle, symbolSquare, symbolDiamond, symbolTriangle, symbolTriangle2, symbolCross } from 'd3-shape';
import 'd3-transition';
import { BaseSeries } from '../BaseSeries';
import type { InternalSeriesConfig, PointOptions } from '../../types/options';
import { templateFormat, stripHtmlTags } from '../../utils/format';
import { DEFAULT_CHART_TEXT_SIZE, parseFontSizePx } from '../../utils/chartText';
import {
  ENTRY_DURATION,
  ENTRY_STAGGER_PER_ITEM,
  HOVER_DURATION,
  EASE_ENTRY,
  EASE_HOVER,
} from '../../core/animationConstants';

const SYMBOL_MAP: Record<string, any> = {
  circle: symbolCircle,
  square: symbolSquare,
  diamond: symbolDiamond,
  triangle: symbolTriangle,
  'triangle-down': symbolTriangle2,
  cross: symbolCross,
};

/** One milestone resolved to plot pixels plus the bookkeeping the hover/animation code needs. */
interface TimelineNode {
  point: PointOptions;
  index: number;
  cx: number;
  cy: number;
  side: 1 | -1;
  radius: number;
  symbol: string;
  color: string;
  group: any;
  marker: any;
}

interface LabelLine {
  text: string;
  bold: boolean;
}

/** Visible bounds of a node's label (its box when drawn, otherwise the text). */
interface LabelBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Sequential event markers laid along a baseline, each with an alternating
 * callout label and the longer description surfaced in the tooltip. Horizontal
 * by default; `chart.inverted` (set directly or by a responsive rule) flips it
 * to a vertical layout. All geometry is derived from the plot area, so the chart
 * reflows on resize.
 */
export class TimelineChart extends BaseSeries {
  private nodes: TimelineNode[] = [];

  constructor(config: InternalSeriesConfig) {
    super(config);
    this.applyDescriptionTooltipDefault();
  }

  /**
   * When points carry a description and no point format is configured, default
   * the tooltip body to that description — matching the conventional milestone
   * behavior where the long text lives in the tooltip, not on the chart.
   */
  private applyDescriptionTooltipDefault(): void {
    const hasDescription = this.data.some(
      d => (d as any).description != null && (d as any).description !== ''
    );
    if (!hasDescription) return;
    const existing = this.config.tooltip;
    if (existing?.pointFormat || existing?.pointFormatter || existing?.formatter) return;
    this.config.tooltip = { ...existing, pointFormat: '{point.description}' };
  }

  render(): void {
    const data = this.data;
    if (!data.length) return;

    const inverted = !!this.context.inverted;
    this.nodes = this.layoutNodes(inverted);

    this.renderBaseline(inverted);
    this.nodes.forEach(node => this.renderNode(node, inverted));

    if (this.context.animate) {
      this.emitAfterAnimate(ENTRY_DURATION + data.length * ENTRY_STAGGER_PER_ITEM);
    }
  }

  private layoutNodes(inverted: boolean): TimelineNode[] {
    const { plotArea, colors } = this.context;
    const cfg = this.config as any;
    const data = this.data;
    const n = data.length;
    const colorByPoint = cfg.colorByPoint !== false;
    const alternate = this.config.dataLabels?.alternate !== false;
    const markerCfg = this.config.marker || {};
    const padMain = inverted ? 28 : 52;
    const span = Math.max(1, (inverted ? plotArea.height : plotArea.width) - padMain * 2);

    return data.map((point, i) => {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const main = padMain + t * span;
      const cx = inverted ? plotArea.width / 2 : main;
      const cy = inverted ? main : plotArea.height / 2;
      const side: 1 | -1 = alternate
        ? (i % 2 === 0 ? -1 : 1)
        : (inverted ? 1 : -1);
      const color = point.color
        || (colorByPoint ? colors[i % colors.length] : this.getColor());
      return {
        point,
        index: i,
        cx,
        cy,
        side,
        radius: point.marker?.radius ?? markerCfg.radius ?? 6,
        symbol: point.marker?.symbol ?? markerCfg.symbol ?? 'circle',
        color,
        group: null,
        marker: null,
      };
    });
  }

  private renderBaseline(inverted: boolean): void {
    if (this.nodes.length < 2) return;
    const cfg = this.config as any;
    const first = this.nodes[0];
    const last = this.nodes[this.nodes.length - 1];
    const width = cfg.lineWidth ?? 4;
    const color = cfg.lineColor ?? 'rgba(140,140,140,0.5)';

    const line = this.group.append('line')
      .attr('class', 'katucharts-timeline-baseline')
      .attr('x1', first.cx).attr('y1', first.cy)
      .attr('stroke', color)
      .attr('stroke-width', width)
      .attr('stroke-linecap', 'round');

    const endX = inverted ? first.cx : last.cx;
    const endY = inverted ? last.cy : first.cy;

    if (this.context.animate) {
      line.attr('x2', first.cx).attr('y2', first.cy)
        .transition().duration(ENTRY_DURATION).ease(EASE_ENTRY)
        .attr('x2', endX).attr('y2', endY);
    } else {
      line.attr('x2', endX).attr('y2', endY);
    }
  }

  private renderNode(node: TimelineNode, inverted: boolean): void {
    const g = this.group.append('g').attr('class', 'katucharts-timeline-node');
    node.group = g;

    this.renderMarker(g, node);
    const labelBounds = this.renderLabel(g, node, inverted);
    this.renderConnector(g, node, inverted, labelBounds);
    this.attachNodeEvents(node);

    if (this.context.animate) {
      g.attr('opacity', 0)
        .transition().duration(ENTRY_DURATION).ease(EASE_ENTRY)
        .delay(node.index * ENTRY_STAGGER_PER_ITEM)
        .attr('opacity', 1);
    }
  }

  private renderMarker(g: any, node: TimelineNode): void {
    const markerCfg = this.config.marker || {};
    const lineColor = node.point.marker?.lineColor ?? markerCfg.lineColor ?? this.autoBorderColor();
    const lineWidth = node.point.marker?.lineWidth ?? markerCfg.lineWidth ?? 1;
    const animate = this.context.animate;

    if (node.symbol === 'circle') {
      const c = g.append('circle')
        .attr('class', 'katucharts-timeline-marker')
        .attr('cx', node.cx).attr('cy', node.cy)
        .attr('fill', node.color)
        .attr('stroke', lineColor)
        .attr('stroke-width', lineWidth);
      if (animate) {
        c.attr('r', 0)
          .transition().duration(ENTRY_DURATION).ease(EASE_ENTRY)
          .delay(node.index * ENTRY_STAGGER_PER_ITEM)
          .attr('r', node.radius);
      } else {
        c.attr('r', node.radius);
      }
      node.marker = c;
    } else {
      const type = SYMBOL_MAP[node.symbol] || symbolCircle;
      node.marker = g.append('path')
        .attr('class', 'katucharts-timeline-marker')
        .attr('transform', `translate(${node.cx},${node.cy})`)
        .attr('fill', node.color)
        .attr('stroke', lineColor)
        .attr('stroke-width', lineWidth)
        .attr('d', d3Symbol().type(type).size(Math.PI * node.radius * node.radius)() as string);
    }
  }

  /**
   * Draw the connector from the marker edge to the near edge of the label box,
   * so the line meets the box cleanly instead of running inside it. Falls back
   * to a fixed gap when the label has no measurable bounds.
   */
  private renderConnector(g: any, node: TimelineNode, inverted: boolean, bounds: LabelBounds | null): void {
    const dlCfg = this.config.dataLabels || {};
    const width = dlCfg.connectorWidth ?? 1;
    const color = dlCfg.connectorColor ?? node.color;
    const fallbackGap = node.radius + (dlCfg.distance ?? 22);

    const conn = g.append('line')
      .attr('class', 'katucharts-timeline-connector')
      .attr('stroke', color)
      .attr('stroke-width', width);

    if (inverted) {
      const start = node.cx + node.side * node.radius;
      const end = bounds
        ? (node.side > 0 ? bounds.x : bounds.x + bounds.width)
        : node.cx + node.side * fallbackGap;
      if (node.side > 0 ? end <= start : end >= start) return;
      conn.attr('y1', node.cy).attr('y2', node.cy).attr('x1', start).attr('x2', end);
    } else {
      const start = node.cy + node.side * node.radius;
      const end = bounds
        ? (node.side < 0 ? bounds.y + bounds.height : bounds.y)
        : node.cy + node.side * fallbackGap;
      if (node.side < 0 ? end >= start : end <= start) return;
      conn.attr('x1', node.cx).attr('x2', node.cx).attr('y1', start).attr('y2', end);
    }
  }

  private renderLabel(g: any, node: TimelineNode, inverted: boolean): LabelBounds | null {
    const dlCfg = this.config.dataLabels || {};
    if (dlCfg.enabled === false) return null;

    const lines = this.buildLabelLines(node.point, node.index);
    if (!lines.length) return null;

    const style = dlCfg.style || {};
    const fontPx = parseFontSizePx((style.fontSize as string) || DEFAULT_CHART_TEXT_SIZE);
    const lineHeight = fontPx * 1.28;
    const labelColor = dlCfg.color || (style.color as string) || this.autoLabelColor();
    const gap = node.radius + (dlCfg.distance ?? 22);
    const anchorX = inverted ? node.cx + node.side * gap : node.cx;
    const anchorY = inverted ? node.cy : node.cy + node.side * gap;
    const textAnchor = inverted ? (node.side > 0 ? 'start' : 'end') : 'middle';

    const text = g.append('text')
      .attr('class', 'katucharts-timeline-label')
      .attr('text-anchor', textAnchor)
      .style('font-size', `${fontPx}px`)
      .style('fill', labelColor);

    const count = lines.length;
    lines.forEach((line, k) => {
      const lineY = this.labelLineY(anchorY, k, count, lineHeight, node.side, inverted, node.cy);
      text.append('tspan')
        .attr('x', anchorX)
        .attr('y', lineY)
        .attr('dominant-baseline', 'middle')
        .style('font-weight', line.bold ? 'bold' : 'normal')
        .text(line.text);
    });

    return this.renderLabelBox(g, text, node, dlCfg);
  }

  private labelLineY(
    anchorY: number, k: number, count: number, lineHeight: number,
    side: 1 | -1, inverted: boolean, cy: number
  ): number {
    if (inverted) {
      return cy - ((count - 1) / 2) * lineHeight + k * lineHeight;
    }
    return side < 0
      ? anchorY - (count - 1 - k) * lineHeight
      : anchorY + k * lineHeight;
  }

  /**
   * Draw the optional rounded box behind the label and report the visible label
   * bounds — the box when one is drawn, otherwise the bare text — so the
   * connector can stop exactly at its near edge.
   */
  private renderLabelBox(g: any, text: any, node: TimelineNode, dlCfg: any): LabelBounds | null {
    const bbox = (text.node() as SVGTextElement).getBBox?.();
    if (!bbox || !bbox.width) return null;

    const borderWidth = dlCfg.borderWidth ?? 1.5;
    const background = dlCfg.backgroundColor ?? 'none';
    if (!borderWidth && background === 'none') {
      return { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height };
    }

    const padding = dlCfg.padding ?? 5;
    const borderColor = (!dlCfg.borderColor || dlCfg.borderColor === 'auto')
      ? node.color
      : dlCfg.borderColor;
    const bounds: LabelBounds = {
      x: bbox.x - padding,
      y: bbox.y - padding,
      width: bbox.width + padding * 2,
      height: bbox.height + padding * 2,
    };

    g.insert('rect', '.katucharts-timeline-label')
      .attr('x', bounds.x)
      .attr('y', bounds.y)
      .attr('width', bounds.width)
      .attr('height', bounds.height)
      .attr('rx', dlCfg.borderRadius ?? 3)
      .attr('fill', background)
      .attr('stroke', borderColor)
      .attr('stroke-width', borderWidth);

    return bounds;
  }

  /**
   * Resolve a point's label into rendered lines. A configured formatter/format
   * wins (its HTML is split on line breaks and stripped of markup); otherwise the
   * default is the point name in bold over its label.
   */
  private buildLabelLines(point: PointOptions, index: number): LabelLine[] {
    const dlCfg = this.config.dataLabels || {};
    let raw: string | null = null;

    if (dlCfg.formatter) {
      raw = dlCfg.formatter.call({
        point: { ...point, index }, series: this, x: point.x ?? index, y: point.y,
      });
    } else if (dlCfg.format) {
      raw = templateFormat(dlCfg.format, {
        point, series: { name: this.config.name ?? '' }, x: point.x, y: point.y,
      });
    }

    if (raw == null) {
      const lines: LabelLine[] = [];
      if (point.name != null) lines.push({ text: String(point.name), bold: true });
      if ((point as any).label != null) lines.push({ text: String((point as any).label), bold: false });
      if (!lines.length) lines.push({ text: `Event ${index + 1}`, bold: true });
      return lines;
    }

    return String(raw)
      .split(/<br\s*\/?>/i)
      .map(part => stripHtmlTags(part))
      .filter(part => part.length > 0)
      .map((part, i) => ({ text: part, bold: i === 0 }));
  }

  private attachNodeEvents(node: TimelineNode): void {
    if (this.config.enableMouseTracking === false) return;
    const pointEvents = node.point.events || {};
    const seriesPointEvents = this.config.point?.events || {};

    node.group
      .style('cursor', this.config.cursor || 'pointer')
      .on('mouseover', (event: MouseEvent) => {
        this.bumpMarker(node, node.radius + 3);
        node.group.style('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))');
        this.dimOthers(node);
        this.context.events.emit('point:mouseover', {
          point: node.point, index: node.index, series: this, event,
          plotX: node.cx, plotY: node.cy,
        });
        pointEvents.mouseOver?.call(node.point, event);
        seriesPointEvents.mouseOver?.call(node.point, event);
      })
      .on('mouseout', (event: MouseEvent) => {
        this.bumpMarker(node, node.radius);
        node.group.style('filter', '');
        this.restoreOpacity();
        this.context.events.emit('point:mouseout', { point: node.point, index: node.index, series: this, event });
        pointEvents.mouseOut?.call(node.point, event);
        seriesPointEvents.mouseOut?.call(node.point, event);
      })
      .on('click', (event: MouseEvent) => {
        this.context.events.emit('point:click', { point: node.point, index: node.index, series: this, event });
        pointEvents.click?.call(node.point, event);
        seriesPointEvents.click?.call(node.point, event);
        this.config.events?.click?.call(this, event);
      });
  }

  private bumpMarker(node: TimelineNode, radius: number): void {
    if (!node.marker) return;
    const sel = node.marker.interrupt('size')
      .transition('size').duration(HOVER_DURATION).ease(EASE_HOVER);
    if (node.symbol === 'circle') {
      sel.attr('r', radius);
    } else {
      const type = SYMBOL_MAP[node.symbol] || symbolCircle;
      sel.attr('d', d3Symbol().type(type).size(Math.PI * radius * radius)() as string);
    }
  }

  private dimOthers(active: TimelineNode): void {
    this.nodes.forEach(o => {
      o.group.interrupt('dim');
      if (o === active) {
        o.group.attr('opacity', 1);
      } else {
        o.group.transition('dim').duration(HOVER_DURATION).ease(EASE_HOVER).attr('opacity', 0.4);
      }
    });
  }

  private restoreOpacity(): void {
    this.nodes.forEach(o => {
      o.group.interrupt('dim');
      o.group.transition('dim').duration(HOVER_DURATION).ease(EASE_HOVER).attr('opacity', 1);
    });
  }

  getDataExtents() {
    return { xMin: 0, xMax: 0, yMin: 0, yMax: 0 };
  }
}

export class GanttChart extends BaseSeries {
  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  render(): void {
    const { xAxis, plotArea, colors } = this.context;
    const data = this.data;
    const barHeight = Math.min(25, (plotArea.height / Math.max(data.length, 1)) * 0.7);
    const rowHeight = plotArea.height / Math.max(data.length, 1);

    data.forEach((d, i) => {
      const start = (d as any).start ?? d.x ?? 0;
      const end = (d as any).end ?? (start + 1);
      const x1 = xAxis.getPixelForValue(start);
      const x2 = xAxis.getPixelForValue(end);
      const y = i * rowHeight + (rowHeight - barHeight) / 2;
      const color = d.color || colors[i % colors.length];

      const el = this.group.append('rect')
        .attr('class', 'katucharts-gantt-bar')
        .attr('x', x1)
        .attr('y', y)
        .attr('width', Math.max(1, x2 - x1))
        .attr('height', barHeight)
        .attr('rx', 3)
        .attr('fill', color)
        .attr('stroke', 'none');

      this.group.append('text')
        .attr('x', x1 + 4)
        .attr('y', y + barHeight / 2)
        .attr('dy', '0.35em')
        .attr('font-size', '10px')
        .attr('fill', '#fff')
        .text(d.name || '');

      el.style('cursor', 'pointer');
      el.on('mouseover', (event: MouseEvent) => {
        el.style('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))');
        el.interrupt('hover')
          .transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER)
          .attr('stroke', '#333').attr('stroke-width', 1.5);
        this.context.events.emit('point:mouseover', {
          point: d, index: i, series: this, event,
          plotX: (x1 + x2) / 2, plotY: y + barHeight / 2,
        });
      })
      .on('mouseout', (event: MouseEvent) => {
        el.style('filter', '');
        el.interrupt('hover')
          .transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER)
          .attr('stroke', 'none').attr('stroke-width', 0);
        this.context.events.emit('point:mouseout', { point: d, index: i, series: this, event });
      })
      .on('click', (event: MouseEvent) => {
        this.context.events.emit('point:click', { point: d, index: i, series: this, event });
      });
    });
  }

  getDataExtents() {
    let xMin = Infinity, xMax = -Infinity;
    for (const d of this.data) {
      const start = (d as any).start ?? d.x ?? 0;
      const end = (d as any).end ?? (start + 1);
      xMin = Math.min(xMin, start);
      xMax = Math.max(xMax, end);
    }
    return { xMin, xMax, yMin: 0, yMax: 0 };
  }
}

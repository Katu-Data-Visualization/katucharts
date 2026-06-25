import { select } from 'd3-selection';
import 'd3-transition';
import { BaseSeries, staggerDelay } from '../BaseSeries';
import type { InternalSeriesConfig, PointOptions, DataLabelOptions, PlotArea } from '../../types/options';
import { resolvePercent } from '../../utils/geometry';
import { templateFormat, stripHtmlTags } from '../../utils/format';
import { DEFAULT_CHART_TEXT_SIZE, readableTextColor } from '../../utils/chartText';
import {
  ENTRY_DURATION,
  ENTRY_DELAY_BASE,
  ENTRY_STAGGER_PER_ITEM,
  HOVER_DURATION,
  EASE_ENTRY,
  EASE_HOVER,
} from '../../core/animationConstants';

interface Category {
  point: PointOptions;
  dataIndex: number;
  color: string;
  seats: number;
  group?: string;
}

interface Seat {
  x: number;
  y: number;
  angle: number;
  ring: number;
  catIndex: number;
}

interface ItemLayout {
  seats: Seat[];
  radius: number;
  centroids: { x: number; y: number }[];
}

/**
 * Item series: draws one circle ("seat") per unit of each point's `y` value.
 * With `startAngle`/`endAngle` set it lays the seats out as a hemicycle
 * (classroom chart); otherwise it packs them into a rectangular grid.
 *
 * Two data models are supported. By default each data point is a category drawn
 * as `y` identical seats, and each category is one legend entry. When points
 * carry a `group` field, each point is instead an individual seat (its own name,
 * tooltip and click) while color, legend, hide and hover-dim all work per group
 * — e.g. one seat per student, grouped and colored by status.
 */
export class ItemChart extends BaseSeries {
  constructor(config: InternalSeriesConfig) {
    super(config);
    config.showInLegend = config.showInLegend ?? true;
  }

  getMultiLegendItems(): { label: string; color: string; visible?: boolean }[] | null {
    if (this.isGrouped()) {
      return this.orderedGroups().map(g => ({
        label: g,
        color: this.groupColor(g),
        visible: this.data.some(d => (d as any).group === g && d.visible !== false),
      }));
    }
    return this.categories().map((c, i) => ({
      label: c.point.name || (c.point as any).label || `Item ${i + 1}`,
      color: c.color,
      visible: c.point.visible !== false,
    }));
  }

  getDataExtents(): { xMin: number; xMax: number; yMin: number; yMax: number } {
    return { xMin: 0, xMax: 0, yMin: 0, yMax: 0 };
  }

  /**
   * Toggles the visibility of the legend item at `position`, re-lays-out, and
   * returns its new visible state so the legend can update its label. Reuses the
   * same `point.visible` convention the pie series uses to drop hidden points;
   * when grouped, the whole group is toggled together.
   */
  toggleLegendItem(position: number): boolean | null {
    if (this.isGrouped()) {
      const g = this.orderedGroups()[position];
      if (g == null) return null;
      const newVisible = !this.data.some(d => (d as any).group === g && d.visible !== false);
      this.data.forEach(d => { if ((d as any).group === g) d.visible = newVisible; });
      this.redraw();
      return newVisible;
    }
    const cat = this.categories()[position];
    if (!cat) return null;
    cat.point.visible = cat.point.visible === false;
    this.redraw();
    return cat.point.visible !== false;
  }

  private isGrouped(): boolean {
    return this.data.some(d => (d as any).group != null);
  }

  /** Distinct group names in first-seen order (stable color/legend ordering). */
  private orderedGroups(): string[] {
    const seen: string[] = [];
    for (const d of this.data) {
      const g = (d as any).group;
      if (g != null && !seen.includes(g)) seen.push(g);
    }
    return seen;
  }

  /** Color for a group: an explicit point color in the group, else by palette. */
  private groupColor(group: string): string {
    const explicit = this.data.find(d => (d as any).group === group && d.color)?.color;
    if (explicit) return explicit;
    const idx = this.orderedGroups().indexOf(group);
    return this.config.colors
      ? this.config.colors[idx % this.config.colors.length]
      : this.context.colors[idx % this.context.colors.length];
  }

  render(): void {
    const { plotArea } = this.context;
    const ignoreHidden = this.config.ignoreHiddenPoint !== false;
    const visible = this.categories().filter(c => !ignoreHidden || c.point.visible !== false);
    const totalSeats = visible.reduce((s, c) => s + c.seats, 0);
    if (totalSeats === 0) return;

    const isCircular = this.config.startAngle !== undefined && this.config.endAngle !== undefined;
    const layout = isCircular
      ? this.layoutHemicycle(visible, totalSeats, plotArea)
      : this.layoutGrid(visible, totalSeats, plotArea);

    this.renderSeats(visible, layout);
    this.renderItemLabels(visible, layout);

    if (this.context.animate) {
      this.emitAfterAnimate(ENTRY_DURATION + Math.min(totalSeats, 60) * ENTRY_STAGGER_PER_ITEM);
    }
  }

  /**
   * All categories with a positive value, each carrying a stable color. Ungrouped
   * categories take their color from their position (so hiding one never recolors
   * the others); grouped points take their group's color.
   */
  private categories(): Category[] {
    const grouped = this.isGrouped();
    const cats: Category[] = [];
    let pos = 0;
    this.data.forEach((d, i) => {
      if (d.y === null || d.y === undefined || (d.y ?? 0) <= 0) return;
      const group = (d as any).group as string | undefined;
      const color = d.color
        || (grouped && group != null
          ? this.groupColor(group)
          : (this.config.colors
            ? this.config.colors[pos % this.config.colors.length]
            : this.context.colors[pos % this.context.colors.length]));
      cats.push({ point: d, dataIndex: i, color, seats: Math.round(d.y ?? 0), group });
      pos++;
    });
    return cats;
  }

  /**
   * Distributes `totalSeats` across concentric rings spanning `[startAngle,
   * endAngle]`, sizing each seat so neighbouring circles never overlap and
   * assigning a contiguous block of seats to each category.
   */
  private layoutHemicycle(cats: Category[], totalSeats: number, plotArea: PlotArea): ItemLayout {
    const center = this.config.center || ['50%', '50%'];
    const cx = resolvePercent(center[0], plotArea.width);
    const cy = resolvePercent(center[1], plotArea.height);

    const startAngle = (this.config.startAngle ?? 0) * Math.PI / 180;
    const endAngle = (this.config.endAngle ?? 360) * Math.PI / 180;
    const angleSpan = endAngle - startAngle;
    const itemPadding = this.config.itemPadding ?? 0.1;

    const minDim = Math.min(plotArea.width, plotArea.height);
    /**
     * Without an explicit `size`, scale the arc to the largest radius that keeps
     * it inside the plot for its center and angular span — so it fills the card
     * on desktop yet never clips on narrow/mobile viewports. An explicit `size`
     * is honored verbatim (it may intentionally overflow).
     */
    const outerRadius = this.config.size !== undefined
      ? resolvePercent(this.config.size, minDim) / 2
      : this.fitRadius(cx, cy, plotArea.width, plotArea.height, startAngle, endAngle) * 0.96;
    const innerRadius = resolvePercent(this.config.innerSize ?? '40%', outerRadius * 2) / 2;

    let rows = this.config.rows;
    if (!rows || rows < 1) {
      rows = this.estimateRows(totalSeats, innerRadius, outerRadius, angleSpan);
    }

    const radialStep = (outerRadius - innerRadius) / rows;
    const ringRadii: number[] = [];
    for (let k = 0; k < rows; k++) ringRadii.push(innerRadius + radialStep * (k + 0.5));

    const weights = ringRadii.map(r => r * Math.abs(angleSpan));
    const weightSum = weights.reduce((a, b) => a + b, 0) || 1;
    const seatsPerRing = largestRemainder(weights.map(w => (w / weightSum) * totalSeats), totalSeats);

    const userRadius = this.config.marker?.radius;
    let seatRadius = userRadius ?? (radialStep / 2) * (1 - itemPadding);
    if (userRadius == null) {
      for (let k = 0; k < rows; k++) {
        const n = seatsPerRing[k];
        if (n <= 0) continue;
        const chord = 2 * ringRadii[k] * Math.sin(Math.abs(angleSpan) / (2 * n));
        seatRadius = Math.min(seatRadius, (chord / 2) * (1 - itemPadding));
      }
    }
    seatRadius = Math.max(seatRadius, 0.5);

    const seats: Seat[] = [];
    for (let k = 0; k < rows; k++) {
      const n = seatsPerRing[k];
      const r = ringRadii[k];
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0.5 : (i + 0.5) / n;
        const angle = startAngle + t * angleSpan;
        seats.push({ x: cx + r * Math.sin(angle), y: cy - r * Math.cos(angle), angle, ring: k, catIndex: -1 });
      }
    }
    seats.sort((a, b) => a.angle - b.angle || a.ring - b.ring);

    return this.assignSeats(seats, cats, seatRadius, { x: cx, y: cy });
  }

  /**
   * Packs seats into a rectangular grid. `layout: 'vertical'` (the default)
   * fills column-by-column; `'horizontal'` fills row-by-row.
   */
  private layoutGrid(cats: Category[], totalSeats: number, plotArea: PlotArea): ItemLayout {
    const pad = 8;
    const w = Math.max(plotArea.width - pad * 2, 1);
    const h = Math.max(plotArea.height - pad * 2, 1);
    const itemPadding = this.config.itemPadding ?? 0.1;

    let rows = this.config.rows;
    if (!rows || rows < 1) rows = Math.max(1, Math.round(Math.sqrt(totalSeats * h / w)));
    const cols = Math.ceil(totalSeats / rows);
    const cellW = w / cols;
    const cellH = h / rows;
    const seatRadius = this.config.marker?.radius ?? Math.max((Math.min(cellW, cellH) / 2) * (1 - itemPadding), 0.5);

    const horizontal = this.config.layout === 'horizontal';
    const seats: Seat[] = [];
    for (let n = 0; n < totalSeats; n++) {
      const row = horizontal ? Math.floor(n / cols) : n % rows;
      const col = horizontal ? n % cols : Math.floor(n / rows);
      seats.push({ x: pad + cellW * (col + 0.5), y: pad + cellH * (row + 0.5), angle: 0, ring: row, catIndex: -1 });
    }

    return this.assignSeats(seats, cats, seatRadius, { x: plotArea.width / 2, y: plotArea.height / 2 });
  }

  /**
   * Walks the ordered seat list assigning each category its seats as a
   * contiguous block, and accumulates the mean seat position per category for
   * label placement.
   */
  private assignSeats(
    seats: Seat[],
    cats: Category[],
    radius: number,
    fallback: { x: number; y: number },
  ): ItemLayout {
    const acc = cats.map(() => ({ sx: 0, sy: 0, n: 0 }));
    let idx = 0;
    for (let ci = 0; ci < cats.length; ci++) {
      for (let c = 0; c < cats[ci].seats && idx < seats.length; c++, idx++) {
        seats[idx].catIndex = ci;
        acc[ci].sx += seats[idx].x;
        acc[ci].sy += seats[idx].y;
        acc[ci].n += 1;
      }
    }
    const centroids = acc.map(a => (a.n > 0 ? { x: a.sx / a.n, y: a.sy / a.n } : fallback));
    return { seats: seats.filter(s => s.catIndex >= 0), radius, centroids };
  }

  /**
   * Largest outer radius whose arc (between the two angles, around the given
   * center) stays within the plot bounds. Samples the angular span for its
   * sin/cos extremes, then solves each plot edge for the limiting radius.
   */
  private fitRadius(cx: number, cy: number, w: number, h: number, startAngle: number, endAngle: number): number {
    let sMin = Infinity, sMax = -Infinity, cMin = Infinity, cMax = -Infinity;
    const steps = 180;
    for (let i = 0; i <= steps; i++) {
      const a = startAngle + (endAngle - startAngle) * (i / steps);
      const s = Math.sin(a), c = Math.cos(a);
      if (s < sMin) sMin = s; if (s > sMax) sMax = s;
      if (c < cMin) cMin = c; if (c > cMax) cMax = c;
    }
    const bounds: number[] = [];
    if (sMax > 1e-6) bounds.push((w - cx) / sMax);   // right edge:  x = cx + s*r
    if (sMin < -1e-6) bounds.push(cx / -sMin);        // left edge
    if (cMax > 1e-6) bounds.push(cy / cMax);          // top edge:   y = cy - c*r
    if (cMin < -1e-6) bounds.push((h - cy) / -cMin);  // bottom edge
    return bounds.length ? Math.max(0, Math.min(...bounds)) : Math.min(w, h) / 2;
  }

  /**
   * Closed-form estimate for the number of rings that hold `total` touching
   * seats across the given annulus and angular span.
   */
  private estimateRows(total: number, inner: number, outer: number, angleSpan: number): number {
    const denom = Math.abs(angleSpan) * (inner + outer);
    if (denom <= 0) return 1;
    const r = Math.round(Math.sqrt((total * 2 * (outer - inner)) / denom));
    return Math.max(1, r);
  }

  private renderSeats(cats: Category[], layout: ItemLayout): void {
    const self = this;
    const animate = this.context.animate;
    const borderColor = this.config.borderColor || this.autoBorderColor();
    const borderWidth = this.config.borderWidth ?? 1;

    const sel = this.group.selectAll<SVGCircleElement, Seat>('.katucharts-item-point')
      .data(layout.seats)
      .join('circle')
      .attr('class', 'katucharts-item-point')
      .attr('cx', d => d.x)
      .attr('cy', d => d.y)
      .attr('fill', d => cats[d.catIndex].color)
      .attr('stroke', borderColor)
      .attr('stroke-width', borderWidth)
      .style('cursor', this.config.cursor || 'default');

    if (animate) {
      sel.attr('r', 0)
        .transition()
        .duration(ENTRY_DURATION)
        .delay((_d, i) => ENTRY_DELAY_BASE + staggerDelay(i, 0, ENTRY_STAGGER_PER_ITEM, layout.seats.length))
        .ease(EASE_ENTRY)
        .attr('r', layout.radius);
    } else {
      sel.attr('r', layout.radius);
    }

    if (this.config.enableMouseTracking !== false) {
      const hoverR = layout.radius + 2;
      const inactiveOpacity = this.config.states?.inactive?.opacity ?? 0.25;
      const grouped = this.isGrouped();
      /** Seats that should stay highlighted with the hovered one: same group when grouped, else the same category. */
      const sameBlock = (a: Seat, b: Seat) =>
        grouped ? cats[a.catIndex].group === cats[b.catIndex].group : a.catIndex === b.catIndex;
      sel
        .on('mouseover', function (event: MouseEvent, d: Seat) {
          select(this).transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER).attr('r', hoverR);
          sel.interrupt('fade');
          sel.filter((s: Seat) => !sameBlock(s, d))
            .transition('fade').duration(HOVER_DURATION).ease(EASE_HOVER).attr('opacity', inactiveOpacity);
          sel.filter((s: Seat) => sameBlock(s, d))
            .transition('fade').duration(HOVER_DURATION).ease(EASE_HOVER).attr('opacity', 1);
          const cat = cats[d.catIndex];
          self.context.events.emit('point:mouseover', { point: cat.point, index: cat.dataIndex, series: self, event, plotX: d.x, plotY: d.y });
          cat.point.events?.mouseOver?.call(cat.point, event);
          self.config.point?.events?.mouseOver?.call(cat.point, event);
        })
        .on('mouseout', function (event: MouseEvent, d: Seat) {
          select(this).transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER).attr('r', layout.radius);
          sel.interrupt('fade');
          sel.transition('fade').duration(HOVER_DURATION).ease(EASE_HOVER).attr('opacity', 1);
          const cat = cats[d.catIndex];
          self.context.events.emit('point:mouseout', { point: cat.point, index: cat.dataIndex, series: self, event });
          cat.point.events?.mouseOut?.call(cat.point, event);
        })
        .on('click', function (event: MouseEvent, d: Seat) {
          const cat = cats[d.catIndex];
          self.context.events.emit('point:click', { point: cat.point, index: cat.dataIndex, series: self, event });
          cat.point.events?.click?.call(cat.point, event);
          self.config.point?.events?.click?.call(cat.point, event);
          self.config.events?.click?.call(self, event);
        });
    }
  }

  /**
   * One label per category, centred on that category's mean seat position.
   * Honours `format`/`formatter`; defaults to the point's label, name or value.
   */
  private renderItemLabels(cats: Category[], layout: ItemLayout): void {
    const dl = this.config.dataLabels as DataLabelOptions | undefined;
    if (!dl || !dl.enabled) return;

    const g = this.group.append('g').attr('class', 'katucharts-item-labels');
    const fontSize = (dl.style?.fontSize as string) || DEFAULT_CHART_TEXT_SIZE;

    cats.forEach((cat, i) => {
      const c = layout.centroids[i];
      if (!c) return;
      const d = cat.point;

      let text: string;
      if (dl.formatter) {
        text = dl.formatter.call({ point: d, series: { name: this.config.name }, x: d.x, y: d.y });
      } else if (dl.format) {
        text = stripHtmlTags(templateFormat(dl.format, { point: d, series: { name: this.config.name }, x: d.x, y: d.y }));
      } else {
        text = (d as any).label || d.name || String(d.y);
      }

      const fill = (dl.color as string) || (dl.style?.color as string) || readableTextColor(cat.color);
      const label = g.append('text')
        .attr('x', c.x + (dl.x ?? 0))
        .attr('y', c.y + (dl.y ?? 0))
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('font-size', fontSize)
        .attr('font-weight', (dl.style?.fontWeight as string) || 'bold')
        .attr('fill', fill)
        .style('pointer-events', 'none')
        .text(text);

      const ol = this.labelOutline(dl.style?.textOutline as string | false | undefined, fill);
      if (ol) {
        label.attr('stroke', ol.color)
          .attr('stroke-width', ol.width)
          .attr('paint-order', 'stroke')
          .style('stroke-linejoin', 'round');
      }
    });
  }

  /**
   * Outline for seat labels, drawn as an SVG stroke behind the fill (the same
   * technique the conventional `textOutline` uses) so it stays crisp. Labels sit
   * on colored seats, so by default a 3px halo in the text's contrasting color
   * (via the shared autocontrast util) is applied — readable on any seat without
   * configuration. Honors a user `textOutline`: `false`/`'none'` disables it, and
   * the `'<n>px contrast'` / `'<n>px <color>'` form sets the width and color.
   */
  private labelOutline(outline: string | false | undefined, fill: string): { width: number; color: string } | null {
    if (outline === false || outline === 'none' || outline === '0') return null;
    const contrast = readableTextColor(fill);
    if (outline == null) return { width: 3, color: contrast };
    const m = /^([\d.]+)px\s+(.+)$/.exec(outline.trim());
    if (m) return { width: parseFloat(m[1]), color: /contrast/i.test(m[2]) ? contrast : m[2].trim() };
    return { width: 3, color: contrast };
  }
}

/**
 * Classroom chart: an item series pre-configured as a bottom-anchored hemicycle
 * of seats. Defaults match the conventional seat-distribution look and are only
 * applied when the user hasn't set them explicitly.
 */
export class ClassroomChart extends ItemChart {
  constructor(config: InternalSeriesConfig) {
    if (config.startAngle === undefined) config.startAngle = -100;
    if (config.endAngle === undefined) config.endAngle = 100;
    if (config.center === undefined) config.center = ['50%', '82%'];
    if (config.innerSize === undefined) config.innerSize = '40%';
    super(config);
  }
}

/**
 * Largest-remainder (Hamilton) apportionment: rounds the fractional `values` to
 * integers whose sum is exactly `total`, giving the leftover units to the
 * entries with the largest fractional parts.
 */
function largestRemainder(values: number[], total: number): number[] {
  const floors = values.map(v => Math.floor(v));
  let used = floors.reduce((a, b) => a + b, 0);
  const order = values
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  let k = 0;
  while (used < total && order.length > 0) {
    floors[order[k % order.length].i] += 1;
    used += 1;
    k += 1;
  }
  return floors;
}

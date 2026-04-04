import { select } from 'd3-selection';
import { color as d3Color, rgb } from 'd3-color';
import 'd3-transition';
import { BaseSeries } from '../BaseSeries';
import type { InternalSeriesConfig, DashStyleType } from '../../types/options';

interface CircleLayout {
  id: string;
  cx: number;
  cy: number;
  r: number;
  color: string;
}

interface VennRegion {
  sets: string[];
  value: number;
  name: string;
  color: string;
  path: string;
  labelX: number;
  labelY: number;
  data: any;
}

const DASH_MAP: Record<string, string> = {
  Solid: 'none',
  ShortDash: '6,2',
  ShortDot: '2,2',
  ShortDashDot: '6,2,2,2',
  Dot: '2,6',
  Dash: '8,6',
  LongDash: '16,6',
  DashDot: '8,6,2,6',
  LongDashDot: '16,6,2,6',
  LongDashDotDot: '16,6,2,6,2,6',
};

export class VennSeries extends BaseSeries {
  private selectedIndices: Set<number> = new Set();

  constructor(config: InternalSeriesConfig) {
    super(config);
    config.showInLegend = false;
    config.clip = false;
  }

  render(): void {
    const { plotArea, colors } = this.context;
    const animate = this.context.animate;
    const data = this.data as any[];

    const singles = data.filter(d => d.sets?.length === 1);
    const intersections = data.filter(d => d.sets?.length >= 2);

    if (singles.length === 0) return;

    const cx = plotArea.width / 2;
    const cy = plotArea.height / 2;
    const maxR = plotArea.height / 2 * 0.92;
    const maxVal = Math.max(...singles.map((s: any) => s.value || s.y || 1));

    const baseOpacity = this.config.opacity ?? 0.75;
    const interOpacity = baseOpacity;
    const borderColor = this.config.borderColor;
    const borderWidth = this.config.borderWidth ?? 0;
    const borderDash = this.resolveDashStyle((this.config as any).borderDashStyle);
    const inactiveOpacity = this.config.states?.inactive?.opacity ?? 0.12;
    const hoverBrightness = this.config.states?.hover?.brightness ?? 0.2;
    const allowSelect = this.config.allowPointSelect === true;

    const circleMap = new Map<string, CircleLayout>();
    this.layoutSets(singles, intersections, circleMap, cx, cy, maxR, maxVal, colors, plotArea);

    const circles = Array.from(circleMap.values());

    const regions: VennRegion[] = [];

    const allCircles = Array.from(circleMap.values());
    for (const s of singles) {
      const c = circleMap.get(s.sets[0]);
      if (!c) continue;
      let lx = c.cx, ly = c.cy;
      const others = allCircles.filter(o => o.id !== c.id);
      if (others.length > 0) {
        let pushX = 0, pushY = 0;
        for (const o of others) {
          const dx = c.cx - o.cx;
          const dy = c.cy - o.cy;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          pushX += dx / dist;
          pushY += dy / dist;
        }
        const pLen = Math.sqrt(pushX * pushX + pushY * pushY) || 1;
        lx = c.cx + (pushX / pLen) * c.r * 0.35;
        ly = c.cy + (pushY / pLen) * c.r * 0.35;
      }
      regions.push({
        sets: s.sets,
        value: s.value || s.y || 0,
        name: s.name || s.sets[0],
        color: s.color || c.color,
        path: this.circlePath(c.cx, c.cy, c.r),
        labelX: lx,
        labelY: ly,
        data: s,
      });
    }

    for (const inter of intersections) {
      if (inter.sets.length === 2) {
        const c1 = circleMap.get(inter.sets[0]);
        const c2 = circleMap.get(inter.sets[1]);
        if (!c1 || !c2) continue;

        const lens = this.lensPath(c1, c2);
        if (!lens) continue;

        const blended = inter.color || this.blendColors(c1.color, c2.color);
        regions.push({
          sets: inter.sets,
          value: inter.value || inter.y || 0,
          name: inter.name || `${inter.sets.join(' \u2229 ')} (${inter.value || inter.y || 0})`,
          color: blended,
          path: lens.path,
          labelX: lens.cx,
          labelY: lens.cy,
          data: inter,
        });
      } else if (inter.sets.length === 3) {
        const cs = inter.sets.map((s: string) => circleMap.get(s)).filter(Boolean) as CircleLayout[];
        if (cs.length < 3) continue;

        const triPath = this.triIntersectionPath(cs[0], cs[1], cs[2]);
        if (!triPath) continue;

        const blended = inter.color || this.blendColors(cs[0].color, cs[1].color, cs[2].color);
        regions.push({
          sets: inter.sets,
          value: inter.value || inter.y || 0,
          name: inter.name || `${inter.sets.join(' \u2229 ')} (${inter.value || inter.y || 0})`,
          color: blended,
          path: triPath.path,
          labelX: triPath.cx,
          labelY: triPath.cy,
          data: inter,
        });
      }
    }

    const a11yCfg = (this.config as any).accessibility?.point || {};
    const a11yDescFmt = a11yCfg.descriptionFormatter;

    const circleEls = this.group.selectAll('.katucharts-venn-circle')
      .data(circles)
      .join('circle')
      .attr('class', 'katucharts-venn-circle')
      .attr('cx', (d: CircleLayout) => d.cx)
      .attr('cy', (d: CircleLayout) => d.cy)
      .attr('fill', (d: CircleLayout) => d.color)
      .attr('fill-opacity', baseOpacity)
      .attr('stroke', (d: CircleLayout) => borderColor || d.color)
      .attr('stroke-width', borderWidth)
      .attr('stroke-dasharray', borderDash)
      .attr('role', 'img')
      .attr('aria-label', (d: CircleLayout) => {
        const region = regions.find(r => r.sets.length === 1 && r.sets[0] === d.id);
        if (a11yDescFmt && region) {
          return a11yDescFmt({ name: region.name, value: region.value, sets: region.sets });
        }
        return region ? `${region.name}: ${region.value}` : d.id;
      })
      .style('pointer-events', 'none');

    if (animate) {
      circleEls.attr('r', 0)
        .transition().duration(800).delay((_: any, i: number) => i * 120)
        .attr('r', (d: CircleLayout) => d.r);
    } else {
      circleEls.attr('r', (d: CircleLayout) => d.r);
    }

    const circleOverlays: any[] = [];
    for (let i = 0; i < circles.length; i++) {
      const c = circles[i];
      const region = regions.find(r => r.sets.length === 1 && r.sets[0] === c.id);
      if (!region) continue;

      const overlay = this.group.append('circle')
        .attr('class', 'katucharts-venn-hover-target')
        .attr('cx', c.cx).attr('cy', c.cy).attr('r', c.r)
        .attr('fill', 'transparent')
        .style('cursor', this.config.cursor || 'pointer');

      circleOverlays.push({ overlay, region, idx: i });
    }

    const interRegions = regions.filter(r => r.sets.length >= 2);
    const interPaths = this.group.selectAll('.katucharts-venn-intersection')
      .data(interRegions)
      .join('path')
      .attr('class', 'katucharts-venn-intersection')
      .attr('d', (d: VennRegion) => d.path)
      .attr('fill', (d: VennRegion) => d.color)
      .attr('fill-opacity', interOpacity)
      .attr('stroke', 'none')
      .style('cursor', this.config.cursor || 'pointer');

    if (animate) {
      interPaths.attr('fill-opacity', 0)
        .transition().duration(500).delay(700)
        .attr('fill-opacity', interOpacity);
    }

    if (this.config.enableMouseTracking !== false) {
      for (const { overlay, region, idx } of circleOverlays) {
        this.attachRegionHover(overlay, region, idx, circleEls, interPaths, circles, regions,
          baseOpacity, interOpacity, inactiveOpacity, hoverBrightness, allowSelect);
      }

      interPaths.each((d: VennRegion, idx: number, nodes: any) => {
        const el = select(nodes[idx]);
        this.attachRegionHover(el as any, d, singles.length + idx, circleEls, interPaths, circles, regions,
          baseOpacity, interOpacity, inactiveOpacity, hoverBrightness, allowSelect);
      });
    }

    this.renderLabels(regions, circleMap, plotArea, baseOpacity, interOpacity, animate ?? false);
  }

  private resolveDashStyle(style?: DashStyleType): string {
    if (!style) return 'none';
    return DASH_MAP[style] || 'none';
  }

  private attachRegionHover(
    el: any, region: VennRegion, idx: number,
    circleEls: any, interPaths: any,
    circles: CircleLayout[], regions: VennRegion[],
    baseOpacity: number, interOpacity: number,
    inactiveOpacity: number, hoverBrightness: number,
    allowSelect: boolean
  ): void {
    const isIntersection = region.sets.length >= 2;
    const allHoverTargets = this.group.selectAll('.katucharts-venn-hover-target');

    const interLabels = this.group.selectAll('.katucharts-venn-inter-label');
    const alwaysShowInterLabels = ((this.config as any).dataLabels?.intersections?.enabled === true);

    el.on('mouseover', (event: MouseEvent) => {
      circleEls.transition('hover').duration(150)
        .attr('fill-opacity', inactiveOpacity).attr('stroke-opacity', 0.3);
      interPaths.transition('hover').duration(150)
        .attr('fill-opacity', inactiveOpacity);
      allHoverTargets.each(function() {
        (this as SVGElement).style.pointerEvents = 'none';
      });
      el.node().style.pointerEvents = 'auto';

      if (isIntersection) {
        const target = select(event.currentTarget as SVGElement);
        target.transition('hover').duration(150).attr('fill-opacity', 0.7);
        if (!alwaysShowInterLabels) {
          interLabels.filter((d: any) =>
            d.sets.length === region.sets.length && d.sets.every((s: string) => region.sets.includes(s))
          ).transition('label').duration(150).attr('opacity', 1);
        }
      } else {
        const c = circles.find(c => c.id === region.sets[0]);
        if (c) {
          circleEls.filter((d: CircleLayout) => d.id === c.id)
            .transition('hover').duration(150)
            .attr('fill-opacity', baseOpacity).attr('stroke-opacity', 1);
        }
      }

      this.context.events.emit('point:mouseover', {
        point: { name: region.name, y: region.value, value: region.value, sets: region.sets },
        index: idx, series: this, event,
        plotX: region.labelX, plotY: region.labelY,
      });
      region.data?.events?.mouseOver?.call(region.data, event);
    })
    .on('mouseout', (event: MouseEvent) => {
      circleEls.transition('hover').duration(150)
        .attr('fill', (d: CircleLayout) => d.color)
        .attr('fill-opacity', baseOpacity).attr('stroke-opacity', 1);
      interPaths.transition('hover').duration(150)
        .attr('fill-opacity', interOpacity);
      allHoverTargets.each(function() {
        (this as SVGElement).style.pointerEvents = '';
      });
      if (!alwaysShowInterLabels) {
        interLabels.transition('label').duration(150).attr('opacity', 0);
      }

      this.context.events.emit('point:mouseout', {
        point: { name: region.name, y: region.value, value: region.value, sets: region.sets },
        index: idx, series: this, event,
      });
      region.data?.events?.mouseOut?.call(region.data, event);
    })
    .on('click', (event: MouseEvent) => {
      if (allowSelect) {
        const wasSelected = this.selectedIndices.has(idx);
        if (wasSelected) {
          this.selectedIndices.delete(idx);
          region.data?.events?.unselect?.call(region.data, event);
        } else {
          this.selectedIndices.add(idx);
          region.data?.events?.select?.call(region.data, event);
        }
      }

      this.context.events.emit('point:click', {
        point: { name: region.name, y: region.value, value: region.value, sets: region.sets },
        index: idx, series: this, event,
      });
      region.data?.events?.click?.call(region.data, event);
      this.config.events?.click?.call(this, event);
      const pointClick = (this.config as any).point?.events?.click;
      if (pointClick) {
        pointClick.call(
          { ...region.data, sets: region.sets, name: region.name, value: region.value },
          event
        );
      }
    });
  }

  private renderLabels(
    regions: VennRegion[], circleMap: Map<string, CircleLayout>,
    plotArea: any, baseOpacity: number, interOpacity: number, animate: boolean
  ): void {
    const dlCfg = (this.config as any).dataLabels || {};
    const showSetLabels = dlCfg.enabled !== false;
    const showIntersectionLabels = dlCfg.intersections?.enabled === true;
    const dlFontSize = (dlCfg.style?.fontSize as string) || '14px';
    const dlColor = dlCfg.color || (dlCfg.style?.color as string) || '#333';
    const dlFontWeight = (dlCfg.style?.fontWeight as string) || 'bold';

    const setRegions = regions.filter(r => r.sets.length === 1);
    const interLabelRegions = regions.filter(r => r.sets.length >= 2);

    if (showSetLabels) {
      const circleLabels = this.group.selectAll('.katucharts-venn-set-label')
        .data(setRegions)
        .join('text')
        .attr('class', 'katucharts-venn-set-label')
        .attr('x', (d: VennRegion) => d.labelX)
        .attr('y', (d: VennRegion) => d.labelY)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('font-size', dlFontSize)
        .attr('font-weight', dlFontWeight)
        .attr('fill', dlColor)
        .style('pointer-events', 'none')
        .style('text-shadow', '0 0 4px #fff, 0 0 4px #fff')
        .text((d: VennRegion) => {
          if (dlCfg.formatter) {
            return dlCfg.formatter.call({
              point: { name: d.name, y: d.value, sets: d.sets },
              series: { name: this.config.name },
              x: d.name, y: d.value,
            });
          }
          return d.name;
        });

      if (animate) {
        circleLabels.attr('opacity', 0)
          .transition().duration(400).delay(900)
          .attr('opacity', 1);
      }

    }

    const interLabels = this.group.selectAll('.katucharts-venn-inter-label')
      .data(interLabelRegions)
      .join('text')
      .attr('class', 'katucharts-venn-inter-label')
      .attr('x', (d: VennRegion) => d.labelX)
      .attr('y', (d: VennRegion) => d.labelY)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', '10px')
      .attr('fill', '#555')
      .style('pointer-events', 'none')
      .style('text-shadow', '0 0 3px #fff, 0 0 3px #fff')
      .attr('opacity', showIntersectionLabels ? 1 : 0)
      .text((d: VennRegion) => d.name);
  }

  private layoutSets(
    singles: any[], intersections: any[],
    map: Map<string, CircleLayout>, centerX: number, centerY: number,
    maxR: number, maxVal: number, colors: string[],
    plotArea?: { width: number; height: number }
  ): void {
    const n = singles.length;
    const ids = singles.map((s: any) => s.sets[0] as string);
    const radii = singles.map((s: any) =>
      maxR * Math.sqrt((s.value || s.y || 1) / maxVal)
    );

    const targetDist = new Map<string, number>();
    for (const inter of intersections) {
      if (inter.sets?.length !== 2) continue;
      const [a, b] = inter.sets as string[];
      const ai = ids.indexOf(a), bi = ids.indexOf(b);
      if (ai < 0 || bi < 0) continue;
      const interVal = inter.value || inter.y || 0;
      if (interVal <= 0) {
        targetDist.set(`${ai}-${bi}`, radii[ai] + radii[bi] + 5);
      } else {
        const area = Math.PI * (maxR * Math.sqrt(interVal / maxVal)) ** 2 * (interVal / maxVal);
        targetDist.set(`${ai}-${bi}`, this.findDistance(radii[ai], radii[bi], area));
      }
    }

    const pos: [number, number][] = new Array(n);
    const placed = new Set<number>();

    const weight = new Array(n).fill(0);
    for (const inter of intersections) {
      if (inter.sets?.length !== 2) continue;
      const val = inter.value || inter.y || 0;
      for (const s of inter.sets) {
        const idx = ids.indexOf(s);
        if (idx >= 0) weight[idx] += val;
      }
    }
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => weight[b] - weight[a]);

    pos[order[0]] = [0, 0];
    placed.add(order[0]);

    for (let oi = 1; oi < n; oi++) {
      const idx = order[oi];
      let bestPos: [number, number] = [0, 0];
      let bestLoss = Infinity;

      const candidates: [number, number][] = [];
      for (const pi of placed) {
        const key = pi < idx ? `${pi}-${idx}` : `${idx}-${pi}`;
        const d = targetDist.get(key) ?? (radii[pi] + radii[idx]) * 1.1;
        const [px, py] = pos[pi];
        for (let a = 0; a < 12; a++) {
          const angle = (2 * Math.PI * a) / 12;
          candidates.push([px + d * Math.cos(angle), py + d * Math.sin(angle)]);
        }
      }

      for (const [cx, cy] of candidates) {
        let loss = 0;
        for (const pi of placed) {
          const key = pi < idx ? `${pi}-${idx}` : `${idx}-${pi}`;
          const td = targetDist.get(key) ?? (radii[pi] + radii[idx]) * 1.1;
          const actual = Math.sqrt((cx - pos[pi][0]) ** 2 + (cy - pos[pi][1]) ** 2);
          loss += (actual - td) ** 2;
        }
        if (loss < bestLoss) {
          bestLoss = loss;
          bestPos = [cx, cy];
        }
      }
      pos[idx] = bestPos;
      placed.add(idx);
    }

    if (n >= 3) {
      this.optimizePositions(pos, radii, targetDist, n);
    }

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      minX = Math.min(minX, pos[i][0] - radii[i]);
      maxX = Math.max(maxX, pos[i][0] + radii[i]);
      minY = Math.min(minY, pos[i][1] - radii[i]);
      maxY = Math.max(maxY, pos[i][1] + radii[i]);
    }
    const bw = maxX - minX || 1;
    const bh = maxY - minY || 1;
    const availW = plotArea ? plotArea.width * 0.95 : maxR * 2;
    const availH = plotArea ? plotArea.height * 0.95 : maxR * 2;
    const scale = Math.min(availW / bw, availH / bh);
    const bcx = (minX + maxX) / 2;
    const bcy = (minY + maxY) / 2;

    for (let i = 0; i < n; i++) {
      const x = centerX + (pos[i][0] - bcx) * scale;
      const y = centerY + (pos[i][1] - bcy) * scale;
      const r = radii[i] * scale;
      map.set(ids[i], {
        id: ids[i], cx: x, cy: y, r,
        color: singles[i].color || colors[i % colors.length],
      });
    }
  }

  private optimizePositions(
    pos: [number, number][], radii: number[],
    targetDist: Map<string, number>, n: number
  ): void {
    const loss = (p: number[]): number => {
      let total = 0;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const key = `${i}-${j}`;
          const td = targetDist.get(key) ?? (radii[i] + radii[j]) * 1.1;
          const dx = p[i * 2] - p[j * 2];
          const dy = p[i * 2 + 1] - p[j * 2 + 1];
          const actual = Math.sqrt(dx * dx + dy * dy);
          total += (actual - td) ** 2;
        }
      }
      return total;
    };

    const flat = new Array(n * 2);
    for (let i = 0; i < n; i++) { flat[i * 2] = pos[i][0]; flat[i * 2 + 1] = pos[i][1]; }

    const dim = n * 2;
    const simplex: number[][] = [flat.slice()];
    for (let i = 0; i < dim; i++) {
      const p = flat.slice();
      p[i] += radii[Math.floor(i / 2)] * 0.3;
      simplex.push(p);
    }
    const values = simplex.map(s => loss(s));

    for (let iter = 0; iter < 200; iter++) {
      let lo = 0, hi = 0;
      for (let i = 1; i <= dim; i++) {
        if (values[i] < values[lo]) lo = i;
        if (values[i] > values[hi]) hi = i;
      }
      if (values[hi] - values[lo] < 0.01) break;

      const centroid = new Array(dim).fill(0);
      for (let i = 0; i <= dim; i++) {
        if (i === hi) continue;
        for (let d = 0; d < dim; d++) centroid[d] += simplex[i][d];
      }
      for (let d = 0; d < dim; d++) centroid[d] /= dim;

      const reflected = centroid.map((c, d) => 2 * c - simplex[hi][d]);
      const fr = loss(reflected);

      if (fr < values[lo]) {
        const expanded = centroid.map((c, d) => 3 * c - 2 * simplex[hi][d]);
        const fe = loss(expanded);
        if (fe < fr) { simplex[hi] = expanded; values[hi] = fe; }
        else { simplex[hi] = reflected; values[hi] = fr; }
      } else if (fr < values[hi]) {
        simplex[hi] = reflected; values[hi] = fr;
      } else {
        const contracted = centroid.map((c, d) => 0.5 * (c + simplex[hi][d]));
        const fc = loss(contracted);
        if (fc < values[hi]) { simplex[hi] = contracted; values[hi] = fc; }
        else {
          for (let i = 0; i <= dim; i++) {
            if (i === lo) continue;
            for (let d = 0; d < dim; d++) {
              simplex[i][d] = 0.5 * (simplex[lo][d] + simplex[i][d]);
            }
            values[i] = loss(simplex[i]);
          }
        }
      }
    }

    let best = 0;
    for (let i = 1; i <= dim; i++) { if (values[i] < values[best]) best = i; }
    const result = simplex[best];
    for (let i = 0; i < n; i++) {
      pos[i] = [result[i * 2], result[i * 2 + 1]];
    }
  }

  private circlePath(cx: number, cy: number, r: number): string {
    return `M${cx - r},${cy}A${r},${r},0,1,1,${cx + r},${cy}A${r},${r},0,1,1,${cx - r},${cy}Z`;
  }

  private lensPath(c1: CircleLayout, c2: CircleLayout): { path: string; cx: number; cy: number } | null {
    const dx = c2.cx - c1.cx;
    const dy = c2.cy - c1.cy;
    const d = Math.sqrt(dx * dx + dy * dy);

    if (d >= c1.r + c2.r || d <= Math.abs(c1.r - c2.r)) return null;

    const a = (c1.r * c1.r - c2.r * c2.r + d * d) / (2 * d);
    const h = Math.sqrt(c1.r * c1.r - a * a);

    const mx = c1.cx + a * dx / d;
    const my = c1.cy + a * dy / d;

    const px1 = mx + h * dy / d;
    const py1 = my - h * dx / d;
    const px2 = mx - h * dy / d;
    const py2 = my + h * dx / d;

    const largeArc1 = a > c1.r ? 1 : 0;
    const largeArc2 = (d - a) > c2.r ? 1 : 0;

    const path = `M${px1},${py1}`
      + `A${c1.r},${c1.r},0,${largeArc1},1,${px2},${py2}`
      + `A${c2.r},${c2.r},0,${largeArc2},1,${px1},${py1}Z`;

    return { path, cx: (c1.cx + c2.cx) / 2, cy: (c1.cy + c2.cy) / 2 };
  }

  private triIntersectionPath(
    c1: CircleLayout, c2: CircleLayout, c3: CircleLayout
  ): { path: string; cx: number; cy: number } | null {
    const pts12 = this.circleIntersectionPoints(c1, c2);
    const pts13 = this.circleIntersectionPoints(c1, c3);
    const pts23 = this.circleIntersectionPoints(c2, c3);

    if (!pts12 || !pts13 || !pts23) return null;

    const candidates = [...pts12, ...pts13, ...pts23];
    const inside = candidates.filter(p =>
      this.insideCircle(p, c1) && this.insideCircle(p, c2) && this.insideCircle(p, c3)
    );

    if (inside.length < 3) return null;

    const centX = inside.reduce((s, p) => s + p[0], 0) / inside.length;
    const centY = inside.reduce((s, p) => s + p[1], 0) / inside.length;
    inside.sort((a, b) => Math.atan2(a[1] - centY, a[0] - centX) - Math.atan2(b[1] - centY, b[0] - centX));

    let path = `M${inside[0][0]},${inside[0][1]}`;
    for (let i = 0; i < inside.length; i++) {
      const p1 = inside[i];
      const p2 = inside[(i + 1) % inside.length];
      const arc = this.findArcCircle(p1, p2, [c1, c2, c3]);
      if (arc) {
        path += `A${arc.r},${arc.r},0,0,1,${p2[0]},${p2[1]}`;
      } else {
        path += `L${p2[0]},${p2[1]}`;
      }
    }
    path += 'Z';

    return { path, cx: centX, cy: centY };
  }

  private circleIntersectionPoints(c1: CircleLayout, c2: CircleLayout): [number, number][] | null {
    const dx = c2.cx - c1.cx;
    const dy = c2.cy - c1.cy;
    const d = Math.sqrt(dx * dx + dy * dy);

    if (d >= c1.r + c2.r || d <= Math.abs(c1.r - c2.r)) return null;

    const a = (c1.r * c1.r - c2.r * c2.r + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, c1.r * c1.r - a * a));

    const mx = c1.cx + a * dx / d;
    const my = c1.cy + a * dy / d;

    return [
      [mx + h * dy / d, my - h * dx / d],
      [mx - h * dy / d, my + h * dx / d],
    ];
  }

  private insideCircle(p: [number, number], c: CircleLayout): boolean {
    const dx = p[0] - c.cx;
    const dy = p[1] - c.cy;
    return dx * dx + dy * dy <= (c.r + 0.5) * (c.r + 0.5);
  }

  private findArcCircle(
    p1: [number, number], p2: [number, number], circles: CircleLayout[]
  ): CircleLayout | null {
    const mx = (p1[0] + p2[0]) / 2;
    const my = (p1[1] + p2[1]) / 2;
    for (const c of circles) {
      const d1 = Math.sqrt((p1[0] - c.cx) ** 2 + (p1[1] - c.cy) ** 2);
      const d2 = Math.sqrt((p2[0] - c.cx) ** 2 + (p2[1] - c.cy) ** 2);
      const dm = Math.sqrt((mx - c.cx) ** 2 + (my - c.cy) ** 2);
      if (Math.abs(d1 - c.r) < 1 && Math.abs(d2 - c.r) < 1 && dm <= c.r + 1) {
        return c;
      }
    }
    return null;
  }

  private blendColors(...clrs: string[]): string {
    let r = 0, g = 0, b = 0;
    for (const c of clrs) {
      const parsed = rgb(d3Color(c) as any || c);
      r += parsed.r; g += parsed.g; b += parsed.b;
    }
    const n = clrs.length;
    return rgb(r / n, g / n, b / n).formatHex();
  }

  private findDistance(r1: number, r2: number, targetArea: number): number {
    if (targetArea <= 0) return r1 + r2 + 10;
    const maxArea = Math.PI * Math.min(r1, r2) ** 2;
    if (targetArea >= maxArea) return Math.abs(r1 - r2);

    let lo = Math.abs(r1 - r2);
    let hi = r1 + r2;
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      if (this.lensArea(r1, r2, mid) > targetArea) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }

  private lensArea(r1: number, r2: number, d: number): number {
    if (d >= r1 + r2) return 0;
    if (d <= Math.abs(r1 - r2)) return Math.PI * Math.min(r1, r2) ** 2;
    const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
    const h2 = r1 * r1 - a * a;
    if (h2 < 0) return 0;
    return r1 * r1 * Math.acos(a / r1) - a * Math.sqrt(h2)
      + r2 * r2 * Math.acos((d - a) / r2) - (d - a) * Math.sqrt(r2 * r2 - (d - a) * (d - a));
  }

  getDataExtents() {
    return { xMin: 0, xMax: 0, yMin: 0, yMax: 0 };
  }
}

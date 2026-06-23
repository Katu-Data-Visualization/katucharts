import { lineRadial, areaRadial, curveLinearClosed, curveLinear, arc as d3Arc } from 'd3-shape';
import { scaleLinear } from 'd3-scale';
import { select } from 'd3-selection';
import { format as d3Format } from 'd3-format';
import 'd3-transition';
import { BaseSeries } from '../BaseSeries';
import type { InternalSeriesConfig, PointOptions } from '../../types/options';
import { DEFAULT_CHART_TEXT_COLOR, DEFAULT_CHART_TEXT_SIZE } from '../../utils/chartText';
import {
  ENTRY_DURATION,
  ENTRY_STAGGER_PER_ITEM,
  HOVER_DURATION,
  EASE_ENTRY,
  EASE_HOVER,
} from '../../core/animationConstants';

const POLAR_TICK_SI = d3Format('~s');
function formatPolarTick(v: number): string {
  if (v === 0) return '0';
  return v >= 1000 ? POLAR_TICK_SI(v).replace('G', 'B') : String(v);
}

function formatPolarDataLabel(v: number): string {
  if (!Number.isFinite(v)) return String(v);
  if (Math.abs(v) < 1000) return String(v);
  const s = Math.round(v).toString();
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function computePolarNiceTicks(rawMax: number): { ticks: number[]; niceMax: number; gridMax: number } {
  if (rawMax <= 0) return { ticks: [1], niceMax: 1, gridMax: 1 };
  const rawStep = rawMax / 2;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const residual = rawStep / magnitude;
  let niceStep: number;
  if (residual < 1.5) niceStep = 1 * magnitude;
  else if (residual < 3) niceStep = 2 * magnitude;
  else if (residual < 7) niceStep = 5 * magnitude;
  else niceStep = 10 * magnitude;
  const niceMax = Math.max(niceStep, Math.floor(rawMax / niceStep) * niceStep);
  const gridMax = rawMax * 1.15;
  const ticks = niceMax > 0 ? [Math.round(niceMax * 1e6) / 1e6] : [];
  return { ticks, niceMax, gridMax };
}

function computePolarRadius(plotAreaW: number, plotAreaH: number, paneCfg: any): number {
  const paneSize = paneCfg?.size;
  let pct: number;
  if (typeof paneSize === 'string' && paneSize.trim().endsWith('%')) {
    pct = parseFloat(paneSize) / 100;
  } else if (typeof paneSize === 'number') {
    pct = paneSize > 1 ? paneSize / 100 : paneSize;
  } else {
    pct = 0.85;
  }
  const base = (Math.min(plotAreaW, plotAreaH) * pct) / 2;
  return Math.max(20, base - 30);
}

type PolarSubType = 'line' | 'area' | 'column';

export class PolarChart extends BaseSeries {
  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  render(): void {
    const subType = this.resolvePolarSubType();
    if (subType === 'column') {
      this.renderColumnPolar();
    } else {
      this.renderLineAreaPolar(subType);
    }
  }

  private resolvePolarSubType(): PolarSubType {
    const t = (this.config as any).polarType || (this.config as any)._polarSubType || 'area';
    if (t === 'column' || t === 'bar') return 'column';
    if (t === 'line') return 'line';
    return 'area';
  }

  private renderLineAreaPolar(subType: PolarSubType): void {
    const { plotArea } = this.context;
    const animate = this.context.animate;
    const data = this.data;
    const color = this.getColor();
    const paneCfg = (this.context as any).pane || (this.config as any).pane;
    const radius = computePolarRadius(plotArea.width, plotArea.height, paneCfg);
    const cx = plotArea.width / 2;
    const cy = plotArea.height / 2;

    const rawMax = Math.max(...data.map(d => d.y ?? 0), 1);
    const { ticks, gridMax } = computePolarNiceTicks(rawMax);
    const rScale = scaleLinear().domain([0, gridMax]).range([0, radius]);
    const markerRadius = this.config.marker?.radius ?? 4;
    const markerEnabled = this.config.marker?.enabled !== false;
    const pointPlacement = this.config.pointPlacement;
    const placementOffset = pointPlacement === 'on' ? 0
      : pointPlacement === 'between' ? (Math.PI / data.length)
      : (typeof pointPlacement === 'number' ? pointPlacement * Math.PI / 180 : 0);
    const angleStep = (2 * Math.PI) / data.length;
    const connectEnds = this.config.connectEnds !== false;
    const inactiveOpacity = this.config.states?.inactive?.opacity ?? 0.5;

    const g = this.group.append('g')
      .attr('transform', `translate(${cx},${cy})`);

    let minSpokeIdx = 0;
    let minSpokeVal = Infinity;
    for (let i = 0; i < data.length; i++) {
      const v = data[i].y ?? 0;
      if (v < minSpokeVal) { minSpokeVal = v; minSpokeIdx = i; }
    }
    const tickSpokeAngle = minSpokeIdx * angleStep - Math.PI / 2;
    this.renderGrid(g, radius, data.length, rScale, ticks, tickSpokeAngle);

    const curveType = connectEnds ? curveLinearClosed : curveLinear;
    const effectiveData = data;

    const lineGen = lineRadial<PointOptions>()
      .angle((_, i) => i * angleStep + placementOffset)
      .radius(d => rScale(d.y ?? 0))
      .defined(d => d.y !== null && d.y !== undefined)
      .curve(curveType);

    const zeroData = data.map(d => ({ ...d, y: 0 }));

    const linePath = g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', color)
      .attr('stroke-width', this.config.lineWidth ?? 2);

    if (subType === 'area') {
      const areaGen = areaRadial<PointOptions>()
        .angle((_, i) => i * angleStep + placementOffset)
        .innerRadius(0)
        .outerRadius(d => rScale(d.y ?? 0))
        .defined(d => d.y !== null && d.y !== undefined)
        .curve(curveType);

      const areaPath = g.append('path')
        .datum(data)
        .attr('fill', this.config.fillColor || color)
        .attr('fill-opacity', this.config.fillOpacity ?? 0.3);

      if (animate) {
        areaPath.attr('d', areaGen(zeroData) || '')
          .transition().duration(ENTRY_DURATION).ease(EASE_ENTRY)
          .attr('d', areaGen(data) || '');
      } else {
        areaPath.attr('d', areaGen as any);
      }
    }

    if (animate) {
      linePath.attr('d', lineGen(zeroData) || '')
        .transition().duration(ENTRY_DURATION).ease(EASE_ENTRY)
        .attr('d', lineGen(data) || '');
    } else {
      linePath.attr('d', lineGen as any);
    }

    if (markerEnabled) {
      const dataMaxForMarker = Math.max(...data.map(d => d.y ?? 0), 1);
      const minMarkerValue = dataMaxForMarker * 0.02;
      const points = g.selectAll('.katucharts-polar-point')
        .data(data)
        .join('circle')
        .attr('class', 'katucharts-polar-point')
        .attr('cx', (d, i) => rScale(d.y ?? 0) * Math.cos(i * angleStep - Math.PI / 2 + placementOffset))
        .attr('cy', (d, i) => rScale(d.y ?? 0) * Math.sin(i * angleStep - Math.PI / 2 + placementOffset))
        .attr('fill', this.config.marker?.fillColor || color)
        .attr('stroke', this.config.marker?.lineColor || this.autoBorderColor())
        .attr('stroke-width', this.config.marker?.lineWidth ?? 1)
        .style('display', (d: PointOptions) => (d.y ?? 0) < minMarkerValue ? 'none' : null)
        .style('cursor', this.config.cursor || 'pointer');

      if (animate) {
        points.attr('r', 0).attr('opacity', 0)
          .transition().duration(ENTRY_DURATION).ease(EASE_ENTRY)
          .delay((_: any, i: number) => i * ENTRY_STAGGER_PER_ITEM)
          .attr('r', markerRadius).attr('opacity', 1);
      } else {
        points.attr('r', markerRadius);
      }

      this.renderPolarDataLabels(g, data, rScale, angleStep, placementOffset);

      if (this.config.enableMouseTracking !== false) {
        const hoverRadius = this.config.marker?.states?.hover?.radius ?? markerRadius + 3;

        points
          .on('mouseover', (event: MouseEvent, d: PointOptions) => {
            const target = select(event.currentTarget as SVGCircleElement);
            target.transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER).attr('r', hoverRadius);
            target.style('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))');

            const i = data.indexOf(d);
            const px = rScale(d.y ?? 0) * Math.cos(i * angleStep - Math.PI / 2 + placementOffset);
            const py = rScale(d.y ?? 0) * Math.sin(i * angleStep - Math.PI / 2 + placementOffset);
            this.context.events.emit('point:mouseover', {
              point: d, index: i, series: this, event,
              plotX: cx + px, plotY: cy + py,
            });
            d.events?.mouseOver?.call(d, event);
          })
          .on('mouseout', (event: MouseEvent, d: PointOptions) => {
            const target = select(event.currentTarget as SVGCircleElement);
            target.transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER).attr('r', markerRadius);
            target.style('filter', '');

            const i = data.indexOf(d);
            this.context.events.emit('point:mouseout', { point: d, index: i, series: this, event });
            d.events?.mouseOut?.call(d, event);
          })
          .on('click', (event: MouseEvent, d: PointOptions) => {
            const i = data.indexOf(d);
            this.context.events.emit('point:click', { point: d, index: i, series: this, event });
            d.events?.click?.call(d, event);
            this.config.events?.click?.call(this, event);
          });
      }
    }
  }

  private renderColumnPolar(): void {
    const { plotArea, colors } = this.context;
    const animate = this.context.animate;
    const data = this.data;
    const color = this.getColor();
    const paneCfg = (this.context as any).pane || (this.config as any).pane;
    const radius = computePolarRadius(plotArea.width, plotArea.height, paneCfg);
    const cx = plotArea.width / 2;
    const cy = plotArea.height / 2;

    const rawMax = Math.max(...data.map(d => d.y ?? 0), 1);
    const { ticks, gridMax } = computePolarNiceTicks(rawMax);
    const rScale = scaleLinear().domain([0, gridMax]).range([0, radius]);
    const angleStep = (2 * Math.PI) / data.length;
    const pointPlacement = this.config.pointPlacement;
    const placementOffset = pointPlacement === 'on' ? 0
      : pointPlacement === 'between' ? (Math.PI / data.length)
      : (typeof pointPlacement === 'number' ? pointPlacement * Math.PI / 180 : 0);
    const padding = 0.02;
    const inactiveOpacity = this.config.states?.inactive?.opacity ?? 0.4;
    const colorByPoint = this.config.colorByPoint === true;
    const stacking = this.config.stacking;

    const g = this.group.append('g')
      .attr('transform', `translate(${cx},${cy})`);

    let minSpokeIdx = 0;
    let minSpokeVal = Infinity;
    for (let i = 0; i < data.length; i++) {
      const v = data[i].y ?? 0;
      if (v < minSpokeVal) { minSpokeVal = v; minSpokeIdx = i; }
    }
    const tickSpokeAngle = minSpokeIdx * angleStep - Math.PI / 2;
    this.renderGrid(g, radius, data.length, rScale, ticks, tickSpokeAngle);

    const arcGen = d3Arc<any>().cornerRadius(2);

    const bars = g.selectAll('.katucharts-polar-bar')
      .data(data)
      .join('path')
      .attr('class', 'katucharts-polar-bar')
      .attr('fill', (d: PointOptions, i: number) =>
        d.color || (colorByPoint ? colors[i % colors.length] : color)
      )
      .attr('stroke', this.config.borderColor || 'none')
      .attr('stroke-width', this.config.borderWidth ?? 0)
      .style('cursor', this.config.cursor || 'pointer');

    const stackOffsets = this.context.stackOffsets;

    if (animate) {
      bars.each(function(d: PointOptions, i: number) {
        const el = select(this);
        const startA = i * angleStep - Math.PI / 2 + placementOffset + padding;
        const endA = (i + 1) * angleStep - Math.PI / 2 + placementOffset - padding;
        const baseR = (stacking && stackOffsets) ? rScale(stackOffsets.get(i) ?? 0) : 0;
        const targetR = baseR + rScale(d.y ?? 0);

        el.attr('d', arcGen({ innerRadius: baseR, outerRadius: baseR, startAngle: startA + Math.PI / 2, endAngle: endA + Math.PI / 2 } as any) || '')
          .transition().duration(ENTRY_DURATION).ease(EASE_ENTRY).delay(i * ENTRY_STAGGER_PER_ITEM)
          .attrTween('d', () => {
            return (t: number) => arcGen({
              innerRadius: baseR,
              outerRadius: baseR + (targetR - baseR) * t,
              startAngle: startA + Math.PI / 2,
              endAngle: endA + Math.PI / 2,
            } as any) || '';
          });

        if (stacking && stackOffsets) {
          stackOffsets.set(i, (stackOffsets.get(i) ?? 0) + (d.y ?? 0));
        }
      });
    } else {
      bars.attr('d', (d: PointOptions, i: number) => {
        const startA = i * angleStep - Math.PI / 2 + placementOffset + padding;
        const endA = (i + 1) * angleStep - Math.PI / 2 + placementOffset - padding;
        const baseR = (stacking && stackOffsets) ? rScale(stackOffsets.get(i) ?? 0) : 0;
        const targetR = baseR + rScale(d.y ?? 0);

        if (stacking && stackOffsets) {
          stackOffsets.set(i, (stackOffsets.get(i) ?? 0) + (d.y ?? 0));
        }

        return arcGen({
          innerRadius: baseR,
          outerRadius: targetR,
          startAngle: startA + Math.PI / 2,
          endAngle: endA + Math.PI / 2,
        } as any) || '';
      });
    }

    if (this.config.enableMouseTracking !== false) {
      bars
        .on('mouseover', (event: MouseEvent, d: PointOptions) => {
          const target = select(event.currentTarget as SVGPathElement);
          target.style('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))');
          bars.interrupt('highlight');
          bars.attr('opacity', 1);
          bars.filter((o: any) => o !== d).transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER).attr('opacity', inactiveOpacity);

          const i = data.indexOf(d);
          const midAngle = i * angleStep + angleStep / 2 - Math.PI / 2 + placementOffset;
          const r = rScale(d.y ?? 0) / 2;
          this.context.events.emit('point:mouseover', {
            point: d, index: i, series: this, event,
            plotX: cx + r * Math.cos(midAngle), plotY: cy + r * Math.sin(midAngle),
          });
          d.events?.mouseOver?.call(d, event);
        })
        .on('mouseout', (event: MouseEvent, d: PointOptions) => {
          const target = select(event.currentTarget as SVGPathElement);
          target.style('filter', '');
          bars.interrupt('highlight');
          bars.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER).attr('opacity', 1);

          const i = data.indexOf(d);
          this.context.events.emit('point:mouseout', { point: d, index: i, series: this, event });
          d.events?.mouseOut?.call(d, event);
        })
        .on('click', (event: MouseEvent, d: PointOptions) => {
          const i = data.indexOf(d);
          this.context.events.emit('point:click', { point: d, index: i, series: this, event });
          d.events?.click?.call(d, event);
          this.config.events?.click?.call(this, event);
        });
    }
  }

  private renderPolarDataLabels(g: any, data: PointOptions[], rScale: any, angleStep: number, placementOffset: number): void {
    const dlCfg: any = this.config.dataLabels || {};
    if (dlCfg.enabled !== true) return;
    const fontSize = (dlCfg.style?.fontSize as string) || DEFAULT_CHART_TEXT_SIZE;
    const fontColor = (dlCfg.style?.color as string) || this.autoLabelColor();
    const fontWeight = (dlCfg.style?.fontWeight as string) || 'normal';
    const placed: { x: number; y: number }[] = [];
    const collisionRadius = 16;
    const labelPadding = 6;
    const dataMax = Math.max(...data.map(d => d.y ?? 0), 1);
    const minVisibleValue = dataMax * 0.02;
    const smallCutoff = dataMax * 0.5;

    const candidates = data
      .map((d, i) => ({ d, i, v: d.y ?? 0 }))
      .filter(o => o.d.y != null && o.d.y !== 0 && o.v >= minVisibleValue);
    const bigs = candidates.filter(c => c.v >= smallCutoff);
    const smalls = candidates.filter(c => c.v < smallCutoff);
    smalls.sort((a, b) => a.v - b.v);
    const smallRepresentative = smalls.length > 0 ? smalls[0] : null;
    const toRender = smallRepresentative ? [...bigs, smallRepresentative] : bigs;
    toRender.sort((a, b) => a.i - b.i);

    for (const { d, i } of toRender) {
      const angle = i * angleStep - Math.PI / 2 + placementOffset;
      const r = rScale(d.y ?? 0);
      const markerX = r * Math.cos(angle);
      const markerY = r * Math.sin(angle);
      const hcDeg = ((angle + Math.PI / 2) * 180 / Math.PI + 360) % 360;
      let textAnchor: string;
      if (hcDeg > 20 && hcDeg < 160) textAnchor = 'start';
      else if (hcDeg > 200 && hcDeg < 340) textAnchor = 'end';
      else textAnchor = 'middle';
      let baseline: string;
      if (hcDeg < 45 || hcDeg > 315) baseline = 'text-after-edge';
      else if (hcDeg > 135 && hcDeg < 225) baseline = 'text-before-edge';
      else baseline = 'middle';
      const nx = Math.cos(angle);
      const ny = Math.sin(angle);
      const x = markerX + nx * labelPadding;
      const y = markerY + ny * labelPadding;
      let collides = false;
      for (const p of placed) {
        if ((p.x - x) ** 2 + (p.y - y) ** 2 < collisionRadius * collisionRadius) { collides = true; break; }
      }
      if (collides) continue;
      placed.push({ x, y });
      g.append('text')
        .attr('class', 'katucharts-polar-datalabel')
        .attr('x', x)
        .attr('y', y)
        .attr('text-anchor', textAnchor)
        .attr('dominant-baseline', baseline)
        .attr('fill', fontColor)
        .attr('font-size', fontSize)
        .attr('font-weight', fontWeight)
        .attr('stroke', this.labelHaloColor())
        .attr('stroke-width', 3)
        .attr('stroke-linejoin', 'round')
        .attr('paint-order', 'stroke fill')
        .style('pointer-events', 'none')
        .text(formatPolarDataLabel(d.y as number));
    }
  }

  private renderGrid(g: any, radius: number, count: number, rScale: any, ticks: number[], tickSpokeAngle: number = -Math.PI / 2): void {
    const gridInterp = (this.config as any).gridLineInterpolation
      || ((this.config as any)._yAxis ?? (this.config as any).yAxis)?.gridLineInterpolation
      || 'circle';
    const usePolygon = gridInterp === 'polygon';
    const angleStep = (2 * Math.PI) / count;

    if (usePolygon) {
      const pts: string[] = [];
      for (let j = 0; j < count; j++) {
        const a = j * angleStep - Math.PI / 2;
        pts.push(`${radius * Math.cos(a)},${radius * Math.sin(a)}`);
      }
      g.append('polygon')
        .attr('points', pts.join(' '))
        .attr('fill', 'none')
        .attr('stroke', '#d0d0d0')
        .attr('stroke-width', 0.8);
    } else {
      g.append('circle')
        .attr('r', radius)
        .attr('fill', 'none')
        .attr('stroke', '#d0d0d0')
        .attr('stroke-width', 0.8);
    }

    for (const tick of ticks) {
      const r = rScale(tick);

      if (usePolygon) {
        const pts: string[] = [];
        for (let j = 0; j < count; j++) {
          const a = j * angleStep - Math.PI / 2;
          const x = r * Math.cos(a);
          const y = r * Math.sin(a);
          pts.push(`${x},${y}`);
        }
        g.append('polygon')
          .attr('points', pts.join(' '))
          .attr('fill', 'none')
          .attr('stroke', '#e6e6e6')
          .attr('stroke-width', 0.5);
      } else {
        g.append('circle')
          .attr('r', r)
          .attr('fill', 'none')
          .attr('stroke', '#e6e6e6')
          .attr('stroke-width', 0.5);
      }

      const tickLabelX = r * Math.cos(tickSpokeAngle) + 5 * Math.cos(tickSpokeAngle + Math.PI / 2);
      const tickLabelY = r * Math.sin(tickSpokeAngle) + 5 * Math.sin(tickSpokeAngle + Math.PI / 2);
      g.append('text')
        .attr('x', tickLabelX)
        .attr('y', tickLabelY)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', DEFAULT_CHART_TEXT_SIZE)
        .attr('fill', this.autoLabelColor())
        .attr('stroke', this.labelHaloColor())
        .attr('stroke-width', 3)
        .attr('stroke-linejoin', 'round')
        .attr('paint-order', 'stroke fill')
        .style('pointer-events', 'none')
        .text(formatPolarTick(tick));
    }

    for (let i = 0; i < count; i++) {
      const angle = i * angleStep - Math.PI / 2;
      g.append('line')
        .attr('x1', 0).attr('y1', 0)
        .attr('x2', radius * Math.cos(angle))
        .attr('y2', radius * Math.sin(angle))
        .attr('stroke', '#ccc')
        .attr('stroke-width', 0.5);

      const categories = (this.context.xAxis as any)?.config?.categories;
      const spokeLabel = (categories && categories[i]) || this.data[i]?.name || `${i}`;
      const labelR = radius + 28;
      g.append('text')
        .attr('x', labelR * Math.cos(angle))
        .attr('y', labelR * Math.sin(angle))
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', DEFAULT_CHART_TEXT_SIZE)
        .attr('fill', this.autoLabelColor())
        .text(spokeLabel);
    }
  }

  getDataExtents() {
    return { xMin: 0, xMax: 0, yMin: 0, yMax: 0 };
  }
}

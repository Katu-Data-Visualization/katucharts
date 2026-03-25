import { lineRadial, areaRadial, curveLinearClosed, curveLinear, arc as d3Arc } from 'd3-shape';
import { scaleLinear } from 'd3-scale';
import { select } from 'd3-selection';
import 'd3-transition';
import { BaseSeries } from '../BaseSeries';
import type { InternalSeriesConfig, PointOptions } from '../../types/options';

type PolarSubType = 'line' | 'area' | 'column';

export class PolarSeries extends BaseSeries {
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
    const radius = Math.min(plotArea.width, plotArea.height) / 2 - 20;
    const cx = plotArea.width / 2;
    const cy = plotArea.height / 2;

    const maxValue = Math.max(...data.map(d => d.y ?? 0), 1);
    const rScale = scaleLinear().domain([0, maxValue]).range([0, radius]);
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

    this.renderGrid(g, radius, data.length, rScale, maxValue);

    const curveType = connectEnds ? curveLinearClosed : curveLinear;
    const effectiveData = data;

    const lineGen = lineRadial<PointOptions>()
      .angle((_, i) => i * angleStep - Math.PI / 2 + placementOffset)
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
        .angle((_, i) => i * angleStep - Math.PI / 2 + placementOffset)
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
          .transition().duration(800)
          .attr('d', areaGen(data) || '');
      } else {
        areaPath.attr('d', areaGen as any);
      }
    }

    if (animate) {
      linePath.attr('d', lineGen(zeroData) || '')
        .transition().duration(800)
        .attr('d', lineGen(data) || '');
    } else {
      linePath.attr('d', lineGen as any);
    }

    if (markerEnabled) {
      const points = g.selectAll('.katucharts-polar-point')
        .data(data)
        .join('circle')
        .attr('class', 'katucharts-polar-point')
        .attr('cx', (d, i) => rScale(d.y ?? 0) * Math.cos(i * angleStep - Math.PI / 2 + placementOffset))
        .attr('cy', (d, i) => rScale(d.y ?? 0) * Math.sin(i * angleStep - Math.PI / 2 + placementOffset))
        .attr('fill', this.config.marker?.fillColor || color)
        .attr('stroke', this.config.marker?.lineColor || '#fff')
        .attr('stroke-width', this.config.marker?.lineWidth ?? 1)
        .style('cursor', this.config.cursor || 'pointer');

      if (animate) {
        points.attr('r', 0).attr('opacity', 0)
          .transition().duration(400).delay(600)
          .attr('r', markerRadius).attr('opacity', 1);
      } else {
        points.attr('r', markerRadius);
      }

      if (this.config.enableMouseTracking !== false) {
        const hoverRadius = this.config.marker?.states?.hover?.radius ?? markerRadius + 3;

        points
          .on('mouseover', (event: MouseEvent, d: PointOptions) => {
            const target = select(event.currentTarget as SVGCircleElement);
            target.transition().duration(150).attr('r', hoverRadius);
            target.style('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))');
            points.filter((o: any) => o !== d).transition().duration(150).attr('opacity', inactiveOpacity);

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
            target.transition().duration(150).attr('r', markerRadius);
            target.style('filter', '');
            points.transition().duration(150).attr('opacity', 1);

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

  /**
   * Renders polar column chart with wedge-shaped segments around the center.
   */
  private renderColumnPolar(): void {
    const { plotArea, colors } = this.context;
    const animate = this.context.animate;
    const data = this.data;
    const color = this.getColor();
    const radius = Math.min(plotArea.width, plotArea.height) / 2 - 20;
    const cx = plotArea.width / 2;
    const cy = plotArea.height / 2;

    const maxValue = Math.max(...data.map(d => d.y ?? 0), 1);
    const rScale = scaleLinear().domain([0, maxValue]).range([0, radius]);
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

    this.renderGrid(g, radius, data.length, rScale, maxValue);

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
          .transition().duration(600).delay(i * 40)
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
          bars.filter((o: any) => o !== d).transition('highlight').duration(150).attr('opacity', inactiveOpacity);

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
          bars.transition('highlight').duration(150).attr('opacity', 1);

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

  private renderGrid(g: any, radius: number, count: number, rScale: any, maxValue: number): void {
    const levels = 5;
    const gridInterp = (this.config as any).gridLineInterpolation
      || (this.config as any).yAxis?.gridLineInterpolation
      || 'circle';
    const usePolygon = gridInterp === 'polygon';
    const angleStep = (2 * Math.PI) / count;

    for (let i = 1; i <= levels; i++) {
      const r = (radius / levels) * i;

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

      g.append('text')
        .attr('x', 3)
        .attr('y', -r + 3)
        .attr('font-size', '8px')
        .attr('fill', '#999')
        .style('pointer-events', 'none')
        .text(Math.round((maxValue / levels) * i));
    }

    for (let i = 0; i < count; i++) {
      const angle = i * angleStep - Math.PI / 2;
      g.append('line')
        .attr('x1', 0).attr('y1', 0)
        .attr('x2', radius * Math.cos(angle))
        .attr('y2', radius * Math.sin(angle))
        .attr('stroke', '#ccc')
        .attr('stroke-width', 0.5);

      const labelR = radius + 15;
      g.append('text')
        .attr('x', labelR * Math.cos(angle))
        .attr('y', labelR * Math.sin(angle))
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', '10px')
        .attr('fill', '#666')
        .text(this.data[i]?.name || `${i}`);
    }
  }

  getDataExtents() {
    return { xMin: 0, xMax: 0, yMin: 0, yMax: 0 };
  }
}

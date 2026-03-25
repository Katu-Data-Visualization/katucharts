import { pie as d3Pie, arc as d3Arc } from 'd3-shape';
import { interpolate } from 'd3-interpolate';
import { select } from 'd3-selection';
import 'd3-transition';
import { BaseSeries, type SeriesContext } from '../BaseSeries';
import type { InternalSeriesConfig, PointOptions, DataLabelOptions, BorderRadiusOptions } from '../../types/options';
import { templateFormat } from '../../utils/format';

export class PieSeries extends BaseSeries {
  private selectedIndices: Set<number> = new Set();

  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  render(): void {
    const { plotArea, colors } = this.context;
    const ignoreHidden = this.config.ignoreHiddenPoint !== false;
    const rawData = this.data.filter(d => d.y !== null && d.y !== undefined && (d.y ?? 0) > 0);
    const data = ignoreHidden
      ? rawData.filter(d => d.visible !== false)
      : rawData;
    const animate = this.context.animate;

    const center = this.config.center || ['50%', '50%'];
    const cx = this.resolvePercent(center[0], plotArea.width);
    const cy = this.resolvePercent(center[1], plotArea.height);

    const rawOuterDiameter = this.resolvePercent(this.config.size || '75%', Math.min(plotArea.width, plotArea.height));
    const minSize = this.config.minSize ? this.resolvePercent(this.config.minSize, Math.min(plotArea.width, plotArea.height)) : 0;
    const outerDiameter = Math.max(rawOuterDiameter, minSize);
    const outerRadius = outerDiameter / 2;
    const innerRadius = this.resolvePercent(this.config.innerSize || 0, outerRadius * 2) / 2;
    const depth = this.config.depth ?? 0;

    const startAngle = (this.config.startAngle ?? 0) * Math.PI / 180;
    const endAngle = this.config.endAngle !== undefined
      ? this.config.endAngle * Math.PI / 180
      : startAngle + 2 * Math.PI;

    const totalValue = data.reduce((s, d) => s + (d.y ?? 0), 0);
    const fillColor = this.config.fillColor;
    if (totalValue === 0 && fillColor) {
      const g = this.group.append('g').attr('transform', `translate(${cx},${cy})`);
      const emptyArc = d3Arc<any>()
        .innerRadius(innerRadius).outerRadius(outerRadius)
        .startAngle(startAngle).endAngle(endAngle);
      g.append('path').attr('d', emptyArc({}) as string).attr('fill', fillColor);
      return;
    }

    const pieGen = d3Pie<PointOptions>()
      .value(d => d.y ?? 0)
      .sort(null)
      .startAngle(startAngle)
      .endAngle(endAngle);

    const borderRadiusVal = this.resolveBorderRadius(this.config.borderRadius);
    const arcGen = d3Arc<any>()
      .innerRadius(innerRadius)
      .outerRadius(outerRadius)
      .cornerRadius(borderRadiusVal);

    const slicedOffset = this.config.slicedOffset ?? 10;
    const arcHover = d3Arc<any>()
      .innerRadius(innerRadius)
      .outerRadius(outerRadius + slicedOffset * 0.4)
      .cornerRadius(borderRadiusVal);

    const pieData = pieGen(data);

    const g = this.group.append('g')
      .attr('transform', `translate(${cx},${cy})`);

    if (depth > 0) {
      this.render3DEffect(g, pieData, innerRadius, outerRadius, depth);
    }

    const allowSelect = this.config.allowPointSelect === true;
    const hoverBrightness = this.config.states?.hover?.brightness ?? 0.1;
    const selectColor = this.config.states?.select?.color;
    const selectBorderColor = this.config.states?.select?.borderColor;
    const selectBorderWidth = this.config.states?.select?.borderWidth;
    const inactiveOpacity = this.config.states?.inactive?.opacity ?? 0.4;

    const getSliceColor = (d: any, i: number): string => {
      if (d.data.color) return d.data.color;
      if (this.config.colors) return this.config.colors[i % this.config.colors.length];
      return colors[i % colors.length];
    };

    const computeSlicedTranslate = (d: any): string => {
      const midAngle = (d.startAngle + d.endAngle) / 2;
      const tx = slicedOffset * Math.sin(midAngle);
      const ty = -slicedOffset * Math.cos(midAngle);
      return `translate(${tx},${ty})`;
    };

    const self = this;

    const slices = g.selectAll('.katucharts-pie-slice')
      .data(pieData)
      .join('path')
      .attr('class', 'katucharts-pie-slice')
      .attr('fill', (d, i) => getSliceColor(d, i))
      .attr('stroke', this.config.borderColor || '#ffffff')
      .attr('stroke-width', this.config.borderWidth ?? 1)
      .attr('opacity', this.config.opacity ?? 1)
      .style('cursor', this.config.cursor || 'pointer');

    slices.each(function(d: any, i: number) {
      const el = select(this);
      if (d.data.sliced || self.selectedIndices.has(i)) {
        el.attr('transform', computeSlicedTranslate(d));
      }
    });

    if (animate) {
      slices.each(function(d: any) {
        const el = select(this);
        const startArc = { startAngle: d.startAngle, endAngle: d.startAngle };
        const interp = interpolate(startArc, d);
        el
          .transition()
          .duration(800)
          .delay(100)
          .attrTween('d', () => (t: number) => arcGen(interp(t))!);
      });
    } else {
      slices.attr('d', arcGen as any);
    }

    if (this.config.enableMouseTracking !== false) {
      slices
        .on('mouseover', function(event: MouseEvent, d: any) {
          const target = select(this);
          const i = pieData.indexOf(d);
          const isSelected = self.selectedIndices.has(i);

          if (!isSelected) {
            target.transition('arc').duration(150).attr('d', arcHover(d)!);
          }
          target.style('filter', 'drop-shadow(0 2px 6px rgba(0,0,0,0.25))');

          slices.interrupt('highlight');
          slices.attr('opacity', self.config.opacity ?? 1);
          slices.filter((o: any) => o !== d).transition('highlight').duration(150).attr('opacity', inactiveOpacity);

          const sliceData = {
            ...d.data,
            percentage: ((d.endAngle - d.startAngle) / (endAngle - startAngle)) * 100,
          };
          const centroid = arcGen.centroid(d);
          self.context.events.emit('point:mouseover', {
            point: sliceData, index: i, series: self, event,
            plotX: cx + centroid[0], plotY: cy + centroid[1],
          });
          d.data.events?.mouseOver?.call(d.data, event);
          self.config.point?.events?.mouseOver?.call(d.data, event);
        })
        .on('mouseout', function(event: MouseEvent, d: any) {
          const target = select(this);
          const i = pieData.indexOf(d);
          const isSelected = self.selectedIndices.has(i);

          if (!isSelected) {
            target.transition('arc').duration(150).attr('d', arcGen(d)!);
          }
          target.style('filter', '');
          slices.interrupt('highlight');
          slices.transition('highlight').duration(150).attr('opacity', self.config.opacity ?? 1);

          self.context.events.emit('point:mouseout', { point: d.data, index: i, series: self, event });
          d.data.events?.mouseOut?.call(d.data, event);
          self.config.point?.events?.mouseOut?.call(d.data, event);
        })
        .on('click', function(event: MouseEvent, d: any) {
          const i = pieData.indexOf(d);

          if (allowSelect) {
            const wasSelected = self.selectedIndices.has(i);
            if (wasSelected) {
              self.selectedIndices.delete(i);
              select(this).transition('slice').duration(200).attr('transform', '');
              d.data.events?.unselect?.call(d.data, event);
              self.config.point?.events?.unselect?.call(d.data, event);
            } else {
              self.selectedIndices.add(i);
              select(this).transition('slice').duration(200).attr('transform', computeSlicedTranslate(d));
              d.data.events?.select?.call(d.data, event);
              self.config.point?.events?.select?.call(d.data, event);
            }

            if (selectColor || selectBorderColor || selectBorderWidth !== undefined) {
              slices.each(function(sd: any, si: number) {
                const el = select(this);
                if (self.selectedIndices.has(si)) {
                  if (selectColor) el.attr('fill', selectColor);
                  if (selectBorderColor) el.attr('stroke', selectBorderColor);
                  if (selectBorderWidth !== undefined) el.attr('stroke-width', selectBorderWidth);
                } else {
                  el.attr('fill', getSliceColor(sd, si));
                  el.attr('stroke', self.config.borderColor || '#ffffff');
                  el.attr('stroke-width', self.config.borderWidth ?? 1);
                }
              });
            }
          }

          self.context.events.emit('point:click', { point: d.data, index: i, series: self, event });
          d.data.events?.click?.call(d.data, event);
          self.config.events?.click?.call(self, event);
        });
    }

    this.renderPieLabels(g, pieData, arcGen, outerRadius, endAngle - startAngle);

    if (animate) {
      this.emitAfterAnimate(1000);
    }
  }

  private renderPieLabels(
    g: any, pieData: any[], arcGen: any,
    outerRadius: number, totalAngle: number
  ): void {
    const dlCfg = this.config.dataLabels;
    if (!dlCfg?.enabled) return;

    const plotW = this.context.plotArea.width;
    const plotH = this.context.plotArea.height;
    const plotHalfWidth = plotW / 2;
    const plotHalfHeight = plotH / 2;
    const labelDistance = dlCfg.distance ?? 30;
    const connectorWidth = dlCfg.connectorWidth ?? 1;
    const connectorColor = dlCfg.connectorColor || '#999';
    const connectorPadding = dlCfg.connectorPadding ?? 5;
    const softConnector = dlCfg.softConnector !== false;
    const fontSize = (dlCfg.style?.fontSize as string) || '11px';
    const fontColor = dlCfg.color || (dlCfg.style?.color as string) || '#333';
    const alignTo = dlCfg.alignTo;

    const labelsGroup = g.append('g').attr('class', 'katucharts-pie-labels');

    pieData.forEach((d: any, i: number) => {
      const percentage = ((d.endAngle - d.startAngle) / totalAngle) * 100;
      const centroid = arcGen.centroid(d);
      const midAngle = (d.startAngle + d.endAngle) / 2;
      const labelR = outerRadius + labelDistance;
      let lx = labelR * Math.sin(midAngle);
      let ly = -labelR * Math.cos(midAngle);

      if (alignTo === 'plotEdges' || alignTo === 'connectors') {
        const isRight = midAngle < Math.PI;
        lx = isRight ? plotHalfWidth - 5 : -(plotHalfWidth - 5);
      }

      const pad = 5;
      lx = Math.max(-(plotHalfWidth - pad), Math.min(plotHalfWidth - pad, lx));
      ly = Math.max(-(plotHalfHeight - pad), Math.min(plotHalfHeight - pad, ly));

      let text: string;
      if (dlCfg.formatter) {
        text = dlCfg.formatter.call({
          point: d.data, series: { name: this.config.name },
          x: d.data.x, y: d.data.y, percentage,
        });
      } else if (dlCfg.format) {
        text = templateFormat(dlCfg.format, {
          point: d.data, x: d.data.x, y: d.data.y, percentage,
        });
      } else {
        text = d.data.name || String(d.data.y);
      }

      if (connectorWidth > 0 && labelDistance >= 0) {
        const edgeR = outerRadius + connectorPadding;
        const ex = edgeR * Math.sin(midAngle);
        const ey = -edgeR * Math.cos(midAngle);
        const connectorShape = dlCfg.connectorShape || 'fixedOffset';

        if (connectorShape === 'straight') {
          labelsGroup.append('line')
            .attr('class', 'katucharts-pie-connector')
            .attr('x1', centroid[0]).attr('y1', centroid[1])
            .attr('x2', lx).attr('y2', ly)
            .attr('stroke', connectorColor)
            .attr('stroke-width', connectorWidth);
        } else if (connectorShape === 'crookedLine') {
          const crookDist = dlCfg.crookDistance ?? '70%';
          const crookFraction = typeof crookDist === 'string'
            ? parseFloat(crookDist) / 100 : crookDist / labelDistance;
          const crookR = outerRadius + labelDistance * crookFraction;
          const crookX = crookR * Math.sin(midAngle);
          const crookY = -crookR * Math.cos(midAngle);
          labelsGroup.append('path')
            .attr('class', 'katucharts-pie-connector')
            .attr('d', `M${centroid[0]},${centroid[1]}L${crookX},${crookY}L${lx},${ly}`)
            .attr('fill', 'none')
            .attr('stroke', connectorColor)
            .attr('stroke-width', connectorWidth);
        } else if (typeof connectorShape === 'function') {
          const customPath = connectorShape({
            connectorPosition: { from: centroid, to: [lx, ly] },
            labelDistance, labelPosition: [lx, ly],
          });
          labelsGroup.append('path')
            .attr('class', 'katucharts-pie-connector')
            .attr('d', customPath)
            .attr('fill', 'none')
            .attr('stroke', connectorColor)
            .attr('stroke-width', connectorWidth);
        } else {
          if (softConnector) {
            const cpx = (centroid[0] + ex) / 2 + (lx - ex) * 0.15;
            const cpy = (centroid[1] + ey) / 2 + (ly - ey) * 0.15;
            labelsGroup.append('path')
              .attr('class', 'katucharts-pie-connector')
              .attr('d', `M${centroid[0]},${centroid[1]} Q${cpx},${cpy} ${ex},${ey} L${lx},${ly}`)
              .attr('fill', 'none')
              .attr('stroke', connectorColor)
              .attr('stroke-width', connectorWidth);
          } else {
            labelsGroup.append('line')
              .attr('class', 'katucharts-pie-connector')
              .attr('x1', centroid[0]).attr('y1', centroid[1])
              .attr('x2', ex).attr('y2', ey)
              .attr('stroke', connectorColor)
              .attr('stroke-width', connectorWidth);
            labelsGroup.append('line')
              .attr('class', 'katucharts-pie-connector')
              .attr('x1', ex).attr('y1', ey)
              .attr('x2', lx).attr('y2', ly)
              .attr('stroke', connectorColor)
              .attr('stroke-width', connectorWidth);
          }
        }
      }

      const isInside = labelDistance < 0;
      const labelEl = labelsGroup.append('text')
        .attr('x', (isInside ? centroid[0] : lx) + (dlCfg.x ?? 0))
        .attr('y', (isInside ? centroid[1] : ly) + (dlCfg.y ?? 0))
        .attr('text-anchor', isInside ? 'middle' : (midAngle < Math.PI ? 'start' : 'end'))
        .attr('dominant-baseline', 'middle')
        .attr('font-size', fontSize)
        .attr('fill', fontColor)
        .style('pointer-events', 'none')
        .text(text);

      const dlStyle = dlCfg.style || {};
      if (dlStyle.fontWeight) labelEl.attr('font-weight', dlStyle.fontWeight as string);
      if (dlStyle.fontFamily) labelEl.attr('font-family', dlStyle.fontFamily as string);
      if (dlStyle.textOutline) labelEl.style('text-shadow', dlStyle.textOutline as string);
    });
  }

  /**
   * Renders pseudo-3D side effect below pie slices using the depth config.
   */
  private render3DEffect(g: any, pieData: any[], innerRadius: number, outerRadius: number, depth: number): void {
    const { colors } = this.context;
    const sideGroup = g.insert('g', ':first-child').attr('class', 'katucharts-pie-3d');

    for (const d of pieData) {
      const i = pieData.indexOf(d);
      const baseColor = d.data.color
        || (this.config.colors ? this.config.colors[i % this.config.colors.length] : colors[i % colors.length]);

      const startA = d.startAngle - Math.PI / 2;
      const endA = d.endAngle - Math.PI / 2;

      if (startA > 0 && endA > 0) continue;
      if (startA < 0 && endA < 0 && startA < -Math.PI && endA < -Math.PI) continue;

      const sideArc = d3Arc<any>()
        .innerRadius(innerRadius)
        .outerRadius(outerRadius)
        .startAngle(d.startAngle)
        .endAngle(d.endAngle);

      sideGroup.append('path')
        .attr('d', sideArc({}) as string)
        .attr('fill', baseColor)
        .attr('opacity', 0.7)
        .attr('transform', `translate(0,${depth})`);
    }
  }

  private resolvePercent(value: string | number, total: number): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.endsWith('%')) {
      return (parseFloat(value) / 100) * total;
    }
    return parseFloat(value) || 0;
  }

  private resolveBorderRadius(val: number | BorderRadiusOptions | undefined): number {
    if (val === undefined) return 3;
    if (typeof val === 'number') return val;
    return val.radius ?? 3;
  }

  getDataExtents() {
    return { xMin: 0, xMax: 0, yMin: 0, yMax: 0 };
  }
}

export class FunnelSeries extends BaseSeries {
  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  render(): void {
    const { plotArea, colors } = this.context;
    const data = this.data.filter(d => d.y !== null && d.y !== undefined);
    const animate = this.context.animate;
    const totalHeight = plotArea.height * 0.8;
    const segmentHeight = totalHeight / data.length;
    const maxValue = Math.max(...data.map(d => d.y ?? 0), 1);
    const centerX = plotArea.width / 2;
    const maxWidth = plotArea.width * 0.7;
    const minWidth = maxWidth * 0.15;
    const startY = (plotArea.height - totalHeight) / 2;
    const inactiveOpacity = this.config.states?.inactive?.opacity ?? 0.4;

    const segments: any[] = [];

    data.forEach((d, i) => {
      const fraction = (d.y ?? 0) / maxValue;
      const nextFraction = i < data.length - 1 ? (data[i + 1].y ?? 0) / maxValue : fraction * 0.5;
      const topWidth = minWidth + (maxWidth - minWidth) * fraction;
      const bottomWidth = minWidth + (maxWidth - minWidth) * nextFraction;
      const y = startY + i * segmentHeight;

      const path = [
        `M ${centerX - topWidth / 2} ${y}`,
        `L ${centerX + topWidth / 2} ${y}`,
        `L ${centerX + bottomWidth / 2} ${y + segmentHeight}`,
        `L ${centerX - bottomWidth / 2} ${y + segmentHeight}`,
        'Z',
      ].join(' ');

      const color = d.color || colors[i % colors.length];
      const el = this.group.append('path')
        .attr('d', path)
        .attr('stroke', this.config.borderColor || '#ffffff')
        .attr('stroke-width', this.config.borderWidth ?? 1)
        .attr('class', 'katucharts-funnel-segment')
        .style('cursor', this.config.cursor || 'pointer');

      segments.push(el);

      if (animate) {
        el.attr('fill', color).attr('opacity', 0)
          .transition().duration(500).delay(i * 80)
          .attr('opacity', 1);
      } else {
        el.attr('fill', color);
      }

      if (this.config.dataLabels?.enabled) {
        const dlCfg = this.config.dataLabels;
        const fontSize = (dlCfg.style?.fontSize as string) || '11px';
        const fontColor = dlCfg.color || (dlCfg.style?.color as string) || '#333';

        let text: string;
        if (dlCfg.formatter) {
          text = dlCfg.formatter.call({
            point: d, series: { name: this.config.name },
            x: d.x, y: d.y,
          });
        } else if (dlCfg.format) {
          text = templateFormat(dlCfg.format, { point: d, x: d.x, y: d.y });
        } else {
          text = d.name || String(d.y);
        }

        this.group.append('text')
          .attr('class', 'katucharts-funnel-label')
          .attr('x', centerX + (dlCfg.x ?? 0))
          .attr('y', y + segmentHeight / 2 + (dlCfg.y ?? 0))
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .attr('font-size', fontSize)
          .attr('fill', fontColor)
          .style('pointer-events', 'none')
          .text(text);
      }

      if (this.config.enableMouseTracking !== false) {
        el.on('mouseover', (event: MouseEvent) => {
          el.transition('move').duration(150)
            .attr('transform', `translate(0, -3)`)
            .style('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))');
          segments.forEach(s => s.interrupt('highlight'));
          segments.forEach(s => s.attr('opacity', 1));
          segments.forEach((s, j) => { if (j !== i) s.transition('highlight').duration(150).attr('opacity', inactiveOpacity); });
          this.context.events.emit('point:mouseover', {
            point: d, index: i, series: this, event,
            plotX: centerX, plotY: y + segmentHeight / 2,
          });
          d.events?.mouseOver?.call(d, event);
        }).on('mouseout', (event: MouseEvent) => {
          el.transition('move').duration(150)
            .attr('transform', '')
            .style('filter', '');
          segments.forEach(s => s.interrupt('highlight'));
          segments.forEach(s => s.transition('highlight').duration(150).attr('opacity', 1));
          this.context.events.emit('point:mouseout', { point: d, index: i, series: this, event });
          d.events?.mouseOut?.call(d, event);
        }).on('click', (event: MouseEvent) => {
          this.context.events.emit('point:click', { point: d, index: i, series: this, event });
          d.events?.click?.call(d, event);
          this.config.events?.click?.call(this, event);
        });
      }
    });
  }

  getDataExtents() {
    return { xMin: 0, xMax: 0, yMin: 0, yMax: 0 };
  }
}

export class PyramidSeries extends FunnelSeries {
  constructor(config: InternalSeriesConfig) {
    super(config);
    this.data = [...(config._processedData || [])].reverse();
  }
}

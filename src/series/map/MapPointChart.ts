import { select } from 'd3-selection';
import 'd3-transition';
import { BaseSeries } from '../BaseSeries';
import type { InternalSeriesConfig } from '../../types/options';
import { templateFormat, stripHtmlTags } from '../../utils/format';
import { DEFAULT_CHART_TEXT_COLOR, DEFAULT_CHART_TEXT_SIZE } from '../../utils/chartText';
import { ENTRY_DURATION, HOVER_DURATION, EASE_ENTRY, EASE_HOVER } from '../../core/animationConstants';
import { createMapProjection, applyGlobeProjection, isGlobeProjection, pointLonLat } from './mapProjection';

/**
 * `mappoint` series — renders point markers (and optional data labels) at
 * geographic `lat`/`lon` coordinates, projected through the *same* projection
 * as the choropleth basemap so markers land exactly on top of it. Mirrors the
 * The `mappoint` series type.
 */
export class MapPointChart extends BaseSeries {
  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  /**
   * Resolves the map topology this series projects against: its own bridged
   * `mapData` (from `chart.map`), or failing that the topology of a sibling
   * map-family series in the same chart.
   */
  private resolveMapData(): any {
    const cfg = this.config as any;
    if (cfg.mapData) return cfg.mapData;
    for (const s of this.context.allSeries || []) {
      const sc = (s as any).config;
      if (s !== this && sc?.mapData) return sc.mapData;
    }
    return null;
  }

  render(): void {
    const cfg = this.config as any;
    const { plotArea } = this.context;
    const mapData = this.resolveMapData();
    if (!mapData) return;

    const { projection, projName } = createMapProjection(mapData, cfg.projection, plotArea, cfg.mapDataObject);
    if (isGlobeProjection(projName, cfg)) applyGlobeProjection(projection, plotArea);

    const layer = this.group.append('g').attr('class', 'katucharts-mapzoom katucharts-mappoint-layer');

    const markerCfg = cfg.marker || {};
    const markersEnabled = markerCfg.enabled !== false;
    const defaultRadius = markerCfg.radius ?? 5;
    const lineColor = markerCfg.lineColor ?? '#ffffff';
    const lineWidth = markerCfg.lineWidth ?? 1;
    const seriesColor = cfg.color || this.getColor();
    const animate = this.context.animate;

    const dlCfg = cfg.dataLabels;
    const dlEnabled = !!dlCfg?.enabled;
    const dlColor = this.autoLabelColor(dlCfg?.color || (dlCfg?.style?.color as string));
    const dlSize = (dlCfg?.style?.fontSize as string) || DEFAULT_CHART_TEXT_SIZE;
    const dlWeight = (dlCfg?.style?.fontWeight as string) || '600';

    this.data.forEach((point, index) => {
      if ((point as any).name == null && (point as any).id != null) (point as any).name = (point as any).id;
      const lonlat = pointLonLat(point);
      if (!lonlat) return;
      const projected = projection(lonlat as [number, number]);
      if (!projected || !isFinite(projected[0]) || !isFinite(projected[1])) return;
      const [x, y] = projected;

      const pColor = (point as any).color || seriesColor;
      const radius = (point as any).marker?.radius ?? defaultRadius;
      const ptGroup = layer.append('g').attr('class', 'katucharts-mappoint');

      if (markersEnabled) {
        const marker = ptGroup.append('circle')
          .attr('class', 'katucharts-mappoint-marker')
          .attr('cx', x).attr('cy', y)
          .attr('fill', pColor)
          .attr('stroke', lineColor)
          .attr('stroke-width', lineWidth)
          .style('cursor', cfg.cursor || 'pointer')
          .attr('r', animate ? 0 : radius);

        if (animate) {
          marker.transition().duration(ENTRY_DURATION).delay(index * 12).ease(EASE_ENTRY).attr('r', radius);
        }

        marker
          .on('mouseover', (event: MouseEvent) => {
            select(event.currentTarget as SVGCircleElement)
              .transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER)
              .attr('r', radius * 1.4);
            this.context.events.emit('point:mouseover', {
              point, index, series: this, event, plotX: x, plotY: y,
            });
            (point as any).events?.mouseOver?.call(point, event);
          })
          .on('mouseout', (event: MouseEvent) => {
            select(event.currentTarget as SVGCircleElement)
              .transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER)
              .attr('r', radius);
            this.context.events.emit('point:mouseout', { point, index, series: this, event });
            (point as any).events?.mouseOut?.call(point, event);
          })
          .on('click', (event: MouseEvent) => {
            this.context.events.emit('point:click', { point, index, series: this, event });
            (point as any).events?.click?.call(point, event);
            cfg.point?.events?.click?.call(point, event);
            cfg.events?.click?.call(this, event);
          });
      }

      if (dlEnabled) {
        const text = this.formatLabel(point, index);
        if (text) {
          layer.append('text')
            .attr('class', 'katucharts-mappoint-label')
            .attr('x', x)
            .attr('y', y - radius - 3)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'auto')
            .attr('font-size', dlSize)
            .attr('font-weight', dlWeight)
            .attr('fill', dlColor)
            .style('pointer-events', 'none')
            .style('text-shadow', this.labelHalo())
            .text(text);
        }
      }
    });
  }

  private formatLabel(point: any, index: number): string {
    const dlCfg = (this.config as any).dataLabels;
    const ctx = {
      point,
      series: { name: this.config.name },
      x: point.id ?? point.name,
      y: point.y ?? point.value,
    };
    if (dlCfg?.formatter) return dlCfg.formatter.call(ctx);
    if (dlCfg?.format) return stripHtmlTags(templateFormat(dlCfg.format, ctx));
    return point.id || point.name || '';
  }

  getDataExtents() {
    return { xMin: 0, xMax: 0, yMin: 0, yMax: 0 };
  }
}

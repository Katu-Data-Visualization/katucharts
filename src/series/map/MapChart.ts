import { geoGraticule, type GeoProjection } from 'd3-geo';
import {
  createMapProjection, applyGlobeProjection, isGlobeProjection,
} from './mapProjection';
import { scaleSequential, scaleLinear, scaleLog } from 'd3-scale';
import {
  interpolateBlues, interpolateReds, interpolateGreens, interpolateOranges,
  interpolatePurples, interpolateGreys, interpolateYlOrRd, interpolateYlGnBu,
  interpolateRdYlGn, interpolateViridis, interpolatePlasma, interpolateInferno,
} from 'd3-scale-chromatic';
import { interpolateRgb } from 'd3-interpolate';
import { select } from 'd3-selection';
import { zoom as d3Zoom, type ZoomBehavior } from 'd3-zoom';
import { drag as d3Drag } from 'd3-drag';
import { color as d3Color } from 'd3-color';
import { timer as d3Timer, type Timer } from 'd3-timer';
import 'd3-transition';
import { BaseSeries } from '../BaseSeries';
import type { InternalSeriesConfig, PointOptions } from '../../types/options';
import { templateFormat, stripHtmlTags } from '../../utils/format';
import { DEFAULT_CHART_TEXT_COLOR, DEFAULT_CHART_TEXT_SIZE } from '../../utils/chartText';
import {
  ENTRY_DURATION,
  HOVER_DURATION,
  EASE_ENTRY,
  EASE_HOVER,
} from '../../core/animationConstants';

const colorSchemeMap: Record<string, (t: number) => string> = {
  'blues': interpolateBlues,
  'reds': interpolateReds,
  'greens': interpolateGreens,
  'oranges': interpolateOranges,
  'purples': interpolatePurples,
  'greys': interpolateGreys,
  'ylOrRd': interpolateYlOrRd,
  'ylGnBu': interpolateYlGnBu,
  'rdYlGn': interpolateRdYlGn,
  'viridis': interpolateViridis,
  'plasma': interpolatePlasma,
  'inferno': interpolateInferno,
};

export class MapChart extends BaseSeries {
  private zoomBehavior: ZoomBehavior<SVGGElement, unknown> | null = null;
  private mapGroup: any = null;
  private featurePaths: any = null;
  private dataMap = new Map<string, any>();
  private colorScale!: (v: number) => string;
  private globeProjection: GeoProjection | null = null;
  private globePathGen: any = null;
  private autoRotateTimer: Timer | null = null;

  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  destroy(): void {
    if (this.autoRotateTimer) {
      this.autoRotateTimer.stop();
      this.autoRotateTimer = null;
    }
    super.destroy();
  }

  render(): void {
    const { plotArea } = this.context;
    const cfg = this.config as any;
    const mapData = cfg.mapData;

    if (!mapData) {
      this.group.append('text')
        .attr('x', plotArea.width / 2)
        .attr('y', plotArea.height / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', '#999')
        .text('Map data not provided');
      return;
    }

    const { projection, pathGen, features, projName } =
      createMapProjection(mapData, cfg.projection, plotArea, cfg.mapDataObject);

    this.dataMap.clear();
    const joinBy = cfg.joinBy || ['hc-key', 'code'];
    const joinFields = Array.isArray(joinBy) ? joinBy : [joinBy, joinBy];
    const featureField = joinFields[0];
    const dataField = joinFields.length > 1 ? joinFields[1] : joinFields[0];

    for (const d of this.data) {
      const key = (d as any)[dataField] || (d as any).code || (d as any)['hc-key'] || d.name;
      if (key) this.dataMap.set(String(key), d);
    }

    const colorAxisCfg = cfg.colorAxis || {};
    const values = this.data.map(d => d.y ?? (d as any).value ?? 0).filter(v => v != null);
    const minVal = colorAxisCfg.min ?? (values.length ? Math.min(...values) : 0);
    const maxVal = colorAxisCfg.max ?? (values.length ? Math.max(...values) : 1);

    if (Array.isArray(colorAxisCfg.stops) && colorAxisCfg.stops.length >= 2) {
      const span = (maxVal - minVal) || 1;
      const domain = colorAxisCfg.stops.map((s: [number, string]) => minVal + s[0] * span);
      const range = colorAxisCfg.stops.map((s: [number, string]) => s[1]);
      const seq = scaleLinear<string, string>().domain(domain).range(range).clamp(true);
      this.colorScale = (v: number) => seq(v);
    } else if (colorAxisCfg.minColor && colorAxisCfg.maxColor) {
      const interp = interpolateRgb(colorAxisCfg.minColor, colorAxisCfg.maxColor);
      const norm = this.makeAxisNorm(colorAxisCfg, minVal, maxVal);
      this.colorScale = (v: number) => interp(norm(v));
    } else {
      const schemeName = colorAxisCfg.colorScheme || 'blues';
      const interpolator = colorSchemeMap[schemeName] || interpolateBlues;
      const norm = this.makeAxisNorm(colorAxisCfg, minVal, maxVal);
      this.colorScale = (v: number) => interpolator(norm(v));
    }

    const nullColor = cfg.nullColor ?? '#f0f0f0';
    const allAreas = cfg.allAreas !== false;
    const borderColor = cfg.borderColor ?? '#cccccc';
    const borderWidth = cfg.borderWidth ?? 0.5;

    const clipId = `katucharts-map-clip-${Math.random().toString(36).slice(2, 8)}`;
    const defs = this.group.append('defs');
    defs.append('clipPath').attr('id', clipId)
      .append('rect')
      .attr('width', plotArea.width)
      .attr('height', plotArea.height);

    const clipGroup = this.group.append('g')
      .attr('clip-path', `url(#${clipId})`)
      .attr('class', 'katucharts-map-clip');

    this.mapGroup = clipGroup.append('g').attr('class', 'katucharts-map-container katucharts-mapzoom');

    const featuresToRender = allAreas ? features : features.filter((f: any) => {
      const key = this.getFeatureKey(f, featureField);
      return this.dataMap.has(key);
    });

    const animate = this.context.animate;

    this.featurePaths = this.mapGroup.selectAll('.katucharts-map-feature')
      .data(featuresToRender)
      .join('path')
      .attr('class', 'katucharts-map-feature')
      .attr('d', pathGen as any)
      .attr('stroke', borderColor)
      .attr('stroke-width', borderWidth)
      .attr('stroke-linejoin', 'round')
      .style('cursor', 'pointer');

    if (animate) {
      this.featurePaths
        .attr('fill', nullColor)
        .attr('fill-opacity', 0)
        .transition().duration(ENTRY_DURATION).ease(EASE_ENTRY)
        .attr('fill-opacity', 1)
        .attr('fill', (d: any) => this.getFeatureColor(d, featureField, nullColor));
    } else {
      this.featurePaths
        .attr('fill', (d: any) => this.getFeatureColor(d, featureField, nullColor));
    }

    this.attachMapHover(featureField, borderColor, borderWidth, nullColor);

    this.renderMapLabels(pathGen, featuresToRender, featureField);

    if (colorAxisCfg.enabled !== false && values.length > 0) {
      this.renderColorAxis(minVal, maxVal, colorAxisCfg);
    }

    const isGlobe = isGlobeProjection(projName, cfg);
    if (isGlobe) {
      this.setupGlobeMode(projection, pathGen, features, featureField, nullColor, borderColor, borderWidth, cfg);
    } else {
      if (cfg.mapNavigation?.enabled !== false) {
        this.setupMapNavigation(projection, pathGen);
      }
    }
  }

  /**
   * Builds a 0‒1 value normalizer honoring `colorAxis.type`. A `'logarithmic'`
   * axis maps values on a log scale; it degrades to linear when
   * the domain includes non-positive values (log is undefined there).
   */
  private makeAxisNorm(colorAxisCfg: any, minVal: number, maxVal: number): (v: number) => number {
    if (colorAxisCfg.type === 'logarithmic' && minVal > 0 && maxVal > 0) {
      const norm = scaleLog().domain([minVal, maxVal]).clamp(true);
      return (v: number) => norm(Math.max(v, minVal)) as number;
    }
    const norm = scaleLinear().domain([minVal, maxVal]).clamp(true);
    return (v: number) => norm(v) as number;
  }

  private getFeatureKey(feature: any, featureField: string): string {
    return String(
      feature.properties?.[featureField]
      || feature.properties?.['hc-key']
      || feature.properties?.name
      || feature.id
      || ''
    );
  }

  private getFeatureColor(feature: any, featureField: string, nullColor: string): string {
    const key = this.getFeatureKey(feature, featureField);
    const point = this.dataMap.get(key);
    if (point) {
      if (point.color) return point.color;
      const val = point.y ?? (point as any).value;
      if (val != null) return this.colorScale(val);
    }
    return nullColor;
  }

  private attachMapHover(featureField: string, borderColor: string, borderWidth: number, nullColor: string): void {
    const cfg = this.config as any;
    const hoverColor = cfg.states?.hover?.color;
    const hoverBorderColor = cfg.states?.hover?.borderColor ?? '#333333';
    const hoverBorderWidth = cfg.states?.hover?.borderWidth ?? 1.5;
    const hoverBrightness = cfg.states?.hover?.brightness ?? 0.2;

    this.featurePaths
      .on('mouseover', (event: MouseEvent, d: any) => {
        const target = select(event.currentTarget as SVGPathElement);
        const key = this.getFeatureKey(d, featureField);
        const point = this.dataMap.get(key);
        const origFill = target.attr('fill');

        if (hoverColor) {
          target.transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER).attr('fill', hoverColor);
        } else {
          const brighter = d3Color(origFill)?.brighter(hoverBrightness)?.toString() || origFill;
          target.transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER).attr('fill', brighter);
        }
        target.attr('stroke', hoverBorderColor).attr('stroke-width', hoverBorderWidth);
        target.raise();

        this.featurePaths.interrupt('highlight');
        this.featurePaths.filter((o: any) => o !== d)
          .transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER).attr('opacity', 0.7);

        const featureName = d.properties?.name || key;
        const ptData = point
          ? { name: (point as any).name ?? featureName, y: point.y ?? (point as any).value, ...point }
          : { name: featureName };
        const centroid = (event.currentTarget as SVGPathElement).getBBox();
        this.context.events.emit('point:mouseover', {
          point: ptData,
          index: 0,
          series: this,
          event,
          plotX: centroid.x + centroid.width / 2,
          plotY: centroid.y + centroid.height / 2,
        });
      })
      .on('mouseout', (event: MouseEvent, d: any) => {
        const target = select(event.currentTarget as SVGPathElement);
        const origColor = this.getFeatureColor(d, featureField, nullColor);
        target.transition('hover').duration(HOVER_DURATION).ease(EASE_HOVER).attr('fill', origColor);
        target.attr('stroke', borderColor).attr('stroke-width', borderWidth);

        this.featurePaths.interrupt('highlight');
        this.featurePaths.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER).attr('opacity', 1);

        const key = this.getFeatureKey(d, featureField);
        const point = this.dataMap.get(key) || { name: d.properties?.name || key };
        this.context.events.emit('point:mouseout', { point, index: 0, series: this, event });
      })
      .on('click', (event: MouseEvent, d: any) => {
        const key = this.getFeatureKey(d, featureField);
        const point = this.dataMap.get(key) || { name: d.properties?.name || key };
        this.context.events.emit('point:click', { point, index: 0, series: this, event });
      });
  }

  private renderMapLabels(pathGen: any, features: any[], featureField: string): void {
    const dlCfg = (this.config as any).dataLabels || this.config.dataLabels;
    if (!dlCfg?.enabled) return;

    const fontSize = (dlCfg.style?.fontSize as string) || DEFAULT_CHART_TEXT_SIZE;
    const fontColor = this.autoLabelColor(dlCfg.color || (dlCfg.style?.color as string));
    const labelShadow = this.labelHalo();
    const onlyWithData = dlCfg.filter?.property === 'hasData';

    this.mapGroup.selectAll('.katucharts-map-label')
      .data(features)
      .join('text')
      .attr('class', 'katucharts-map-label')
      .attr('transform', (d: any) => {
        const centroid = pathGen.centroid(d);
        return isFinite(centroid[0]) ? `translate(${centroid[0]},${centroid[1]})` : 'translate(-9999,-9999)';
      })
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', fontSize)
      .attr('fill', fontColor)
      .style('pointer-events', 'none')
      .style('text-shadow', labelShadow)
      .text((d: any) => {
        const key = this.getFeatureKey(d, featureField);
        const point = this.dataMap.get(key);
        if (onlyWithData && !point) return '';

        if (dlCfg.formatter) {
          return dlCfg.formatter.call({
            point: point || { name: d.properties?.name },
            series: { name: this.config.name },
            x: d.properties?.name,
            y: point?.y ?? (point as any)?.value,
          });
        }
        if (dlCfg.format) {
          return stripHtmlTags(templateFormat(dlCfg.format, {
            point: point || { name: d.properties?.name },
            series: { name: this.config.name },
            x: d.properties?.name,
            y: point?.y ?? (point as any)?.value,
          }));
        }
        return point?.name || d.properties?.name || '';
      });
  }

  private renderColorAxis(minVal: number, maxVal: number, colorAxisCfg: any): void {
    const { plotArea } = this.context;
    const position = colorAxisCfg.layout === 'horizontal' ? 'bottom' : 'right';
    const labels = colorAxisCfg.labels || {};
    const title = colorAxisCfg.title;

    if (position === 'bottom') {
      this.renderHorizontalColorAxis(minVal, maxVal, colorAxisCfg, labels, title);
    } else {
      this.renderVerticalColorAxis(minVal, maxVal, colorAxisCfg, labels, title);
    }
  }

  private renderVerticalColorAxis(
    minVal: number, maxVal: number,
    cfg: any, labels: any, title: any
  ): void {
    const { plotArea } = this.context;
    const barWidth = cfg.width ?? 12;
    const barHeight = cfg.height ?? plotArea.height * 0.5;
    const x = plotArea.width + 15;
    const y = (plotArea.height - barHeight) / 2;
    const steps = 60;

    const axisGroup = this.group.append('g').attr('class', 'katucharts-map-color-axis');

    const defs = axisGroup.append('defs');
    const gradId = `katucharts-map-grad-${Math.random().toString(36).slice(2, 8)}`;
    const gradient = defs.append('linearGradient')
      .attr('id', gradId)
      .attr('x1', '0%').attr('y1', '100%')
      .attr('x2', '0%').attr('y2', '0%');

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const val = minVal + t * (maxVal - minVal);
      gradient.append('stop')
        .attr('offset', `${t * 100}%`)
        .attr('stop-color', this.colorScale(val));
    }

    axisGroup.append('rect')
      .attr('x', x).attr('y', y)
      .attr('width', barWidth).attr('height', barHeight)
      .attr('fill', `url(#${gradId})`)
      .attr('stroke', '#ccc').attr('stroke-width', 0.5)
      .attr('rx', 2);

    const labelFontSize = (labels.style?.fontSize as string) || DEFAULT_CHART_TEXT_SIZE;
    const labelColor = this.autoLabelColor(labels.style?.color as string);
    const formatFn = labels.formatter;
    const fmt = (v: number) => formatFn ? formatFn.call({ value: v }) : String(Math.round(v));

    axisGroup.append('text')
      .attr('x', x + barWidth + 4).attr('y', y + barHeight)
      .attr('font-size', labelFontSize).attr('fill', labelColor)
      .attr('dominant-baseline', 'auto')
      .text(fmt(minVal));

    axisGroup.append('text')
      .attr('x', x + barWidth + 4).attr('y', y)
      .attr('font-size', labelFontSize).attr('fill', labelColor)
      .attr('dominant-baseline', 'hanging')
      .text(fmt(maxVal));

    const midVal = (minVal + maxVal) / 2;
    axisGroup.append('text')
      .attr('x', x + barWidth + 4).attr('y', y + barHeight / 2)
      .attr('font-size', labelFontSize).attr('fill', labelColor)
      .attr('dominant-baseline', 'middle')
      .text(fmt(midVal));

    if (title?.text) {
      axisGroup.append('text')
        .attr('x', x + barWidth / 2).attr('y', y - 8)
        .attr('text-anchor', 'middle')
        .attr('font-size', '10px').attr('fill', this.autoLabelColor())
        .text(title.text);
    }
  }

  private renderHorizontalColorAxis(
    minVal: number, maxVal: number,
    cfg: any, labels: any, title: any
  ): void {
    const { plotArea } = this.context;
    const barWidth = cfg.width ?? plotArea.width * 0.5;
    const barHeight = cfg.height ?? 12;
    const x = (plotArea.width - barWidth) / 2;
    const y = plotArea.height + 25;
    const steps = 60;

    const axisGroup = this.group.append('g').attr('class', 'katucharts-map-color-axis');

    const defs = axisGroup.append('defs');
    const gradId = `katucharts-map-grad-${Math.random().toString(36).slice(2, 8)}`;
    const gradient = defs.append('linearGradient')
      .attr('id', gradId)
      .attr('x1', '0%').attr('y1', '0%')
      .attr('x2', '100%').attr('y2', '0%');

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const val = minVal + t * (maxVal - minVal);
      gradient.append('stop')
        .attr('offset', `${t * 100}%`)
        .attr('stop-color', this.colorScale(val));
    }

    axisGroup.append('rect')
      .attr('x', x).attr('y', y)
      .attr('width', barWidth).attr('height', barHeight)
      .attr('fill', `url(#${gradId})`)
      .attr('stroke', '#ccc').attr('stroke-width', 0.5)
      .attr('rx', 2);

    const labelFontSize = (labels.style?.fontSize as string) || DEFAULT_CHART_TEXT_SIZE;
    const labelColor = this.autoLabelColor(labels.style?.color as string);
    const formatFn = labels.formatter;
    const fmt = (v: number) => formatFn ? formatFn.call({ value: v }) : String(Math.round(v));

    axisGroup.append('text')
      .attr('x', x).attr('y', y + barHeight + 12)
      .attr('text-anchor', 'start')
      .attr('font-size', labelFontSize).attr('fill', labelColor)
      .text(fmt(minVal));

    axisGroup.append('text')
      .attr('x', x + barWidth).attr('y', y + barHeight + 12)
      .attr('text-anchor', 'end')
      .attr('font-size', labelFontSize).attr('fill', labelColor)
      .text(fmt(maxVal));

    if (title?.text) {
      axisGroup.append('text')
        .attr('x', x + barWidth / 2).attr('y', y - 6)
        .attr('text-anchor', 'middle')
        .attr('font-size', '10px').attr('fill', this.autoLabelColor())
        .text(title.text);
    }
  }

  private setupMapNavigation(projection: GeoProjection, pathGen: any): void {
    const { plotArea } = this.context;
    const cfg = (this.config as any).mapNavigation || {};
    const enableButtons = cfg.enableButtons !== false;
    const enableMouseWheel = cfg.enableMouseWheelZoom !== false;
    const enableDoubleClick = cfg.enableDoubleClickZoom !== false;
    const enableDrag = cfg.enableDrag !== false;
    const maxZoom = cfg.maxZoom ?? 16;
    const cx = plotArea.width / 2;
    const cy = plotArea.height / 2;

    this.zoomBehavior = d3Zoom<SVGGElement, unknown>()
      .scaleExtent([1, maxZoom])
      .on('zoom', (event: any) => {
        this.context.chartGroup.selectAll('.katucharts-mapzoom').attr('transform', event.transform);
      });

    const clipGroupSel = this.group.select('.katucharts-map-clip');
    const zoomTarget: any = clipGroupSel.empty() ? this.group : clipGroupSel;

    zoomTarget.insert('rect', ':first-child')
      .attr('width', plotArea.width)
      .attr('height', plotArea.height)
      .attr('fill', 'none')
      .style('pointer-events', 'all');

    if (enableMouseWheel || enableDoubleClick || enableDrag) {
      zoomTarget.call(this.zoomBehavior as any);
      if (!enableMouseWheel) zoomTarget.on('wheel.zoom', null);
      if (!enableDoubleClick) zoomTarget.on('dblclick.zoom', null);
      if (!enableDrag) {
        zoomTarget.on('mousedown.zoom', null);
        zoomTarget.on('touchstart.zoom', null);
      }
    }

    if (enableButtons) {
      this.renderNavButtons(zoomTarget, cx, cy);
    }
  }

  /**
   * Renders the map-navigation zoom buttons. Placement follows the standard
   * `mapNavigation.buttonOptions` API: the +/− pair is stacked vertically and
   * anchored top-left by default, honoring `align` ('left'|'right'),
   * `verticalAlign` ('top'|'bottom') and the `x`/`y` pixel offsets. Button
   * fill/border/symbol colors come from `buttonOptions.theme`/`symbolStroke`,
   * and per-button label text from `mapNavigation.buttons.zoomIn|zoomOut.text`.
   */
  private renderNavButtons(parentG: any, cx: number, cy: number): void {
    const { plotArea } = this.context;
    const navCfg = (this.config as any).mapNavigation || {};
    const bo = navCfg.buttonOptions || {};
    const theme = bo.theme || {};
    const buttons = navCfg.buttons || {};

    const btnSize = 24;
    const gap = 4;
    const margin = 10;
    const stackHeight = btnSize * 2 + gap;

    const align = bo.align || 'left';
    const vAlign = bo.verticalAlign || 'top';
    const baseX = (align === 'right' ? plotArea.width - btnSize - margin : margin) + (bo.x ?? 0);
    const baseY = (vAlign === 'bottom' ? plotArea.height - stackHeight - margin : margin) + (bo.y ?? 0);

    const fill = theme.fill || '#ffffff';
    const stroke = theme.stroke || '#e0e0e0';
    const symbolColor = (theme.style && theme.style.color) || bo.symbolStroke || '#3f3f46';

    const navGroup = this.group.append('g').attr('class', 'katucharts-map-nav');
    const center: [number, number] = [cx, cy];

    const makeButton = (y: number, label: string, onClick: () => void) => {
      const btn = navGroup.append('g').style('cursor', 'pointer').on('click', onClick);
      btn.append('rect')
        .attr('x', baseX).attr('y', y)
        .attr('width', btnSize).attr('height', btnSize)
        .attr('fill', fill).attr('stroke', stroke)
        .attr('stroke-width', 1).attr('rx', 4);
      btn.append('text')
        .attr('x', baseX + btnSize / 2).attr('y', y + btnSize / 2 + 1)
        .attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
        .attr('font-size', '17px').attr('fill', symbolColor)
        .style('user-select', 'none')
        .text(label);
      btn.on('mouseover', function () { select(this as any).select('rect').attr('fill', '#f5f5f5'); })
        .on('mouseout', function () { select(this as any).select('rect').attr('fill', fill); });
      return btn;
    };

    makeButton(baseY, buttons.zoomIn?.text || '+', () => {
      parentG.transition().duration(300).call(this.zoomBehavior!.scaleBy as any, 1.5, center);
    });
    makeButton(baseY + btnSize + gap, buttons.zoomOut?.text || '−', () => {
      parentG.transition().duration(300).call(this.zoomBehavior!.scaleBy as any, 1 / 1.5, center);
    });
  }

  private setupGlobeMode(
    projection: GeoProjection, pathGen: any,
    features: any[], featureField: string,
    nullColor: string, borderColor: string, borderWidth: number,
    cfg: any
  ): void {
    const { plotArea } = this.context;
    const cx = plotArea.width / 2;
    const cy = plotArea.height / 2;

    this.globeProjection = projection;
    this.globePathGen = pathGen;

    const radius = applyGlobeProjection(projection, plotArea);

    const options3d = cfg.options3d || {};
    const oceanColor = options3d.oceanColor ?? '#d4f1f9';
    const atmosphereColor = options3d.atmosphereColor ?? 'rgba(100,180,255,0.15)';
    const showGraticule = options3d.graticule !== false;
    const graticuleColor = options3d.graticuleColor ?? '#ccc';
    const graticuleOpacity = options3d.graticuleOpacity ?? 0.4;
    const autoRotate = options3d.autoRotate !== false;
    const rotateSpeed = options3d.rotateSpeed ?? 0.3;
    const shadowEnabled = options3d.shadow !== false;

    const defs = this.mapGroup.append('defs');
    const glowId = `katucharts-globe-glow-${Math.random().toString(36).slice(2, 8)}`;
    const radialGrad = defs.append('radialGradient').attr('id', glowId);
    radialGrad.append('stop').attr('offset', '70%').attr('stop-color', atmosphereColor);
    radialGrad.append('stop').attr('offset', '100%').attr('stop-color', 'rgba(100,180,255,0)');

    this.mapGroup.insert('circle', ':first-child')
      .attr('cx', cx).attr('cy', cy)
      .attr('r', radius + 15)
      .attr('fill', `url(#${glowId})`)
      .attr('class', 'katucharts-globe-atmosphere');

    if (shadowEnabled) {
      this.mapGroup.insert('ellipse', ':first-child')
        .attr('cx', cx + 8).attr('cy', cy + radius + 18)
        .attr('rx', radius * 0.6).attr('ry', 8)
        .attr('fill', 'rgba(0,0,0,0.12)')
        .attr('class', 'katucharts-globe-shadow');
    }

    this.mapGroup.insert('circle', '.katucharts-map-feature')
      .attr('cx', cx).attr('cy', cy)
      .attr('r', radius)
      .attr('fill', oceanColor)
      .attr('stroke', '#999')
      .attr('stroke-width', 0.5)
      .attr('class', 'katucharts-globe-ocean');

    if (showGraticule) {
      const graticule = geoGraticule().step([15, 15]);
      this.mapGroup.insert('path', '.katucharts-map-feature')
        .datum(graticule())
        .attr('d', pathGen)
        .attr('fill', 'none')
        .attr('stroke', graticuleColor)
        .attr('stroke-width', 0.3)
        .attr('stroke-opacity', graticuleOpacity)
        .attr('class', 'katucharts-globe-graticule');
    }

    this.featurePaths.attr('d', pathGen as any);

    const specId = `katucharts-globe-spec-${Math.random().toString(36).slice(2, 8)}`;
    const specGrad = defs.append('radialGradient').attr('id', specId)
      .attr('cx', '35%').attr('cy', '25%');
    specGrad.append('stop').attr('offset', '0%').attr('stop-color', 'rgba(255,255,255,0.35)');
    specGrad.append('stop').attr('offset', '50%').attr('stop-color', 'rgba(255,255,255,0.05)');
    specGrad.append('stop').attr('offset', '100%').attr('stop-color', 'rgba(255,255,255,0)');

    this.mapGroup.append('circle')
      .attr('cx', cx).attr('cy', cy)
      .attr('r', radius)
      .attr('fill', `url(#${specId})`)
      .style('pointer-events', 'none')
      .attr('class', 'katucharts-globe-specular');

    const self = this;
    let dragStart: [number, number, number] | null = null;
    let wasAutoRotating = autoRotate;

    const dragBehavior = d3Drag<SVGGElement, unknown>()
      .on('start', (event: any) => {
        const rot = projection.rotate();
        dragStart = [rot[0], rot[1], event.x];
        if (self.autoRotateTimer) {
          wasAutoRotating = true;
          self.autoRotateTimer.stop();
          self.autoRotateTimer = null;
        }
      })
      .on('drag', (event: any) => {
        if (!dragStart) return;
        const sensitivity = 0.4;
        const dx = (event.x - dragStart[2]) * sensitivity;
        const lambda = dragStart[0] + dx;
        const phi = Math.max(-90, Math.min(90, dragStart[1] - (event.y - event.subject.y) * sensitivity));
        projection.rotate([lambda, phi]);
        self.redrawGlobe();
      })
      .on('end', () => {
        dragStart = null;
        if (wasAutoRotating && autoRotate) {
          self.startAutoRotate(projection, rotateSpeed);
        }
      });

    this.group.call(dragBehavior as any);
    this.group.style('cursor', 'grab');

    this.group.on('wheel', (event: WheelEvent) => {
      event.preventDefault();
      const currentScale = projection.scale();
      const factor = event.deltaY > 0 ? 0.95 : 1.05;
      const newScale = Math.max(radius * 0.5, Math.min(radius * 8, currentScale * factor));
      projection.scale(newScale);
      self.redrawGlobe();
    });

    if (autoRotate) {
      this.startAutoRotate(projection, rotateSpeed);
    }
  }

  /**
   * Starts auto-rotation of the globe. Avoids overlapping timers that would
   * cause stuttering; advances rotation by elapsed time rather than per-frame
   * step so rotation remains smooth even under load.
   */
  private startAutoRotate(projection: GeoProjection, speed: number): void {
    const self = this;
    if (this.autoRotateTimer) {
      this.autoRotateTimer.stop();
      this.autoRotateTimer = null;
    }
    let last = 0;
    this.autoRotateTimer = d3Timer((elapsed: number) => {
      const dt = last ? Math.min(elapsed - last, 64) : 16;
      last = elapsed;
      const rot = projection.rotate();
      projection.rotate([rot[0] + speed * (dt / 16), rot[1]]);
      self.redrawGlobe();
    });
  }

  private redrawGlobe(): void {
    if (!this.globePathGen || !this.featurePaths || !this.globeProjection) return;

    const proj = this.globeProjection;
    const [cx, cy] = proj.translate!();
    const r = proj.scale!();

    this.featurePaths.attr('d', this.globePathGen as any);
    this.mapGroup.selectAll('.katucharts-globe-graticule').attr('d', this.globePathGen as any);

    this.mapGroup.select('.katucharts-globe-ocean').attr('cx', cx).attr('cy', cy).attr('r', r);
    this.mapGroup.select('.katucharts-globe-atmosphere').attr('cx', cx).attr('cy', cy).attr('r', r + 15);
    this.mapGroup.select('.katucharts-globe-specular').attr('cx', cx).attr('cy', cy).attr('r', r);
    this.mapGroup.select('.katucharts-globe-shadow')
      .attr('cx', cx + 8).attr('cy', cy + r + 18).attr('rx', r * 0.6);

    this.mapGroup.selectAll('.katucharts-map-label')
      .attr('transform', (d: any) => {
        const c = this.globePathGen.centroid(d);
        return isFinite(c[0]) ? `translate(${c[0]},${c[1]})` : 'translate(-9999,-9999)';
      })
      .attr('display', (d: any) => {
        const c = this.globePathGen.centroid(d);
        return isFinite(c[0]) ? null : 'none';
      });
  }

  getDataExtents() {
    return { xMin: 0, xMax: 0, yMin: 0, yMax: 0 };
  }
}

import { chord } from 'd3-chord';
import { arc as d3Arc } from 'd3-shape';
import { interpolate } from 'd3-interpolate';
import { select } from 'd3-selection';
import 'd3-transition';
import { BaseSeries } from '../BaseSeries';
import type { InternalSeriesConfig, SankeyNodeOptions } from '../../types/options';
import { DEFAULT_CHART_TEXT_COLOR, DEFAULT_CHART_TEXT_SIZE } from '../../utils/chartText';
import {
  ENTRY_DURATION,
  HOVER_DURATION,
  EASE_ENTRY,
  EASE_HOVER,
} from '../../core/animationConstants';

export class DependencyWheelSeries extends BaseSeries {
  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  render(): void {
    const { plotArea, colors } = this.context;
    const animate = this.context.animate;
    const cfg = this.config as any;
    const baseFlowDur = ENTRY_DURATION * 2;
    const ribbonStagger = 8;

    // Staged timing: arcs → labels → ribbons
    const arcDur = Math.round(baseFlowDur * 0.48);   // arcs sweep open
    const arcStagger = 12;                             // ms per-arc stagger
    const labelDelay = Math.round(arcDur * 0.65);     // labels appear while arcs still filling
    const ribbonDelay = arcDur + 8;                   // ribbons start after arcs complete
    const nodeWidth = cfg.nodeWidth ?? 20;
    const linkOpacity = cfg.linkOpacity ?? 0.5;
    const minLinkWidth = cfg.minLinkWidth ?? 0;
    const startAngle = (cfg.startAngle ?? 0) * (Math.PI / 180);

    const parentGroup = (this.group.node() as SVGElement)?.parentElement;
    if (parentGroup) {
      select(parentGroup).attr('clip-path', null);
    }
    const svg = this.group.select(function() {
      return (this as unknown as SVGElement).ownerSVGElement;
    }) as any;
    if (!svg.empty()) {
      svg.style('overflow', 'visible');
    }

    const centerCfg = cfg.center || ['50%', '50%'];
    const cxo = this.resolvePercent(centerCfg[0], plotArea.width);
    const cyo = this.resolvePercent(centerCfg[1], plotArea.height);

    const sizePct = cfg.size;
    const maxDim = sizePct
      ? this.resolvePercent(sizePct, Math.min(plotArea.width, plotArea.height))
      : Math.min(plotArea.width, plotArea.height);
    const outerRadius = maxDim / 2 - 2;
    const innerRadius = outerRadius - nodeWidth;

    const { matrix, names, nodeColors } = this.buildMatrix();
    if (names.length === 0) return;

    const nodePadding = cfg.nodePadding ?? 2;
    const padAngle = nodePadding / (outerRadius > 0 ? outerRadius : 1);
    const chordGen = chord().padAngle(padAngle).sortSubgroups(null as any);
    const chords = chordGen(matrix);
    this.normalizeChordWidths(chords);
    this.sortChordEndpoints(chords);

    const arcGen = d3Arc<any>()
      .innerRadius(innerRadius)
      .outerRadius(outerRadius)
      .cornerRadius(3);

    const arcHover = d3Arc<any>()
      .innerRadius(innerRadius)
      .outerRadius(outerRadius + 4)
      .cornerRadius(3);

    const minCurveRadius = cfg.curveFactor ?? 0.05;
    const ribbonPath = (d: any): string => {
      const r = innerRadius;
      const sa0 = d.source.startAngle + startAngle - Math.PI / 2;
      const sa1 = d.source.endAngle + startAngle - Math.PI / 2;
      const ta0 = d.target.startAngle + startAngle - Math.PI / 2;
      const ta1 = d.target.endAngle + startAngle - Math.PI / 2;
      const sx0 = r * Math.cos(sa0), sy0 = r * Math.sin(sa0);
      const sx1 = r * Math.cos(sa1), sy1 = r * Math.sin(sa1);
      const tx0 = r * Math.cos(ta0), ty0 = r * Math.sin(ta0);
      const tx1 = r * Math.cos(ta1), ty1 = r * Math.sin(ta1);
      const sla = Math.abs(sa1 - sa0) > Math.PI ? 1 : 0;
      const tla = Math.abs(ta1 - ta0) > Math.PI ? 1 : 0;

      let dist1 = Math.abs(ta0 - sa1);
      if (dist1 > Math.PI) dist1 = 2 * Math.PI - dist1;
      const t1 = dist1 / Math.PI;
      const cr1 = r * Math.max(minCurveRadius, (1 - t1) * (1 - t1) * (1 - t1));

      let dist2 = Math.abs(sa0 - ta1);
      if (dist2 > Math.PI) dist2 = 2 * Math.PI - dist2;
      const t2 = dist2 / Math.PI;
      const cr2 = r * Math.max(minCurveRadius, (1 - t2) * (1 - t2) * (1 - t2));

      return `M${sx0},${sy0}A${r},${r},0,${sla},1,${sx1},${sy1}`
        + `C${cr1 * Math.cos(sa1)},${cr1 * Math.sin(sa1)},${cr1 * Math.cos(ta0)},${cr1 * Math.sin(ta0)},${tx0},${ty0}`
        + `A${r},${r},0,${tla},1,${tx1},${ty1}`
        + `C${cr2 * Math.cos(ta1)},${cr2 * Math.sin(ta1)},${cr2 * Math.cos(sa0)},${cr2 * Math.sin(sa0)},${sx0},${sy0}Z`;
    };

    const g = this.group.append('g')
      .attr('transform', `translate(${cxo},${cyo})`);

    const getNodeColor = (idx: number): string => nodeColors[idx] || colors[idx % colors.length];

    const dwLinkColorMode = cfg.linkColorMode ?? 'from';

    const edgeGradientDefs = g.append('defs');

    let ribbonGradientDefs: any = null;
    if (dwLinkColorMode === 'gradient') {
      ribbonGradientDefs = edgeGradientDefs;
    }

    const getRibbonColor = (d: any): string => {
      if (dwLinkColorMode === 'to') return getNodeColor(d.target.index);
      return getNodeColor(d.source.index);
    };

    const fadeLen = nodeWidth * 2;
    const createRadialEdgeGradient = (angle: number, color: string, idx: number, side: string): string => {
      const gradId = `katucharts-dw-edge-${side}-${idx}-${Math.random().toString(36).slice(2, 6)}`;
      const x1 = innerRadius * Math.cos(angle);
      const y1 = innerRadius * Math.sin(angle);
      const x2 = (innerRadius - fadeLen) * Math.cos(angle);
      const y2 = (innerRadius - fadeLen) * Math.sin(angle);
      edgeGradientDefs.append('linearGradient')
        .attr('id', gradId)
        .attr('gradientUnits', 'userSpaceOnUse')
        .attr('x1', x1).attr('y1', y1)
        .attr('x2', x2).attr('y2', y2)
        .selectAll('stop')
        .data([
          { offset: '0%', opacity: 0.7 },
          { offset: '25%', opacity: 0.2 },
          { offset: '50%', opacity: 0.05 },
          { offset: '100%', opacity: 0 },
        ])
        .join('stop')
        .attr('offset', (s: any) => s.offset)
        .attr('stop-color', color)
        .attr('stop-opacity', (s: any) => s.opacity);
      return gradId;
    };

    const useGrouping = dwLinkColorMode !== 'gradient';
    let ribbons: any;
    let colorGroups: any;

    if (useGrouping) {
      const colorBuckets = new Map<string, any[]>();
      for (const c of chords as any[]) {
        const color = getRibbonColor(c);
        if (!colorBuckets.has(color)) colorBuckets.set(color, []);
        colorBuckets.get(color)!.push(c);
      }

      const ribbonContainer = g.append('g').attr('class', 'katucharts-chord-container');
      for (const [color, groupData] of colorBuckets) {
        const cg = ribbonContainer.append('g')
          .attr('class', 'katucharts-chord-group')
          .attr('opacity', linkOpacity);
        cg.selectAll('.katucharts-chord')
          .data(groupData)
          .join('path')
          .attr('class', 'katucharts-chord')
          .attr('d', (d: any) => ribbonPath(d))
          .attr('fill', color)
          .attr('fill-opacity', 1)
          .attr('stroke', 'none')
          .style('cursor', 'pointer');
      }

      ribbons = ribbonContainer.selectAll('.katucharts-chord');
      colorGroups = ribbonContainer.selectAll('.katucharts-chord-group');

      const edgeOverlay = g.append('g').attr('class', 'katucharts-chord-edges')
        .attr('opacity', linkOpacity);
      (chords as any[]).forEach((d: any, i: number) => {
        const srcColor = getNodeColor(d.source.index);
        const tgtColor = getNodeColor(d.target.index);
        if (srcColor === tgtColor) return;
        const path = ribbonPath(d);
        const tgtMid = (d.target.startAngle + d.target.endAngle) / 2 + startAngle - Math.PI / 2;
        const tgtGradId = createRadialEdgeGradient(tgtMid, tgtColor, i, 'tgt');
        edgeOverlay.append('path').attr('d', path)
          .attr('fill', `url(#${tgtGradId})`).attr('stroke', 'none')
          .style('pointer-events', 'none');
        const srcMid = (d.source.startAngle + d.source.endAngle) / 2 + startAngle - Math.PI / 2;
        const srcGradId = createRadialEdgeGradient(srcMid, srcColor, i, 'src');
        edgeOverlay.append('path').attr('d', path)
          .attr('fill', `url(#${srcGradId})`).attr('stroke', 'none')
          .style('pointer-events', 'none');
      });

      if (animate) {
        edgeOverlay.attr('opacity', 0);
        const clipDefs = g.append('defs');
        const ribbonDur = Math.round(baseFlowDur * 0.62);
        ribbons.each(function(this: SVGPathElement, d: any, i: number) {
          const delay = ribbonDelay + i * ribbonStagger;
          const clipId = `dw-clip-${i}-${Math.random().toString(36).slice(2, 6)}`;
          const sa0 = d.source.startAngle + startAngle - Math.PI / 2;
          const sa1 = d.source.endAngle + startAngle - Math.PI / 2;
          const ta0 = d.target.startAngle + startAngle - Math.PI / 2;
          const ta1 = d.target.endAngle + startAngle - Math.PI / 2;
          const saMid = (sa0 + sa1) / 2;
          const taMid = (ta0 + ta1) / 2;
          const sx = innerRadius * Math.cos(saMid);
          const sy = innerRadius * Math.sin(saMid);
          const tx = innerRadius * Math.cos(taMid);
          const ty = innerRadius * Math.sin(taMid);
          const sweepAngle = Math.atan2(ty - sy, tx - sx) * 180 / Math.PI;
          const sweepDist = Math.sqrt((tx - sx) ** 2 + (ty - sy) ** 2) + outerRadius * 2;
          const clip = clipDefs.append('clipPath')
            .attr('id', clipId)
            .attr('clipPathUnits', 'userSpaceOnUse');
          const clipRect = clip.append('rect')
            .attr('transform', `translate(${sx},${sy}) rotate(${sweepAngle})`)
            .attr('x', -outerRadius)
            .attr('y', -outerRadius)
            .attr('width', 0)
            .attr('height', outerRadius * 2);
          const ribbonEl = select(this);
          ribbonEl.attr('clip-path', `url(#${clipId})`);
          clipRect.transition('enter').duration(ribbonDur).delay(delay).ease(EASE_ENTRY)
            .attr('width', sweepDist)
            .on('end', function() {
              ribbonEl.attr('clip-path', null);
              clip.remove();
            });
        });
        const overlayDelay = ribbonDelay + ((chords as any[]).length - 1) * ribbonStagger + ribbonDur;
        edgeOverlay.transition('enter').duration(300).delay(overlayDelay).ease(EASE_ENTRY)
          .attr('opacity', linkOpacity);
      }
    } else {
      ribbons = g.selectAll('.katucharts-chord')
        .data(chords)
        .join('path')
        .attr('class', 'katucharts-chord')
        .attr('d', (d: any) => ribbonPath(d))
        .attr('stroke', 'none')
        .style('cursor', 'pointer');

      ribbons.each(function(this: SVGPathElement, d: any, i: number) {
        const gradId = `katucharts-dw-grad-${i}-${Math.random().toString(36).slice(2, 6)}`;
        const sa = (d.source.startAngle + d.source.endAngle) / 2 + startAngle - Math.PI / 2;
        const ta = (d.target.startAngle + d.target.endAngle) / 2 + startAngle - Math.PI / 2;
        ribbonGradientDefs.append('linearGradient')
          .attr('id', gradId)
          .attr('gradientUnits', 'userSpaceOnUse')
          .attr('x1', innerRadius * Math.cos(sa)).attr('y1', innerRadius * Math.sin(sa))
          .attr('x2', innerRadius * Math.cos(ta)).attr('y2', innerRadius * Math.sin(ta))
          .selectAll('stop')
          .data([
            { offset: '0%', color: getNodeColor(d.source.index) },
            { offset: '100%', color: getNodeColor(d.target.index) },
          ])
          .join('stop')
          .attr('offset', (s: any) => s.offset)
          .attr('stop-color', (s: any) => s.color);
        select(this).attr('fill', `url(#${gradId})`);
      });

      if (animate) {
        ribbons.attr('fill-opacity', linkOpacity);
        const clipDefs = g.append('defs');
        const ribbonDur = Math.round(baseFlowDur * 0.62);
        ribbons.each(function(this: SVGPathElement, d: any, i: number) {
          const delay = ribbonDelay + i * ribbonStagger;
          const clipId = `dw-clip-${i}-${Math.random().toString(36).slice(2, 6)}`;
          const sa0 = d.source.startAngle + startAngle - Math.PI / 2;
          const sa1 = d.source.endAngle + startAngle - Math.PI / 2;
          const ta0 = d.target.startAngle + startAngle - Math.PI / 2;
          const ta1 = d.target.endAngle + startAngle - Math.PI / 2;
          const saMid = (sa0 + sa1) / 2;
          const taMid = (ta0 + ta1) / 2;
          const sx = innerRadius * Math.cos(saMid);
          const sy = innerRadius * Math.sin(saMid);
          const tx = innerRadius * Math.cos(taMid);
          const ty = innerRadius * Math.sin(taMid);
          const sweepAngle = Math.atan2(ty - sy, tx - sx) * 180 / Math.PI;
          const sweepDist = Math.sqrt((tx - sx) ** 2 + (ty - sy) ** 2) + outerRadius * 2;
          const clip = clipDefs.append('clipPath')
            .attr('id', clipId)
            .attr('clipPathUnits', 'userSpaceOnUse');
          const clipRect = clip.append('rect')
            .attr('transform', `translate(${sx},${sy}) rotate(${sweepAngle})`)
            .attr('x', -outerRadius)
            .attr('y', -outerRadius)
            .attr('width', 0)
            .attr('height', outerRadius * 2);
          const ribbonEl = select(this);
          ribbonEl.attr('clip-path', `url(#${clipId})`);
          clipRect.transition('enter').duration(ribbonDur).delay(delay).ease(EASE_ENTRY)
            .attr('width', sweepDist)
            .on('end', function() {
              ribbonEl.attr('clip-path', null);
              clip.remove();
            });
        });
      } else {
        ribbons.attr('fill-opacity', linkOpacity);
      }
    }

    const emitRibbonPoint = (type: 'mouseover' | 'mouseout' | 'click', event: MouseEvent, d: any) => {
      const point = {
        from: names[d.source.index], to: names[d.target.index], y: d.source.value,
        weight: d.source.value,
        fromNode: { name: names[d.source.index] }, toNode: { name: names[d.target.index] },
      };

      if (type === 'mouseover') {
        this.context.events.emit('point:mouseover', {
          point,
          index: chords.indexOf(d), series: this, event,
          plotX: event.offsetX - this.context.plotArea.x, plotY: event.offsetY - this.context.plotArea.y,
        });
        return;
      }

      if (type === 'mouseout') {
        this.context.events.emit('point:mouseout', {
          point,
          index: chords.indexOf(d), series: this, event,
        });
        return;
      }

      this.context.events.emit('point:click', {
        point,
        index: chords.indexOf(d), series: this, event,
      });
    };

    const handleRibbonMouseOver = (event: MouseEvent, d: any) => {
      ribbons.interrupt('highlight');
      arcs.interrupt('highlight');
      if (colorGroups) colorGroups.interrupt('highlight').attr('opacity', 1);
      ribbons.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER)
        .attr('fill-opacity', (o: any) => o === d ? Math.min(linkOpacity + 0.35, 1) : 0.05);
      arcs.attr('opacity', 1);
      arcs.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER)
        .attr('opacity', (a: any) =>
          a.index === d.source.index || a.index === d.target.index ? 1 : 0.3
        );
      emitRibbonPoint('mouseover', event, d);
    };

    const handleRibbonMouseOut = (event: MouseEvent, d: any) => {
      ribbons.interrupt('highlight');
      arcs.interrupt('highlight');
      if (colorGroups) {
        colorGroups.interrupt('highlight');
        colorGroups.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER).attr('opacity', linkOpacity);
        ribbons.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER).attr('fill-opacity', 1);
      } else {
        ribbons.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER).attr('fill-opacity', linkOpacity);
      }
      arcs.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER).attr('opacity', 1);
      emitRibbonPoint('mouseout', event, d);
    };

    const handleRibbonClick = (event: MouseEvent, d: any) => {
      emitRibbonPoint('click', event, d);
    };

    ribbons
      .on('mouseover', handleRibbonMouseOver)
      .on('mouseout', handleRibbonMouseOut)
      .on('click', handleRibbonClick);

    const arcsData = chords.groups.map((g: any) => {
      return {
        ...g,
        startAngle: g.startAngle + startAngle,
        endAngle: g.endAngle + startAngle,
      };
    });

    const normalizeAngle = (angle: number): number => {
      const twoPi = Math.PI * 2;
      let a = angle % twoPi;
      if (a < 0) a += twoPi;
      return a;
    };

    const pickRibbonForArcEvent = (event: MouseEvent, arcDatum: any): any | null => {
      const localX = event.offsetX - this.context.plotArea.x - cxo;
      const localY = event.offsetY - this.context.plotArea.y - cyo;
      const hoveredAngle = normalizeAngle(Math.atan2(localY, localX) + Math.PI / 2);

      const connected = (chords as any[]).filter((r: any) =>
        r.source.index === arcDatum.index || r.target.index === arcDatum.index
      );
      if (connected.length === 0) return null;

      const endpointFor = (r: any) => r.source.index === arcDatum.index ? r.source : r.target;
      const withinEndpoint = (r: any) => {
        const endpoint = endpointFor(r);
        const start = normalizeAngle(endpoint.startAngle + startAngle);
        const end = normalizeAngle(endpoint.endAngle + startAngle);
        if (start <= end) return hoveredAngle >= start && hoveredAngle <= end;
        return hoveredAngle >= start || hoveredAngle <= end;
      };

      const containing = connected.find(withinEndpoint);
      if (containing) return containing;

      let best = connected[0];
      let bestDistance = Infinity;
      for (const ribbon of connected) {
        const endpoint = endpointFor(ribbon);
        const mid = normalizeAngle(((endpoint.startAngle + endpoint.endAngle) / 2) + startAngle);
        let diff = Math.abs(hoveredAngle - mid);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        if (diff < bestDistance) {
          bestDistance = diff;
          best = ribbon;
        }
      }
      return best;
    };

    const buildRibbonPoint = (ribbon: any) => ({
      from: names[ribbon.source.index], to: names[ribbon.target.index], y: ribbon.source.value,
      weight: ribbon.source.value,
      fromNode: { name: names[ribbon.source.index] }, toNode: { name: names[ribbon.target.index] },
    });

    const arcBorderColor = cfg.borderColor ?? '#ffffff';
    const arcBorderWidth = cfg.borderWidth ?? 1;

    const arcs = g.selectAll('.katucharts-chord-arc')
      .data(arcsData)
      .join('path')
      .attr('class', 'katucharts-chord-arc')
      .attr('fill', (d: any) => getNodeColor(d.index))
      .attr('stroke', arcBorderColor)
      .attr('stroke-width', arcBorderWidth)
      .style('cursor', 'pointer');

    if (animate) {
      arcs.each(function(this: any, d: any, i: number) {
        const self = select(this);
        const startArc = { startAngle: d.startAngle, endAngle: d.startAngle };
        const interp = interpolate(startArc, d);
        self.transition('enter').duration(arcDur).delay(i * arcStagger).ease(EASE_ENTRY)
          .attrTween('d', () => (t: number) => arcGen(interp(t))!);
      });
    } else {
      arcs.attr('d', arcGen as any);
    }

    arcs
      .on('mouseover', (event: MouseEvent, d: any) => {
        const target = select(event.currentTarget as SVGPathElement);
        target.transition('arc').duration(HOVER_DURATION).ease(EASE_HOVER).attr('d', arcHover(d)!);
        ribbons.interrupt('highlight');
        arcs.interrupt('highlight');
        if (colorGroups) colorGroups.interrupt('highlight').attr('opacity', 1);
        ribbons.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER)
          .attr('fill-opacity', (r: any) =>
            r.source.index === d.index || r.target.index === d.index ? Math.min(linkOpacity + 0.35, 1) : 0.05
          );
        arcs.attr('opacity', 1);
        arcs.filter((o: any) => o !== d)
          .transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER).attr('opacity', (a: any) => {
            const connected = chords.some((r: any) =>
              (r.source.index === d.index && r.target.index === a.index) ||
              (r.target.index === d.index && r.source.index === a.index)
            );
            return connected ? 1 : 0.3;
          });
        labels.filter((l: any) => l.index === d.index)
          .transition('label').duration(HOVER_DURATION).ease(EASE_HOVER).attr('opacity', 1);
        const hoveredRibbon = pickRibbonForArcEvent(event, d);
        this.context.events.emit('point:mouseover', {
          point: hoveredRibbon
            ? buildRibbonPoint(hoveredRibbon)
            : { name: names[d.index], y: d.value, sum: d.value },
          index: d.index, series: this, event,
          plotX: event.offsetX - this.context.plotArea.x, plotY: event.offsetY - this.context.plotArea.y,
        });
      })
      .on('mouseout', (event: MouseEvent, d: any) => {
        const target = select(event.currentTarget as SVGPathElement);
        target.transition('arc').duration(HOVER_DURATION).ease(EASE_HOVER).attr('d', arcGen(d)!);
        ribbons.interrupt('highlight');
        arcs.interrupt('highlight');
        if (colorGroups) {
          colorGroups.interrupt('highlight');
          colorGroups.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER).attr('opacity', linkOpacity);
          ribbons.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER).attr('fill-opacity', 1);
        } else {
          ribbons.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER).attr('fill-opacity', linkOpacity);
        }
        arcs.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER).attr('opacity', 1);
        labels.filter((l: any) => l.index === d.index)
          .transition('label').duration(HOVER_DURATION).ease(EASE_HOVER).attr('opacity', (l: any) => labelVisible(l) ? 1 : 0);
        const hoveredRibbon = pickRibbonForArcEvent(event, d);
        this.context.events.emit('point:mouseout', {
          point: hoveredRibbon
            ? buildRibbonPoint(hoveredRibbon)
            : { name: names[d.index], y: d.value, sum: d.value },
          index: d.index, series: this, event,
        });
      })
      .on('click', (event: MouseEvent, d: any) => {
        const hoveredRibbon = pickRibbonForArcEvent(event, d);
        this.context.events.emit('point:click', {
          point: hoveredRibbon
            ? buildRibbonPoint(hoveredRibbon)
            : { name: names[d.index], y: d.value, sum: d.value },
          index: d.index, series: this, event,
        });
      });

    g.append('g')
      .attr('class', 'katucharts-chord-hitareas')
      .selectAll('.katucharts-chord-hitarea')
      .data(chords)
      .join('path')
      .attr('class', 'katucharts-chord-hitarea')
      .attr('d', (d: any) => ribbonPath(d))
      .attr('fill', '#ffffff')
      .attr('fill-opacity', 0)
      .attr('stroke', '#ffffff')
      .attr('stroke-opacity', 0)
      .attr('stroke-width', 12)
      .attr('stroke-linejoin', 'round')
      .style('cursor', 'pointer')
      .style('pointer-events', 'all')
      .on('mouseover', handleRibbonMouseOver)
      .on('mouseout', handleRibbonMouseOut)
      .on('click', handleRibbonClick);

    const dlCfg = this.config.dataLabels || {};
    const dlColor = dlCfg.color || (dlCfg.style?.color as string) || DEFAULT_CHART_TEXT_COLOR;
    const dlFontSize = (dlCfg.style?.fontSize as string) || DEFAULT_CHART_TEXT_SIZE;
    const fontPx = parseFloat(dlFontSize) || parseFloat(DEFAULT_CHART_TEXT_SIZE);
    const labelR = (innerRadius + outerRadius) / 2;

    const labelVisible = (d: any): boolean => {
      const arcLen = (d.endAngle - d.startAngle) * labelR;
      const nameLen = (names[d.index] || '').length * fontPx * 0.35;
      return arcLen > nameLen;
    };

    const labels = g.selectAll('.katucharts-chord-label')
      .data(arcsData)
      .join('text')
      .attr('class', 'katucharts-chord-label')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', dlFontSize)
      .attr('font-weight', 'bold')
      .attr('fill', dlColor)
      .style('pointer-events', 'none')
      .attr('opacity', 0)
      .attr('x', (d: any) => {
        const mid = (d.startAngle + d.endAngle) / 2 - Math.PI / 2;
        return labelR * Math.cos(mid);
      })
      .attr('y', (d: any) => {
        const mid = (d.startAngle + d.endAngle) / 2 - Math.PI / 2;
        return labelR * Math.sin(mid);
      })
      .text((d: any) => names[d.index] || '');

    if (animate) {
      labels.transition('enter').duration(300).delay(labelDelay).ease(EASE_ENTRY)
        .attr('opacity', (d: any) => labelVisible(d) ? 1 : 0);

      const ribbonDur = Math.round(baseFlowDur * 0.62);
      const nRibbons = (chords as any[]).length;
      const totalDur = ribbonDelay + nRibbons * ribbonStagger + ribbonDur;
      this.emitAfterAnimate(totalDur + 100);
    } else {
      labels.attr('opacity', (d: any) => labelVisible(d) ? 1 : 0);
    }
  }

  private resolvePercent(val: string | number, total: number): number {
    if (typeof val === 'string' && val.endsWith('%')) {
      return (parseFloat(val) / 100) * total;
    }
    return typeof val === 'number' ? val : parseFloat(val) || total / 2;
  }

  private normalizeChordWidths(chords: any): void {
    const groups = chords.groups;
    if (groups.length === 0) return;

    let maxDensity = 0;
    for (const g of groups) {
      const span = g.endAngle - g.startAngle;
      if (span > 0 && g.value > 0) {
        maxDensity = Math.max(maxDensity, g.value / span);
      }
    }
    if (maxDensity === 0) return;

    for (const group of groups) {
      const endpoints: Array<{ ref: any; value: number }> = [];
      for (const c of chords as any[]) {
        if (c.source.index === group.index)
          endpoints.push({ ref: c.source, value: c.source.value });
        if (c.target.index === group.index)
          endpoints.push({ ref: c.target, value: c.target.value });
      }
      if (endpoints.length === 0) continue;
      endpoints.sort((a, b) => a.ref.startAngle - b.ref.startAngle);

      const groupSpan = group.endAngle - group.startAngle;
      const totalDataWidth = endpoints.reduce((s, e) => s + e.value / maxDensity, 0);
      const remainingGap = Math.max(0, groupSpan - totalDataWidth);
      const gapEach = remainingGap / (endpoints.length + 1);

      let angle = group.startAngle + gapEach;
      for (const ep of endpoints) {
        const width = ep.value / maxDensity;
        ep.ref.startAngle = angle;
        ep.ref.endAngle = angle + width;
        angle += width + gapEach;
      }
    }
  }

  private sortChordEndpoints(chords: any): void {
    const groups = chords.groups;
    const TWO_PI = 2 * Math.PI;

    for (const group of groups) {
      const endpoints: Array<{ chord: any; side: 'source' | 'target'; partnerMid: number; width: number }> = [];
      const getRef = (ep: any) => ep.side === 'source' ? ep.chord.source : ep.chord.target;

      for (const c of chords as any[]) {
        if (c.source.index === group.index) {
          const partner = groups[c.target.index];
          endpoints.push({ chord: c, side: 'source',
            partnerMid: (partner.startAngle + partner.endAngle) / 2,
            width: c.source.endAngle - c.source.startAngle });
        }
        if (c.target.index === group.index) {
          const partner = groups[c.source.index];
          endpoints.push({ chord: c, side: 'target',
            partnerMid: (partner.startAngle + partner.endAngle) / 2,
            width: c.target.endAngle - c.target.startAngle });
        }
      }

      if (endpoints.length <= 1) continue;

      const groupSpan = group.endAngle - group.startAngle;
      const totalWidth = endpoints.reduce((s, e) => s + e.width, 0);
      const totalGap = Math.max(0, groupSpan - totalWidth);
      const gapEach = totalGap / (endpoints.length + 1);

      const groupEnd = group.endAngle;
      endpoints.sort((a, b) => {
        const aAng = ((a.partnerMid - groupEnd) % TWO_PI + TWO_PI) % TWO_PI;
        const bAng = ((b.partnerMid - groupEnd) % TWO_PI + TWO_PI) % TWO_PI;
        return bAng - aAng;
      });

      let angle = group.startAngle + gapEach;
      for (const ep of endpoints) {
        const ref = getRef(ep);
        ref.startAngle = angle;
        ref.endAngle = angle + ep.width;
        angle += ep.width + gapEach;
      }
    }
  }

  private buildMatrix(): { matrix: number[][]; names: string[]; nodeColors: (string | undefined)[] } {
    const configNodes: SankeyNodeOptions[] = (this.config as any).nodes || [];
    const nodeColorMap = new Map<string, string>();
    for (const n of configNodes) {
      if (n.color) nodeColorMap.set(n.id, n.color);
    }

    const nameSet = new Set<string>();
    for (const d of this.data) {
      if ((d as any).from) nameSet.add((d as any).from);
      if ((d as any).to) nameSet.add((d as any).to);
    }
    const names = Array.from(nameSet);
    const nameIndex = new Map(names.map((n, i) => [n, i]));
    const matrix = Array.from({ length: names.length }, () => new Array(names.length).fill(0));

    for (const d of this.data) {
      const from = nameIndex.get((d as any).from);
      const to = nameIndex.get((d as any).to);
      if (from !== undefined && to !== undefined) {
        const w = d.y ?? (d as any).weight ?? 1;
        matrix[from][to] += w;
        matrix[to][from] += w;
      }
    }

    const nodeColors = names.map(n => nodeColorMap.get(n));

    return { matrix, names, nodeColors };
  }

  getDataExtents() {
    return { xMin: 0, xMax: 0, yMin: 0, yMax: 0 };
  }
}

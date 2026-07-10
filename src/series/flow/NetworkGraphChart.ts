import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force';
import { select } from 'd3-selection';
import { drag as d3Drag } from 'd3-drag';
import 'd3-transition';
import { BaseSeries } from '../BaseSeries';
import { clamp } from '../../utils/math';
import type { InternalSeriesConfig } from '../../types/options';
import {
  DEFAULT_CHART_TEXT_COLOR,
  DEFAULT_CHART_TEXT_SIZE,
  measureTextWidth,
  parseFontSizePx,
} from '../../utils/chartText';
import {
  ENTRY_DURATION,
  HOVER_DURATION,
  EASE_ENTRY,
  EASE_HOVER,
} from '../../core/animationConstants';

export class NetworkGraphChart extends BaseSeries {
  private simulation: any = null;

  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  render(): void {
    const { plotArea, colors } = this.context;
    const animate = this.context.animate;
    const cfg = this.config as any;
    const { nodes, links } = this.buildGraph();
    if (nodes.length === 0) return;

    const linkCfg = cfg.link || {};
    const layoutCfg = cfg.layoutAlgorithm || {};
    const draggable = cfg.draggable !== false;

    const linkDistance = layoutCfg.linkLength ?? linkCfg.distance ?? 80;
    const linkColor = linkCfg.color ?? '#999';
    const linkWidth = linkCfg.width;
    const linkDashStyle = linkCfg.dashStyle;
    const maxIterations = layoutCfg.maxIterations ?? 300;
    const gravitationalConstant = layoutCfg.gravitationalConstant ?? -200;
    const friction = layoutCfg.friction ?? 0.9;
    const maxSpeed = layoutCfg.maxSpeed ?? 10;
    const initialPositions = layoutCfg.initialPositions;
    const attractiveForce = layoutCfg.attractiveForce as ((d: number, k: number) => number) | undefined;
    const repulsiveForce = layoutCfg.repulsiveForce as ((d: number, k: number) => number) | undefined;

    if (initialPositions === 'circle') {
      const cx = plotArea.width / 2;
      const cy = plotArea.height / 2;
      const r = Math.min(plotArea.width, plotArea.height) / 3;
      nodes.forEach((n: any, i: number) => {
        const angle = (2 * Math.PI * i) / nodes.length;
        n.x = cx + r * Math.cos(angle);
        n.y = cy + r * Math.sin(angle);
      });
    } else if (initialPositions === 'random') {
      nodes.forEach((n: any) => {
        n.x = Math.random() * plotArea.width;
        n.y = Math.random() * plotArea.height;
      });
    } else if (typeof initialPositions === 'function') {
      initialPositions(nodes);
    }

    const optimalDistance = Math.sqrt(
      (plotArea.width * plotArea.height) / Math.max(nodes.length, 1)
    );

    const linkForce = forceLink(links).id((d: any) => d.id);
    if (attractiveForce) {
      linkForce.distance((d: any) => attractiveForce(
        Math.sqrt((d.source.x - d.target.x) ** 2 + (d.source.y - d.target.y) ** 2) || 1,
        optimalDistance
      ));
    } else {
      linkForce.distance(linkDistance);
    }

    const chargeForce = forceManyBody();
    if (repulsiveForce) {
      chargeForce.strength((_d: any) => -repulsiveForce(1, optimalDistance));
    } else {
      chargeForce.strength(gravitationalConstant);
    }

    /**
     * Footprint of a node including the caption drawn above it: half-width
     * covers whichever is wider (circle or centered label text), and the
     * vertical span reaches from the caption top down to the circle bottom.
     * Nodes without a visible label fall back to the circle alone.
     */
    const dataLabelsCfg = (cfg.dataLabels || {}) as any;
    const labelsVisible = dataLabelsCfg.enabled !== false;
    // Labels render at the standard chart text size, so measure against that.
    const labelFontPx = parseFontSizePx(DEFAULT_CHART_TEXT_SIZE) || 12;
    const labelAscent = labelsVisible ? 14 + labelFontPx : 0;
    nodes.forEach((n: any) => {
      n.labelWidth = labelsVisible
        ? measureTextWidth(String(n.name ?? n.id ?? ''), labelFontPx)
        : 0;
    });

    /**
     * One rectangle-repulsion sweep over the node/caption footprints so a node
     * tends to rest outside its neighbours' label areas. Overlapping pairs
     * separate along the axis needing the least correction, letting nodes
     * settle a little above, below, or beside each other instead of covering
     * one another's captions. Displacements are accumulated from a single
     * snapshot and applied together (Jacobi-style) so the sweep converges to a
     * stable rest instead of oscillating. With `direct` the positions move
     * immediately (to relax the static initial layout); otherwise velocities
     * get a gentle nudge so the live simulation keeps honouring the preference.
     */
    const pad = 3;
    const footprint = (n: any) => {
      const r = n.marker?.radius ?? 10;
      return { hw: Math.max(n.labelWidth / 2, r) + pad, hh: (r + labelAscent) / 2 + pad, cy: n.y + (r - labelAscent) / 2 };
    };
    const declutterPass = (strength: number, direct: boolean): boolean => {
      const dxs = new Array(nodes.length).fill(0);
      const dys = new Array(nodes.length).fill(0);
      let moved = false;
      for (let i = 0; i < nodes.length; i++) {
        const a: any = nodes[i];
        const fa = footprint(a);
        for (let j = i + 1; j < nodes.length; j++) {
          const b: any = nodes[j];
          const fb = footprint(b);
          const dx = b.x - a.x;
          const dy = fb.cy - fa.cy;
          const overlapX = fa.hw + fb.hw - Math.abs(dx);
          const overlapY = fa.hh + fb.hh - Math.abs(dy);
          if (overlapX <= 0 || overlapY <= 0) continue;
          moved = true;
          if (overlapX < overlapY) {
            const s = (overlapX * strength * (dx >= 0 ? 1 : -1)) / 2;
            dxs[i] -= s; dxs[j] += s;
          } else {
            const s = (overlapY * strength * (dy >= 0 ? 1 : -1)) / 2;
            dys[i] -= s; dys[j] += s;
          }
        }
      }
      if (moved) {
        for (let i = 0; i < nodes.length; i++) {
          const n: any = nodes[i];
          if (direct) { n.x += dxs[i]; n.y += dys[i]; }
          else { n.vx = (n.vx || 0) + dxs[i]; n.vy = (n.vy || 0) + dys[i]; }
        }
      }
      return moved;
    };
    const labelDeclutter = (alpha: number) => { declutterPass(0.35 * alpha, false); };

    this.simulation = forceSimulation(nodes)
      .force('link', linkForce)
      .force('charge', chargeForce)
      .force('center', forceCenter(plotArea.width / 2, plotArea.height / 2))
      .force('collide', forceCollide().radius((d: any) => (d.marker?.radius ?? 10) + 4))
      .force('declutter', labelsVisible ? labelDeclutter : null)
      .velocityDecay(1 - friction)
      .alphaDecay(1 - Math.pow(0.001, 1 / maxIterations))
      .stop();

    for (let i = 0; i < maxIterations; i++) {
      this.simulation.tick();
      nodes.forEach((n: any) => {
        const vx = Math.abs(n.vx || 0);
        const vy = Math.abs(n.vy || 0);
        if (vx > maxSpeed) n.vx = Math.sign(n.vx!) * maxSpeed;
        if (vy > maxSpeed) n.vy = Math.sign(n.vy!) * maxSpeed;
        this.clampToPlot(n);
      });
    }

    /**
     * Relax residual caption overlaps the cooled simulation could not resolve
     * on its own, so the initial layout comes to rest decluttered. Clamping
     * each sweep keeps nodes pushed against an edge spreading along it (rather
     * than re-stacking at the boundary); damped so long labels that cannot
     * fully separate settle instead of jittering.
     */
    if (labelsVisible) {
      for (let i = 0; i < 60 && declutterPass(0.6, true); i++) {
        nodes.forEach((n: any) => this.clampToPlot(n));
      }
    }

    /**
     * Keep every node — and the label drawn above it — inside the plot area, so
     * nodes near an edge don't get their circle or caption clipped.
     */
    nodes.forEach((n: any) => this.clampToPlot(n));

    const dashArray = this.getDashArray(linkDashStyle);

    const linkLines = this.group.selectAll('.katucharts-network-link')
      .data(links)
      .join('line')
      .attr('class', 'katucharts-network-link')
      .attr('x1', (d: any) => d.source.x)
      .attr('y1', (d: any) => d.source.y)
      .attr('x2', (d: any) => d.target.x)
      .attr('y2', (d: any) => d.target.y)
      .attr('stroke', linkColor)
      .attr('stroke-width', (d: any) => linkWidth ?? Math.sqrt(d.value || 1))
      .attr('stroke-dasharray', dashArray);

    if (animate) {
      linkLines.attr('stroke-opacity', 0)
        .transition().duration(ENTRY_DURATION).ease(EASE_ENTRY)
        .attr('stroke-opacity', 0.6);
    } else {
      linkLines.attr('stroke-opacity', 0.6);
    }

    const nodeCircles = this.group.selectAll('.katucharts-network-node')
      .data(nodes)
      .join('circle')
      .attr('class', 'katucharts-network-node')
      .attr('cx', (d: any) => d.x)
      .attr('cy', (d: any) => d.y)
      .attr('fill', (d: any, i: number) => d.color || colors[i % colors.length])
      .attr('stroke', this.autoBorderColor())
      .attr('stroke-width', 1.5)
      .style('cursor', draggable ? 'grab' : 'pointer');

    if (animate) {
      nodeCircles.attr('r', 0)
        .transition().duration(ENTRY_DURATION).ease(EASE_ENTRY)
        .attr('r', (d: any) => d.marker?.radius || 10);
    } else {
      nodeCircles.attr('r', (d: any) => d.marker?.radius ?? 10);
    }

    if (draggable) {
      const dragBehavior = d3Drag<SVGCircleElement, any>()
        .on('start', (event: any, d: any) => {
          const target = nodeCircles.filter((n: any) => n === d);
          target.style('cursor', 'grabbing');
          target.interrupt('size');
          target.transition('grab').duration(HOVER_DURATION).ease(EASE_HOVER)
            .attr('r', (d.marker?.radius ?? 10) + 4);
          target.style('filter', 'drop-shadow(0 3px 8px rgba(0,0,0,0.35))');
          if (this.simulation) {
            this.simulation.alphaTarget(0.1).restart();
          }
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event: any, d: any) => {
          const r = d.marker?.radius ?? 10;
          const x = clamp(event.x, r + 30, plotArea.width - r - 30);
          const y = clamp(event.y, r + 18, plotArea.height - r - 6);
          d.fx = x;
          d.fy = y;
          d.x = x;
          d.y = y;
          this.updatePositions(nodeCircles, linkLines, labels);
        })
        .on('end', (event: any, d: any) => {
          const target = nodeCircles.filter((n: any) => n === d);
          target.style('cursor', 'grab');
          target.transition('grab').duration(HOVER_DURATION).ease(EASE_HOVER)
            .attr('r', d.marker?.radius ?? 10);
          target.style('filter', '');
          if (this.simulation) {
            this.simulation.alphaTarget(0);
          }
          d.fx = null;
          d.fy = null;
        });

      nodeCircles.call(dragBehavior as any);
    }

    nodeCircles
      .on('mouseover', (event: MouseEvent, d: any) => {
        const target = select(event.currentTarget as SVGCircleElement);
        const baseR = d.marker?.radius || 10;
        target.transition('size').duration(HOVER_DURATION).ease(EASE_HOVER).attr('r', baseR + 4);
        target.style('filter', 'drop-shadow(0 2px 6px rgba(0,0,0,0.3))');

        nodeCircles.interrupt('highlight');
        linkLines.interrupt('highlight');
        nodeCircles.attr('opacity', 1);
        linkLines.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER)
          .attr('stroke-opacity', (l: any) =>
            l.source === d || l.target === d ? 0.9 : 0.1
          )
          .attr('stroke-width', (l: any) =>
            l.source === d || l.target === d ? 3 : (linkWidth ?? Math.sqrt(l.value || 1))
          );

        nodeCircles.filter((n: any) => n !== d)
          .transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER).attr('opacity', (n: any) => {
            const connected = links.some((l: any) =>
              (l.source === d && l.target === n) || (l.target === d && l.source === n)
            );
            return connected ? 1 : 0.3;
          });

        const i = nodes.indexOf(d);
        this.context.events.emit('point:mouseover', {
          point: { name: d.name || d.id }, index: i, series: this, event,
          plotX: d.x, plotY: d.y,
        });
      })
      .on('mouseout', (event: MouseEvent, d: any) => {
        const target = select(event.currentTarget as SVGCircleElement);
        target.transition('size').duration(HOVER_DURATION).ease(EASE_HOVER).attr('r', d.marker?.radius || 10);
        target.style('filter', '');

        nodeCircles.interrupt('highlight');
        linkLines.interrupt('highlight');
        linkLines.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER)
          .attr('stroke-opacity', 0.6)
          .attr('stroke-width', (l: any) => linkWidth ?? Math.sqrt(l.value || 1));

        nodeCircles.transition('highlight').duration(HOVER_DURATION).ease(EASE_HOVER).attr('opacity', 1);

        const i = nodes.indexOf(d);
        this.context.events.emit('point:mouseout', {
          point: { name: d.name || d.id }, index: i, series: this, event,
        });
      })
      .on('click', (event: MouseEvent, d: any) => {
        const i = nodes.indexOf(d);
        this.context.events.emit('point:click', {
          point: { name: d.name || d.id }, index: i, series: this, event,
        });
      });

    const labels = this.group.selectAll('.katucharts-network-label')
      .data(nodes)
      .join('text')
      .attr('class', 'katucharts-network-label')
      .attr('x', (d: any) => d.x)
      .attr('y', (d: any) => d.y - 14)
      .attr('text-anchor', 'middle')
      .attr('font-size', DEFAULT_CHART_TEXT_SIZE)
      .attr('fill', this.autoLabelColor((this.config.dataLabels as any)?.color || ((this.config.dataLabels as any)?.style?.color as string)))
      .style('pointer-events', 'none')
      .text((d: any) => d.name || d.id);

    if (animate) {
      labels.attr('opacity', 0)
        .transition().duration(ENTRY_DURATION).ease(EASE_ENTRY)
        .attr('opacity', 1);
    }

    /**
     * Live-phase renderer: the warm-up loop above ticks manually (which never
     * dispatches this event), so this only fires while the simulation runs on
     * its internal timer — i.e. during and after a drag. Capping speed and
     * clamping here keeps every node inside the plot area at all times and
     * lets the graph settle smoothly after the node is dropped.
     */
    this.simulation.on('tick', () => {
      nodes.forEach((n: any) => {
        const vx = Math.abs(n.vx || 0);
        const vy = Math.abs(n.vy || 0);
        if (vx > maxSpeed) n.vx = Math.sign(n.vx!) * maxSpeed;
        if (vy > maxSpeed) n.vy = Math.sign(n.vy!) * maxSpeed;
        this.clampToPlot(n);
      });
      this.updatePositions(nodeCircles, linkLines, labels);
    });
  }

  /**
   * Keep a node — and the label drawn above it — inside the plot area, so its
   * circle and caption are never clipped. Also constrains a drag-pinned
   * position (fx/fy) when one is set, without re-pinning released nodes.
   */
  private clampToPlot(node: any): void {
    const { plotArea } = this.context;
    const r = node.marker?.radius ?? 10;
    const minX = r + 30;
    const maxX = plotArea.width - r - 30;
    const minY = r + 18;
    const maxY = plotArea.height - r - 6;
    node.x = clamp(node.x ?? 0, minX, maxX);
    node.y = clamp(node.y ?? 0, minY, maxY);
    if (node.fx != null) node.fx = clamp(node.fx, minX, maxX);
    if (node.fy != null) node.fy = clamp(node.fy, minY, maxY);
  }

  private updatePositions(nodeCircles: any, linkLines: any, labels: any): void {
    nodeCircles
      .attr('cx', (d: any) => d.x)
      .attr('cy', (d: any) => d.y);
    linkLines
      .attr('x1', (d: any) => d.source.x)
      .attr('y1', (d: any) => d.source.y)
      .attr('x2', (d: any) => d.target.x)
      .attr('y2', (d: any) => d.target.y);
    labels
      .attr('x', (d: any) => d.x)
      .attr('y', (d: any) => d.y - 14);
  }

  private getDashArray(style?: string): string {
    if (!style) return 'none';
    const map: Record<string, string> = {
      'Solid': 'none', 'ShortDash': '6,2', 'ShortDot': '2,2',
      'ShortDashDot': '6,2,2,2', 'Dot': '2,6', 'Dash': '8,6',
      'LongDash': '16,6', 'DashDot': '8,6,2,6', 'LongDashDot': '16,6,2,6',
      'LongDashDotDot': '16,6,2,6,2,6',
    };
    return map[style] || 'none';
  }

  private buildGraph() {
    const nodeMap = new Map<string, any>();
    const links: any[] = [];

    const nodesData = (this.config as any).nodes || [];
    for (const n of nodesData) {
      nodeMap.set(n.id, { ...n });
    }

    for (const d of this.data) {
      const p = d as any;
      const from = p[0] ?? p.from;
      const to = p[1] ?? p.to;
      if (from !== undefined && to !== undefined) {
        if (!nodeMap.has(from)) nodeMap.set(from, { id: from, name: from });
        if (!nodeMap.has(to)) nodeMap.set(to, { id: to, name: to });
        links.push({
          source: from,
          target: to,
          value: p.y ?? p.value ?? p[2] ?? 1,
          color: p.color,
          width: p.width,
          dashStyle: p.dashStyle,
          options: p,
        });
      }
    }

    return { nodes: Array.from(nodeMap.values()), links };
  }

  getDataExtents() {
    return { xMin: 0, xMax: 0, yMin: 0, yMax: 0 };
  }

  destroy(): void {
    if (this.simulation) {
      this.simulation.stop();
      this.simulation = null;
    }
    super.destroy();
  }
}

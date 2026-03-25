import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force';
import { select } from 'd3-selection';
import { drag as d3Drag } from 'd3-drag';
import 'd3-transition';
import { BaseSeries } from '../BaseSeries';
import type { InternalSeriesConfig } from '../../types/options';

export class NetworkGraphSeries extends BaseSeries {
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

    this.simulation = forceSimulation(nodes)
      .force('link', linkForce)
      .force('charge', chargeForce)
      .force('center', forceCenter(plotArea.width / 2, plotArea.height / 2))
      .force('collide', forceCollide(20))
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
      });
    }

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
        .transition().duration(500).delay(300)
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
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5)
      .style('cursor', draggable ? 'grab' : 'pointer');

    if (animate) {
      nodeCircles.attr('r', 0)
        .transition().duration(500)
        .attr('r', (d: any) => d.marker?.radius || 10);
    } else {
      nodeCircles.attr('r', (d: any) => d.marker?.radius || 10);
    }

    if (draggable) {
      const dragBehavior = d3Drag<SVGCircleElement, any>()
        .on('start', (event: any, d: any) => {
          select(event.sourceEvent.target).style('cursor', 'grabbing');
          if (this.simulation) {
            this.simulation.alphaTarget(0.3).restart();
          }
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event: any, d: any) => {
          d.fx = event.x;
          d.fy = event.y;
          d.x = event.x;
          d.y = event.y;
          this.updatePositions(nodeCircles, linkLines, labels);
        })
        .on('end', (event: any, d: any) => {
          select(event.sourceEvent.target).style('cursor', 'grab');
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
        target.transition('size').duration(150).attr('r', baseR + 4);
        target.style('filter', 'drop-shadow(0 2px 6px rgba(0,0,0,0.3))');

        nodeCircles.interrupt('highlight');
        linkLines.interrupt('highlight');
        nodeCircles.attr('opacity', 1);
        linkLines.transition('highlight').duration(150)
          .attr('stroke-opacity', (l: any) =>
            l.source === d || l.target === d ? 0.9 : 0.1
          )
          .attr('stroke-width', (l: any) =>
            l.source === d || l.target === d ? 3 : (linkWidth ?? Math.sqrt(l.value || 1))
          );

        nodeCircles.filter((n: any) => n !== d)
          .transition('highlight').duration(150).attr('opacity', (n: any) => {
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
        target.transition('size').duration(150).attr('r', d.marker?.radius || 10);
        target.style('filter', '');

        nodeCircles.interrupt('highlight');
        linkLines.interrupt('highlight');
        linkLines.transition('highlight').duration(150)
          .attr('stroke-opacity', 0.6)
          .attr('stroke-width', (l: any) => linkWidth ?? Math.sqrt(l.value || 1));

        nodeCircles.transition('highlight').duration(150).attr('opacity', 1);

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
      .attr('font-size', '10px')
      .attr('fill', '#333')
      .style('pointer-events', 'none')
      .text((d: any) => d.name || d.id);

    if (animate) {
      labels.attr('opacity', 0)
        .transition().duration(400).delay(400)
        .attr('opacity', 1);
    }
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
      const from = (d as any)[0] || (d as any).from;
      const to = (d as any)[1] || (d as any).to;
      if (from && to) {
        if (!nodeMap.has(from)) nodeMap.set(from, { id: from, name: from });
        if (!nodeMap.has(to)) nodeMap.set(to, { id: to, name: to });
        links.push({ source: from, target: to, value: d.y ?? 1 });
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

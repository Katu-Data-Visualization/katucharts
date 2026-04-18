/**
 * Bar Chart Race series — animated horizontal bars ranked by value through time keyframes.
 * Includes play/pause button and range slider.
 */

import { select, Selection } from 'd3-selection';
import { scaleLinear } from 'd3-scale';
import { axisTop } from 'd3-axis';
import { easeLinear } from 'd3-ease';
import 'd3-transition';
import { BaseSeries } from '../BaseSeries';
import type { InternalSeriesConfig, BorderRadiusOptions } from '../../types/options';
import { DEFAULT_CHART_TEXT_COLOR, DEFAULT_CHART_TEXT_SIZE } from '../../utils/chartText';

function resolveBorderRadius(val: number | BorderRadiusOptions | undefined, fallback = 0): number {
  if (val === undefined) return fallback;
  if (typeof val === 'number') return val;
  return val.radius ?? fallback;
}

interface RaceEntry {
  name: string;
  value: number;
}

interface RaceKeyframe {
  date: string;
  values: RaceEntry[];
}

const DEFAULT_COLORS = [
  '#7cb5ec', '#434348', '#90ed7d', '#f7a35c', '#8085e9',
  '#f15c80', '#e4d354', '#2b908f', '#f45b5b', '#91e8e1',
  '#7798bf', '#aaeeee', '#ff0066', '#eeaaee', '#55bf3b',
  '#df5353', '#7798bf', '#aaeeee',
];

export class BarRaceChart extends BaseSeries {
  private keyframes: RaceKeyframe[] = [];
  private currentFrameIndex = 0;
  private colorMap = new Map<string, string>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private playing = false;

  private axisGroup!: Selection<SVGGElement, unknown, null, undefined>;
  private barsGroup!: Selection<SVGGElement, unknown, null, undefined>;
  private tickerText!: Selection<SVGTextElement, unknown, null, undefined>;
  private valueScale!: ReturnType<typeof scaleLinear<number, number>>;

  private controlsEl: HTMLDivElement | null = null;
  private playBtn: HTMLButtonElement | null = null;
  private rangeInput: HTMLInputElement | null = null;
  private rangeLabel: HTMLSpanElement | null = null;

  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  processData(): void {
    const raw = (this.config as any).data;
    if (!Array.isArray(raw)) return;

    this.keyframes = raw.filter(
      (f: any) => f && f.date && Array.isArray(f.values)
    ) as RaceKeyframe[];

    const allNames = new Set<string>();
    for (const frame of this.keyframes) {
      for (const entry of frame.values) {
        allNames.add(entry.name);
      }
    }

    const palette = (this.config as any).colors || this.context?.colors || DEFAULT_COLORS;
    let ci = 0;
    for (const name of allNames) {
      if (!this.colorMap.has(name)) {
        this.colorMap.set(name, palette[ci % palette.length]);
        ci++;
      }
    }
  }

  render(): void {
    if (this.keyframes.length === 0) return;

    const { plotArea } = this.context;
    const cfg = this.config as any;
    const controlsHeight = 40;
    const topMargin = 30;

    this.axisGroup = this.group.append('g')
      .attr('class', 'katucharts-race-axis')
      .attr('transform', `translate(0,${topMargin})`);

    this.barsGroup = this.group.append('g')
      .attr('class', 'katucharts-race-bars')
      .attr('transform', `translate(0,${topMargin + 5})`);

    this.tickerText = this.group.append('text')
      .attr('class', 'katucharts-race-ticker')
      .attr('x', plotArea.width - 10)
      .attr('y', plotArea.height - controlsHeight - 10)
      .attr('text-anchor', 'end')
      .attr('font-size', cfg.tickerFontSize || '48px')
      .attr('font-weight', 'bold')
      .attr('fill', cfg.tickerColor || '#ddd')
      .style('pointer-events', 'none');

    this.renderControls();

    this.currentFrameIndex = 0;
    this.renderFrame(0, false);

    if (cfg.autoPlay !== false) {
      this.play();
    }
  }

  private renderControls(): void {
    const container = this.group.node()?.closest('svg')?.parentElement;
    if (!container) return;

    this.controlsEl = document.createElement('div');
    this.controlsEl.style.cssText =
      'position:absolute;bottom:8px;left:12px;right:12px;display:flex;align-items:center;gap:8px;z-index:10;';

    this.playBtn = document.createElement('button');
    this.playBtn.innerHTML = this.pauseIcon();
    this.playBtn.style.cssText =
      'width:32px;height:32px;border:none;border-radius:50%;background:#2f7ed8;color:#fff;cursor:pointer;' +
      'display:flex;align-items:center;justify-content:center;padding:0;flex-shrink:0;' +
      'box-shadow:0 1px 3px rgba(0,0,0,0.2);transition:background 0.15s;';
    this.playBtn.onmouseenter = () => { if (this.playBtn) this.playBtn.style.background = '#1a5fa8'; };
    this.playBtn.onmouseleave = () => { if (this.playBtn) this.playBtn.style.background = '#2f7ed8'; };
    this.playBtn.onclick = () => {
      if (this.playing) {
        this.pause();
      } else {
        if (this.currentFrameIndex >= this.keyframes.length - 1) {
          this.restart();
        } else {
          this.play();
        }
      }
    };

    this.rangeInput = document.createElement('input');
    this.rangeInput.type = 'range';
    this.rangeInput.min = '0';
    this.rangeInput.max = String(this.keyframes.length - 1);
    this.rangeInput.value = '0';
    this.rangeInput.style.cssText =
      'flex:1;height:4px;cursor:pointer;accent-color:#2f7ed8;';
    this.rangeInput.oninput = () => {
      const idx = parseInt(this.rangeInput!.value, 10);
      const wasPlaying = this.playing;
      if (wasPlaying) this.pause();
      this.goToFrame(idx);
      if (wasPlaying) this.play();
    };

    this.rangeLabel = document.createElement('span');
    this.rangeLabel.style.cssText =
      'font-size:11px;color:#666;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;' +
      'min-width:30px;text-align:right;flex-shrink:0;';
    this.rangeLabel.textContent = this.keyframes[0]?.date || '';

    this.controlsEl.appendChild(this.playBtn);
    this.controlsEl.appendChild(this.rangeInput);
    this.controlsEl.appendChild(this.rangeLabel);
    container.appendChild(this.controlsEl);
  }

  private updateControls(): void {
    if (this.rangeInput) {
      this.rangeInput.value = String(this.currentFrameIndex);
    }
    if (this.rangeLabel && this.keyframes[this.currentFrameIndex]) {
      this.rangeLabel.textContent = this.keyframes[this.currentFrameIndex].date;
    }
    if (this.playBtn) {
      this.playBtn.innerHTML = this.playing ? this.pauseIcon() : this.playIcon();
    }
  }

  private playIcon(): string {
    return '<svg width="14" height="14" viewBox="0 0 14 14"><polygon points="3,1 12,7 3,13" fill="currentColor"/></svg>';
  }

  private pauseIcon(): string {
    return '<svg width="14" height="14" viewBox="0 0 14 14"><rect x="2" y="1" width="3.5" height="12" rx="0.5" fill="currentColor"/><rect x="8.5" y="1" width="3.5" height="12" rx="0.5" fill="currentColor"/></svg>';
  }

  private renderFrame(index: number, animate: boolean): void {
    if (index < 0 || index >= this.keyframes.length) return;

    const { plotArea } = this.context;
    const cfg = this.config as any;
    const barsToShow = cfg.barsToShow ?? 12;
    const barPadding = cfg.barPadding ?? 0.1;
    const borderRadius = resolveBorderRadius(cfg.borderRadius, 3);
    const frameDuration = cfg.frameDuration ?? 500;
    const dur = animate ? (cfg.transitionDuration ?? frameDuration) : 0;
    const topMargin = 35;
    const controlsHeight = 40;
    const availableHeight = plotArea.height - topMargin - controlsHeight - 20;

    const frame = this.keyframes[index];
    const sorted = [...frame.values].sort((a, b) => b.value - a.value);
    const visible = sorted.slice(0, barsToShow);

    const maxValue = visible.length > 0 ? visible[0].value : 1;
    this.valueScale = scaleLinear<number, number>()
      .domain([0, maxValue * 1.1])
      .range([0, plotArea.width - 80]);

    this.renderAxis(dur);

    const barHeight = (availableHeight / barsToShow) * (1 - barPadding);
    const barStep = availableHeight / barsToShow;

    const keyFn = (d: RaceEntry) => d.name;

    const bars = this.barsGroup.selectAll<SVGGElement, RaceEntry>('.katucharts-race-bar')
      .data(visible, keyFn);

    // --- ENTER ---
    const entering = bars.enter().append('g')
      .attr('class', 'katucharts-race-bar')
      .attr('transform', (_d: RaceEntry, i: number) =>
        `translate(0,${animate ? availableHeight + barHeight : i * barStep})`
      )
      .style('opacity', animate ? 0 : 1);

    entering.append('rect')
      .attr('height', barHeight)
      .attr('rx', borderRadius)
      .attr('width', (d: RaceEntry) => animate ? 0 : Math.max(0, this.valueScale(d.value)))
      .attr('fill', (d: RaceEntry) => this.colorMap.get(d.name) || '#999');

    entering.append('text')
      .attr('class', 'katucharts-race-label')
      .attr('x', 6)
      .attr('y', barHeight / 2)
      .attr('dy', '0.35em')
      .attr('fill', '#fff')
      .attr('font-weight', 'bold')
      .attr('font-size', DEFAULT_CHART_TEXT_SIZE)
      .style('pointer-events', 'none')
      .text((d: RaceEntry) => d.name);

    entering.append('text')
      .attr('class', 'katucharts-race-value')
      .attr('y', barHeight / 2)
      .attr('dy', '0.35em')
      .attr('fill', DEFAULT_CHART_TEXT_COLOR)
      .attr('font-weight', 'bold')
      .attr('font-size', DEFAULT_CHART_TEXT_SIZE)
      .style('pointer-events', 'none')
      .attr('data-value', (d: RaceEntry) => d.value)
      .attr('x', (d: RaceEntry) => Math.max(0, this.valueScale(d.value)) + 5)
      .text((d: RaceEntry) => d.value.toLocaleString());

    // --- UPDATE + ENTER (merged) ---
    const merged = entering.merge(bars);

    if (dur > 0) {
      merged.transition().duration(dur).ease(easeLinear)
        .attr('transform', (_d: RaceEntry, i: number) => `translate(0,${i * barStep})`)
        .style('opacity', 1);

      merged.select('rect')
        .transition().duration(dur).ease(easeLinear)
        .attr('width', (d: RaceEntry) => Math.max(0, this.valueScale(d.value)))
        .attr('fill', (d: RaceEntry) => this.colorMap.get(d.name) || '#999');

      merged.select('.katucharts-race-value')
        .transition().duration(dur).ease(easeLinear)
        .attr('x', (d: RaceEntry) => Math.max(0, this.valueScale(d.value)) + 5)
        .tween('text', function(d: RaceEntry) {
          const node = this as SVGTextElement;
          const prev = parseFloat(node.getAttribute('data-value') || '0');
          const next = d.value;
          return (t: number) => {
            const current = Math.round(prev + (next - prev) * t);
            node.textContent = current.toLocaleString();
            node.setAttribute('data-value', String(current));
          };
        });
    } else {
      merged
        .attr('transform', (_d: RaceEntry, i: number) => `translate(0,${i * barStep})`)
        .style('opacity', 1);

      merged.select('rect')
        .attr('width', (d: RaceEntry) => Math.max(0, this.valueScale(d.value)))
        .attr('fill', (d: RaceEntry) => this.colorMap.get(d.name) || '#999');

      merged.select('.katucharts-race-value')
        .attr('x', (d: RaceEntry) => Math.max(0, this.valueScale(d.value)) + 5)
        .attr('data-value', (d: RaceEntry) => d.value)
        .text((d: RaceEntry) => d.value.toLocaleString());
    }

    merged.select('.katucharts-race-label')
      .style('display', (d: RaceEntry) =>
        this.valueScale(d.value) < 50 ? 'none' : ''
      );

    // --- EXIT ---
    const exiting = bars.exit();
    if (dur > 0) {
      exiting.transition().duration(dur).ease(easeLinear)
        .attr('transform', `translate(0,${availableHeight + barHeight})`)
        .style('opacity', 0)
        .remove();
    } else {
      exiting.remove();
    }

    this.tickerText.text(frame.date);
    this.updateControls();

    this.attachBarHoverEffects(merged, barHeight);
  }

  private renderAxis(transitionDuration: number): void {
    const axis = axisTop(this.valueScale)
      .ticks(5)
      .tickSize(-this.context.plotArea.height + 110)
      .tickFormat((d) => {
        const n = d as number;
        if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
        if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
        if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
        return n.toString();
      });

    if (transitionDuration > 0) {
      (this.axisGroup.transition().duration(transitionDuration).ease(easeLinear) as any).call(axis);
    } else {
      this.axisGroup.call(axis);
    }

    this.axisGroup.select('.domain').remove();
    this.axisGroup.selectAll('.tick line')
      .attr('stroke', '#e0e0e0')
      .attr('stroke-dasharray', '2,2');
    this.axisGroup.selectAll('.tick text')
      .attr('fill', DEFAULT_CHART_TEXT_COLOR)
      .attr('font-size', DEFAULT_CHART_TEXT_SIZE);
  }

  private attachBarHoverEffects(
    barGroups: Selection<SVGGElement, RaceEntry, SVGGElement, unknown>,
    barHeight: number
  ): void {
    const self = this;
    barGroups
      .style('cursor', 'pointer')
      .on('mouseover', function(event: MouseEvent, d: RaceEntry) {
        const target = select(this);
        const rect = target.select('rect');
        const origFill = rect.attr('fill');
        rect.attr('data-orig-fill', origFill);
        rect.attr('fill', self.brightenColor(origFill, 0.1));
        rect.style('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))');

        barGroups.filter((other: RaceEntry) => other.name !== d.name)
          .style('opacity', '0.5');

        self.context.events.emit('point:mouseover', {
          point: { name: d.name, y: d.value },
          index: 0,
          series: self,
          event,
          plotX: self.valueScale(d.value),
          plotY: 0,
        });
      })
      .on('mouseout', function(event: MouseEvent, d: RaceEntry) {
        const target = select(this);
        const rect = target.select('rect');
        const origFill = rect.attr('data-orig-fill') || '';
        rect.attr('fill', origFill);
        rect.style('filter', '');

        barGroups.style('opacity', '');

        self.context.events.emit('point:mouseout', {
          point: { name: d.name, y: d.value },
          index: 0,
          series: self,
          event,
        });
      });
  }

  play(): void {
    if (this.playing) return;
    this.playing = true;
    this.updateControls();

    const cfg = this.config as any;
    const frameDuration = cfg.frameDuration ?? 500;

    this.timer = setInterval(() => {
      this.currentFrameIndex++;
      if (this.currentFrameIndex >= this.keyframes.length) {
        if (cfg.loop) {
          this.currentFrameIndex = 0;
        } else {
          this.currentFrameIndex = this.keyframes.length - 1;
          this.pause();
          return;
        }
      }
      this.renderFrame(this.currentFrameIndex, true);
    }, frameDuration);
  }

  pause(): void {
    this.playing = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.updateControls();
  }

  restart(): void {
    this.pause();
    this.currentFrameIndex = 0;
    this.renderFrame(0, true);
    this.play();
  }

  goToFrame(index: number): void {
    if (index < 0 || index >= this.keyframes.length) return;
    this.currentFrameIndex = index;
    this.renderFrame(index, true);
  }

  getDataExtents() {
    return { xMin: 0, xMax: 0, yMin: 0, yMax: 0 };
  }

  destroy(): void {
    this.pause();
    if (this.controlsEl) {
      this.controlsEl.remove();
      this.controlsEl = null;
    }
    super.destroy();
  }

  private brightenColor(color: string, amount: number): string {
    const match = color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (match) {
      const r = Math.min(255, parseInt(match[1], 16) + Math.round(255 * amount));
      const g = Math.min(255, parseInt(match[2], 16) + Math.round(255 * amount));
      const b = Math.min(255, parseInt(match[3], 16) + Math.round(255 * amount));
      return `rgb(${r},${g},${b})`;
    }
    return color;
  }
}

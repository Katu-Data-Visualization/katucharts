import { zoom, zoomIdentity, type ZoomBehavior } from 'd3-zoom';
import { Selection } from 'd3-selection';
import type { PlotArea } from '../types/options';
import { EventBus } from '../core/EventBus';

export type ZoomType = 'x' | 'y' | 'xy';

export interface ZoomConfig {
  type: ZoomType;
  key?: 'ctrl' | 'alt' | 'shift' | 'meta';
  mouseWheel?: boolean | { enabled?: boolean; sensitivity?: number };
  pinchType?: 'x' | 'y' | 'xy';
  resetButton?: {
    position?: { align?: string; verticalAlign?: string; x?: number; y?: number };
    theme?: Record<string, any>;
    relativeTo?: 'plot' | 'chart';
  };
  panning?: boolean | { enabled?: boolean; type?: 'x' | 'y' | 'xy' };
  panKey?: 'ctrl' | 'alt' | 'shift' | 'meta';
  selectionHandler?: (event: SelectionEvent) => boolean | void;
  selectionMarkerFill?: string;
}

export interface SelectionEvent {
  xAxis: { min: number; max: number }[];
  yAxis: { min: number; max: number }[];
  originalEvent: MouseEvent;
  preventDefault: () => void;
}

export class Zoom {
  private zoomBehavior: ZoomBehavior<SVGGElement, unknown>;
  private resetButton: HTMLButtonElement | null = null;
  private zoomKey: string | undefined;
  private panKey: string | undefined;
  private panningEnabled: boolean;
  private panningType: string;
  private selectionRect: Selection<SVGRectElement, unknown, null, undefined> | null = null;
  private selectionStart: { x: number; y: number } | null = null;
  private resetClickHandler: (() => void) | null = null;

  constructor(
    config: ZoomConfig | ZoomType,
    plotGroup: Selection<SVGGElement, unknown, null, undefined>,
    plotArea: PlotArea,
    container: HTMLElement,
    events: EventBus
  ) {
    const cfg: ZoomConfig = typeof config === 'string' ? { type: config } : config;
    this.zoomKey = cfg.key;
    this.panKey = cfg.panKey;

    const panCfg = cfg.panning;
    if (typeof panCfg === 'object') {
      this.panningEnabled = panCfg.enabled !== false;
      this.panningType = panCfg.type || cfg.type;
    } else {
      this.panningEnabled = panCfg === true;
      this.panningType = cfg.type;
    }

    const mouseWheelEnabled = this.isMouseWheelEnabled(cfg.mouseWheel);
    const sensitivity = this.getMouseWheelSensitivity(cfg.mouseWheel);

    this.zoomBehavior = zoom<SVGGElement, unknown>()
      .scaleExtent([1, 20])
      .extent([[0, 0], [plotArea.width, plotArea.height]])
      .translateExtent([[0, 0], [plotArea.width, plotArea.height]])
      .on('zoom', (event) => {
        const transform = event.transform;
        events.emit('zoom:changed', { type: cfg.type, transform });
      });

    if (this.zoomKey) {
      this.zoomBehavior.filter((event: any) => {
        if (event.type === 'wheel') return mouseWheelEnabled;
        if (event.type === 'mousedown' || event.type === 'touchstart') {
          return this.isKeyPressed(event, this.zoomKey!);
        }
        return true;
      });
    } else if (!mouseWheelEnabled) {
      this.zoomBehavior.filter((event: any) => {
        return event.type !== 'wheel';
      });
    }

    plotGroup.call(this.zoomBehavior);

    if (sensitivity !== 1 && mouseWheelEnabled) {
      plotGroup.on('wheel.zoom', (event: WheelEvent) => {
        event.preventDefault();
        const currentTransform = (plotGroup.node() as any).__zoom || zoomIdentity;
        const scaleFactor = event.deltaY > 0 ? 1 / (1 + 0.1 * sensitivity) : 1 + 0.1 * sensitivity;
        const newK = Math.max(1, Math.min(20, currentTransform.k * scaleFactor));

        plotGroup.transition().duration(100)
          .call(this.zoomBehavior.scaleTo as any, newK);
      });
    }

    if (cfg.selectionHandler) {
      this.setupSelectionZoom(plotGroup, plotArea, cfg, events);
    }

    if (this.panningEnabled && this.panKey) {
      this.setupPanning(plotGroup, plotArea, events);
    }

    this.resetButton = this.createResetButton(cfg.resetButton);
    this.resetClickHandler = () => {
      plotGroup.transition().duration(300).call(this.zoomBehavior.transform as any, zoomIdentity);
      this.resetButton!.style.display = 'none';
    };
    this.resetButton.addEventListener('click', this.resetClickHandler);

    container.appendChild(this.resetButton);

    events.on('zoom:changed', () => {
      if (this.resetButton) this.resetButton.style.display = 'block';
    });
  }

  private setupSelectionZoom(
    plotGroup: Selection<SVGGElement, unknown, null, undefined>,
    plotArea: PlotArea,
    cfg: ZoomConfig,
    events: EventBus
  ): void {
    plotGroup.on('mousedown.selection', (event: MouseEvent) => {
      if (this.zoomKey && !this.isKeyPressed(event, this.zoomKey)) return;
      if (this.panKey && this.isKeyPressed(event, this.panKey)) return;

      const rect = (plotGroup.node() as SVGGElement).getBoundingClientRect();
      this.selectionStart = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };

      const selFill = cfg.selectionMarkerFill || 'rgba(51,92,173,0.25)';
      this.selectionRect = plotGroup.append('rect')
        .attr('class', 'katucharts-selection')
        .attr('fill', selFill)
        .attr('stroke', '#4572a7')
        .attr('stroke-width', 1)
        .attr('x', this.selectionStart.x)
        .attr('y', 0)
        .attr('width', 0)
        .attr('height', plotArea.height);
    });

    plotGroup.on('mousemove.selection', (event: MouseEvent) => {
      if (!this.selectionStart || !this.selectionRect) return;

      const rect = (plotGroup.node() as SVGGElement).getBoundingClientRect();
      const currentX = event.clientX - rect.left;
      const x = Math.min(this.selectionStart.x, currentX);
      const w = Math.abs(currentX - this.selectionStart.x);

      this.selectionRect.attr('x', x).attr('width', w);

      if (cfg.type === 'xy' || cfg.type === 'y') {
        const currentY = event.clientY - rect.top;
        const y = Math.min(this.selectionStart.y, currentY);
        const h = Math.abs(currentY - this.selectionStart.y);
        this.selectionRect.attr('y', y).attr('height', h);
      }
    });

    plotGroup.on('mouseup.selection', (event: MouseEvent) => {
      if (!this.selectionStart || !this.selectionRect) return;

      const rect = (plotGroup.node() as SVGGElement).getBoundingClientRect();
      const endX = event.clientX - rect.left;
      const endY = event.clientY - rect.top;

      this.selectionRect.remove();
      this.selectionRect = null;

      if (Math.abs(endX - this.selectionStart.x) < 5) {
        this.selectionStart = null;
        return;
      }

      let prevented = false;
      const selEvent: SelectionEvent = {
        xAxis: [{
          min: Math.min(this.selectionStart.x, endX),
          max: Math.max(this.selectionStart.x, endX),
        }],
        yAxis: [{
          min: Math.min(this.selectionStart.y, endY),
          max: Math.max(this.selectionStart.y, endY),
        }],
        originalEvent: event,
        preventDefault: () => { prevented = true; },
      };

      if (cfg.selectionHandler) {
        cfg.selectionHandler(selEvent);
      }

      if (!prevented) {
        events.emit('chart:selection', selEvent);
      }

      this.selectionStart = null;
    });
  }

  private setupPanning(
    plotGroup: Selection<SVGGElement, unknown, null, undefined>,
    plotArea: PlotArea,
    events: EventBus
  ): void {
    let panStart: { x: number; y: number } | null = null;
    let panTransform = { x: 0, y: 0 };

    plotGroup.on('mousedown.pan', (event: MouseEvent) => {
      if (!this.panKey || !this.isKeyPressed(event, this.panKey)) return;
      event.preventDefault();
      panStart = { x: event.clientX - panTransform.x, y: event.clientY - panTransform.y };
      plotGroup.style('cursor', 'grabbing');
    });

    plotGroup.on('mousemove.pan', (event: MouseEvent) => {
      if (!panStart) return;
      let dx = event.clientX - panStart.x;
      let dy = event.clientY - panStart.y;

      if (this.panningType === 'x') dy = 0;
      if (this.panningType === 'y') dx = 0;

      panTransform = { x: dx, y: dy };
      events.emit('zoom:panned', { dx, dy, type: this.panningType });
    });

    plotGroup.on('mouseup.pan', () => {
      if (panStart) {
        panStart = null;
        plotGroup.style('cursor', '');
      }
    });
  }

  private isKeyPressed(event: any, key: string): boolean {
    switch (key) {
      case 'ctrl': return event.ctrlKey;
      case 'alt': return event.altKey;
      case 'shift': return event.shiftKey;
      case 'meta': return event.metaKey;
      default: return true;
    }
  }

  private isMouseWheelEnabled(opt: ZoomConfig['mouseWheel']): boolean {
    if (opt === false) return false;
    if (typeof opt === 'object' && opt.enabled === false) return false;
    return true;
  }

  private getMouseWheelSensitivity(opt: ZoomConfig['mouseWheel']): number {
    if (typeof opt === 'object' && opt.sensitivity !== undefined) return opt.sensitivity;
    return 1;
  }

  private createResetButton(cfg?: ZoomConfig['resetButton']): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = 'Reset zoom';

    const theme = cfg?.theme || {};
    const pos = cfg?.position || {};
    const topVal = pos.y ?? 5;
    const rightVal = pos.x !== undefined ? `${pos.x}px` : '5px';

    Object.assign(btn.style, {
      position: 'absolute',
      top: `${topVal}px`,
      right: rightVal,
      padding: theme.padding || '3px 8px',
      fontSize: theme.fontSize || '11px',
      border: theme.border || '1px solid #ccc',
      borderRadius: theme.borderRadius || '3px',
      backgroundColor: theme.backgroundColor || '#f9f9f9',
      color: theme.color || '#333',
      cursor: 'pointer',
      display: 'none',
      zIndex: '5',
    });

    return btn;
  }

  destroy(): void {
    if (this.resetButton) {
      if (this.resetClickHandler) this.resetButton.removeEventListener('click', this.resetClickHandler);
      this.resetButton.remove();
    }
  }
}

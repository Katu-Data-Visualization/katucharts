/**
 * Thin wrappers for connecting WebSocket, SSE, and polling data sources
 * to KatuCharts series instances.
 */
import type { PointOptions } from '../types/options';

export interface StreamSubscription {
  unsubscribe(): void;
}

export class StreamAdapter {
  /**
   * Connect a WebSocket to a series, parsing each message into points.
   */
  static fromWebSocket(
    ws: WebSocket,
    series: { addPoint(p: PointOptions, redraw?: boolean, shift?: boolean): void; addPoints?(pts: PointOptions[], redraw?: boolean, shift?: boolean): void },
    parseMessage: (data: any) => PointOptions | PointOptions[],
    options?: { shift?: boolean }
  ): StreamSubscription {
    const shift = options?.shift ?? false;
    const handler = (event: MessageEvent) => {
      const parsed = parseMessage(JSON.parse(event.data));
      if (Array.isArray(parsed)) {
        if (series.addPoints) {
          series.addPoints(parsed, true, shift);
        } else {
          for (const p of parsed) series.addPoint(p, false, shift);
          series.addPoint(parsed[parsed.length - 1], true, shift);
        }
      } else {
        series.addPoint(parsed, true, shift);
      }
    };
    ws.addEventListener('message', handler);
    return { unsubscribe: () => ws.removeEventListener('message', handler) };
  }

  /**
   * Connect an EventSource (SSE) to a series.
   */
  static fromEventSource(
    source: EventSource,
    series: { addPoint(p: PointOptions, redraw?: boolean, shift?: boolean): void },
    eventName: string,
    parseMessage: (data: string) => PointOptions,
    options?: { shift?: boolean }
  ): StreamSubscription {
    const shift = options?.shift ?? false;
    const handler = (event: MessageEvent) => {
      const point = parseMessage(event.data);
      series.addPoint(point, true, shift);
    };
    source.addEventListener(eventName, handler);
    return { unsubscribe: () => source.removeEventListener(eventName, handler) };
  }

  /**
   * Create a polling adapter that fetches new data at a regular interval.
   */
  static fromPolling(
    fetchFn: () => Promise<PointOptions | PointOptions[]>,
    series: { addPoint(p: PointOptions, redraw?: boolean, shift?: boolean): void; addPoints?(pts: PointOptions[], redraw?: boolean, shift?: boolean): void },
    intervalMs: number,
    options?: { shift?: boolean }
  ): StreamSubscription {
    const shift = options?.shift ?? false;
    let active = true;
    const poll = async () => {
      if (!active) return;
      try {
        const result = await fetchFn();
        if (!active) return;
        if (Array.isArray(result)) {
          if (series.addPoints) {
            series.addPoints(result, true, shift);
          } else {
            for (const p of result) series.addPoint(p, true, shift);
          }
        } else {
          series.addPoint(result, true, shift);
        }
      } catch (_) { /* silently skip failed polls */ }
      if (active) setTimeout(poll, intervalMs);
    };
    setTimeout(poll, intervalMs);
    return { unsubscribe: () => { active = false; } };
  }
}

/**
 * Sits between data mutations and DOM rendering.
 * Batches updates and flushes via requestAnimationFrame with configurable FPS cap.
 */
import type { StreamingOptions } from '../types/options';

export type UpdateType = 'addPoint' | 'addPoints' | 'setData' | 'removePoint' | 'updateSeries';

export interface UpdateEntry {
  type: UpdateType;
  payload: any;
}

export class UpdateBatch {
  entries: UpdateEntry[] = [];

  add(type: UpdateType, payload: any): void {
    if (type === 'setData') {
      this.entries = [{ type, payload }];
      return;
    }
    this.entries.push({ type, payload });
  }

  get isEmpty(): boolean {
    return this.entries.length === 0;
  }
}

export class UpdateScheduler {
  private pendingUpdates = new Map<any, UpdateBatch>();
  private rafId: number | null = null;
  private lastFrameTime = 0;
  private maxFps: number;
  private flushCallback: () => void;

  constructor(options: StreamingOptions, flushCallback: () => void) {
    this.maxFps = options.maxFps ?? 30;
    this.flushCallback = flushCallback;
  }

  schedule(series: any, type: UpdateType, payload: any): void {
    let batch = this.pendingUpdates.get(series);
    if (!batch) {
      batch = new UpdateBatch();
      this.pendingUpdates.set(series, batch);
    }
    batch.add(type, payload);
    this.requestFrame();
  }

  private requestFrame(): void {
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      const now = performance.now();
      const minInterval = 1000 / this.maxFps;
      if (now - this.lastFrameTime < minInterval) {
        this.rafId = requestAnimationFrame(() => {
          this.rafId = null;
          this.lastFrameTime = performance.now();
          this.flush();
        });
        return;
      }
      this.lastFrameTime = now;
      this.flush();
    });
  }

  flush(): void {
    if (this.pendingUpdates.size === 0) return;

    for (const [series, batch] of this.pendingUpdates) {
      if (!batch.isEmpty) {
        series.applyBatch(batch);
      }
    }
    this.pendingUpdates.clear();
    this.flushCallback();
  }

  destroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.pendingUpdates.clear();
  }

  get hasPending(): boolean {
    return this.pendingUpdates.size > 0;
  }
}

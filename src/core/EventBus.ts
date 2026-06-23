/**
 * Central event system for KatuCharts.
 */

type EventCallback = (...args: any[]) => void;

interface EventEntry {
  callback: EventCallback;
  once: boolean;
}

export class EventBus {
  private listeners = new Map<string, EventEntry[]>();

  on(event: string, callback: EventCallback): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push({ callback, once: false });
    return this;
  }

  once(event: string, callback: EventCallback): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push({ callback, once: true });
    return this;
  }

  off(event: string, callback?: EventCallback): this {
    if (!callback) {
      this.listeners.delete(event);
      return this;
    }
    const entries = this.listeners.get(event);
    if (entries) {
      this.listeners.set(event, entries.filter(e => e.callback !== callback));
    }
    return this;
  }

  emit(event: string, ...args: any[]): this {
    const entries = this.listeners.get(event);
    if (!entries) return this;

    const toRemove: EventEntry[] = [];
    for (const entry of entries) {
      entry.callback(...args);
      if (entry.once) toRemove.push(entry);
    }

    if (toRemove.length) {
      this.listeners.set(event, entries.filter(e => !toRemove.includes(e)));
    }
    return this;
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }

  static mapEvent(context: string, eventName: string): string {
    return `${context}:${eventName.toLowerCase()}`;
  }
}

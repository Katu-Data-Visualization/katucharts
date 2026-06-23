/**
 * Fixed-capacity ring buffer for bounded data storage.
 * Evicts oldest items when capacity is reached.
 */
export class CircularBuffer<T> {
  private buffer: T[];
  private head = 0;
  private _size = 0;
  private capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  /**
   * Push an item, returning the evicted item if at capacity.
   */
  push(item: T): T | undefined {
    const evicted = this._size === this.capacity ? this.buffer[this.head] : undefined;
    const writeIdx = (this.head + this._size) % this.capacity;
    this.buffer[writeIdx] = item;
    if (this._size < this.capacity) {
      this._size++;
    } else {
      this.head = (this.head + 1) % this.capacity;
    }
    return evicted;
  }

  /**
   * Push multiple items, returning all evicted items.
   */
  pushMany(items: T[]): T[] {
    const evicted: T[] = [];
    for (const item of items) {
      const e = this.push(item);
      if (e !== undefined) evicted.push(e);
    }
    return evicted;
  }

  get size(): number { return this._size; }
  get isFull(): boolean { return this._size === this.capacity; }

  get(index: number): T | undefined {
    if (index < 0 || index >= this._size) return undefined;
    return this.buffer[(this.head + index) % this.capacity];
  }

  toArray(): T[] {
    const result = new Array(this._size);
    for (let i = 0; i < this._size; i++) {
      result[i] = this.buffer[(this.head + i) % this.capacity];
    }
    return result;
  }

  clear(): void {
    this.head = 0;
    this._size = 0;
  }
}

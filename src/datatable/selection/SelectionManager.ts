/**
 * Row selection state management.
 */

import type { SelectionMode, ProcessedRow } from '../../types/datatable-options';
import type { EventBus } from '../../core/EventBus';

export class SelectionManager {
  private mode: SelectionMode;
  private selectedIndices = new Set<number>();
  private events: EventBus;
  private preserveOnFilter: boolean;
  private lastClickedIndex: number = -1;

  constructor(mode: SelectionMode, events: EventBus, preserveOnFilter = false) {
    this.mode = mode;
    this.events = events;
    this.preserveOnFilter = preserveOnFilter;
  }

  handleRowClick(
    rowIndex: number,
    row: any,
    event: MouseEvent
  ): void {
    if (this.mode === 'none') return;

    const wasSelected = this.selectedIndices.has(rowIndex);
    const added: any[] = [];
    const removed: any[] = [];

    if (this.mode === 'single') {
      for (const idx of this.selectedIndices) {
        if (idx !== rowIndex) removed.push(idx);
      }
      this.selectedIndices.clear();

      if (!wasSelected) {
        this.selectedIndices.add(rowIndex);
        added.push(row);
      } else {
        removed.push(row);
      }
    } else if (this.mode === 'multi') {
      if (event.shiftKey && this.lastClickedIndex >= 0) {
        const start = Math.min(this.lastClickedIndex, rowIndex);
        const end = Math.max(this.lastClickedIndex, rowIndex);
        for (let i = start; i <= end; i++) {
          if (!this.selectedIndices.has(i)) {
            this.selectedIndices.add(i);
          }
        }
      } else if (event.ctrlKey || event.metaKey) {
        if (wasSelected) {
          this.selectedIndices.delete(rowIndex);
          removed.push(row);
        } else {
          this.selectedIndices.add(rowIndex);
          added.push(row);
        }
      } else {
        for (const idx of this.selectedIndices) {
          if (idx !== rowIndex) removed.push(idx);
        }
        this.selectedIndices.clear();
        if (!wasSelected) {
          this.selectedIndices.add(rowIndex);
          added.push(row);
        }
      }
    }

    this.lastClickedIndex = rowIndex;
    this.emitChange(added, removed);
  }

  handleCheckboxToggle(rowIndex: number, row: any, checked: boolean): void {
    if (checked) {
      this.selectedIndices.add(rowIndex);
      this.emitChange([row], []);
    } else {
      this.selectedIndices.delete(rowIndex);
      this.emitChange([], [row]);
    }
  }

  selectAll(rows: ProcessedRow[]): void {
    const added: any[] = [];
    for (const row of rows) {
      if (row._type === 'data' && !this.selectedIndices.has(row._originalIndex)) {
        this.selectedIndices.add(row._originalIndex);
        added.push(row._data);
      }
    }
    if (added.length) this.emitChange(added, []);
  }

  deselectAll(): void {
    const removed = Array.from(this.selectedIndices);
    this.selectedIndices.clear();
    if (removed.length) this.emitChange([], removed as any[]);
  }

  selectRow(index: number | number[]): void {
    const indices = Array.isArray(index) ? index : [index];
    const added: number[] = [];
    for (const i of indices) {
      if (!this.selectedIndices.has(i)) {
        this.selectedIndices.add(i);
        added.push(i);
      }
    }
    if (added.length) this.emitChange(added as any[], []);
  }

  deselectRow(index: number | number[]): void {
    const indices = Array.isArray(index) ? index : [index];
    const removed: number[] = [];
    for (const i of indices) {
      if (this.selectedIndices.delete(i)) {
        removed.push(i);
      }
    }
    if (removed.length) this.emitChange([], removed as any[]);
  }

  isSelected(index: number): boolean {
    return this.selectedIndices.has(index);
  }

  getSelectedIndices(): number[] {
    return Array.from(this.selectedIndices).sort((a, b) => a - b);
  }

  getSelectedData(allData: any[]): any[] {
    return this.getSelectedIndices()
      .filter(i => i >= 0 && i < allData.length)
      .map(i => allData[i]);
  }

  getCount(): number {
    return this.selectedIndices.size;
  }

  isAllSelected(totalVisible: number): boolean {
    return totalVisible > 0 && this.selectedIndices.size >= totalVisible;
  }

  isSomeSelected(): boolean {
    return this.selectedIndices.size > 0;
  }

  clearOnFilter(): void {
    if (!this.preserveOnFilter) {
      this.selectedIndices.clear();
    }
  }

  setMode(mode: SelectionMode): void {
    this.mode = mode;
    if (mode === 'none') this.selectedIndices.clear();
    if (mode === 'single' && this.selectedIndices.size > 1) {
      const first = this.selectedIndices.values().next().value;
      this.selectedIndices.clear();
      if (first !== undefined) this.selectedIndices.add(first);
    }
  }

  private emitChange(added: any[], removed: any[]): void {
    this.events.emit('selection:change', {
      selected: Array.from(this.selectedIndices),
      added,
      removed,
    });
  }

  destroy(): void {
    this.selectedIndices.clear();
  }
}

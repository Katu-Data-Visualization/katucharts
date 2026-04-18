/**
 * Column state management: visibility, reordering, pinning.
 */

import type { InternalColumnDef, PinDirection } from '../../types/datatable-options';
import type { EventBus } from '../../core/EventBus';
import { computePinnedOffsets } from './ColumnDef';

export class ColumnManager {
  private columns: InternalColumnDef[];
  private events: EventBus;
  private responsiveHidden = new Set<string>();

  constructor(columns: InternalColumnDef[], events: EventBus) {
    this.columns = columns;
    this.events = events;
  }

  getColumns(): InternalColumnDef[] {
    return this.columns;
  }

  setColumns(columns: InternalColumnDef[]): void {
    this.columns = columns;
  }

  getVisibleColumns(): InternalColumnDef[] {
    return this.columns.filter(c => c._visible);
  }

  showColumn(field: string): void {
    const col = this.find(field);
    if (col) {
      col._visible = true;
      col.visible = true;
      this.responsiveHidden.delete(field);
      this.recalcPinning();
      this.events.emit('column:show', { field });
    }
  }

  hideColumn(field: string): void {
    const col = this.find(field);
    if (col) {
      col._visible = false;
      col.visible = false;
      this.recalcPinning();
      this.events.emit('column:hide', { field });
    }
  }

  toggleColumn(field: string, visible: boolean): void {
    if (visible) this.showColumn(field);
    else this.hideColumn(field);
  }

  pinColumn(field: string, direction: PinDirection): void {
    const col = this.find(field);
    if (col) {
      col.pinned = direction;
      this.recalcPinning();
      this.events.emit('column:pin', { field, direction });
    }
  }

  reorderColumn(fromField: string, toIndex: number): void {
    const fromIdx = this.columns.findIndex(c => c.field === fromField);
    if (fromIdx < 0 || toIndex < 0 || toIndex >= this.columns.length) return;

    const [col] = this.columns.splice(fromIdx, 1);
    this.columns.splice(toIndex, 0, col);

    this.columns.forEach((c, i) => { c._index = i; });
    this.recalcPinning();
    this.events.emit('column:reorder', { field: fromField, fromIndex: fromIdx, toIndex });
  }

  resizeColumn(field: string, width: number): void {
    const col = this.find(field);
    if (col) {
      col._computedWidth = Math.max(col.minWidth ?? 40, Math.min(col.maxWidth ?? 2000, width));
      this.recalcPinning();
    }
  }

  updateColumn(field: string, updates: Partial<InternalColumnDef>): void {
    const col = this.find(field);
    if (col) {
      Object.assign(col, updates);
      if (updates.visible !== undefined) col._visible = updates.visible;
      this.recalcPinning();
    }
  }

  applyResponsiveHiding(containerWidth: number): string[] {
    const visible = this.columns.filter(c => c._visible && !this.responsiveHidden.has(c.field));
    const totalWidth = visible.reduce((sum, c) => sum + c._computedWidth, 0);

    const hidden: string[] = [];

    if (totalWidth > containerWidth) {
      const sortedByPriority = [...visible]
        .filter(c => c.priority !== undefined)
        .sort((a, b) => (a.priority ?? Infinity) - (b.priority ?? Infinity));

      let currentWidth = totalWidth;
      for (const col of sortedByPriority) {
        if (currentWidth <= containerWidth) break;
        col._visible = false;
        this.responsiveHidden.add(col.field);
        currentWidth -= col._computedWidth;
        hidden.push(col.field);
      }
    } else {
      for (const field of this.responsiveHidden) {
        const col = this.find(field);
        if (col && col.visible !== false) {
          col._visible = true;
          this.responsiveHidden.delete(field);
        }
      }
    }

    if (hidden.length) this.recalcPinning();
    return hidden;
  }

  setSortState(sort: Array<{ column: string; direction: 'asc' | 'desc' | null }>): void {
    for (const col of this.columns) {
      col._sortDirection = null;
      col._sortPriority = -1;
    }

    sort.forEach(({ column, direction }, i) => {
      const col = this.find(column);
      if (col) {
        col._sortDirection = direction;
        col._sortPriority = sort.length > 1 ? i : -1;
      }
    });
  }

  setFilterValue(field: string, value: any): void {
    const col = this.find(field);
    if (col) col._filterValue = value;
  }

  clearFilters(): void {
    for (const col of this.columns) {
      col._filterValue = null;
    }
  }

  private find(field: string): InternalColumnDef | undefined {
    return this.columns.find(c => c.field === field);
  }

  private recalcPinning(): void {
    computePinnedOffsets(this.columns);
  }

  destroy(): void {
    this.columns = [];
    this.responsiveHidden.clear();
  }
}

/**
 * Table header rendering with sort indicators, filter inputs, and resize handles.
 */

import type {
  InternalColumnDef, SortDirection, FilterType,
  HeaderGroupDefinition, CSSObject,
} from '../../types/datatable-options';
import type { TableTheme } from '../themes/TableTheme';
import type { EventBus } from '../../core/EventBus';

export class HeaderRenderer {
  private theme: TableTheme;
  private events: EventBus;
  private thead: HTMLTableSectionElement | null = null;
  private filterRow: HTMLTableRowElement | null = null;
  private resizing = false;

  constructor(theme: TableTheme, events: EventBus) {
    this.theme = theme;
    this.events = events;
  }

  render(
    table: HTMLTableElement,
    columns: InternalColumnDef[],
    options: {
      sortingEnabled: boolean;
      filteringEnabled: boolean;
      filterPosition: string;
      resizingEnabled: boolean;
      selectionCheckbox: boolean;
      headerGroups?: HeaderGroupDefinition[];
    }
  ): HTMLTableSectionElement {
    if (this.thead) this.thead.remove();
    this.thead = document.createElement('thead');

    if (options.headerGroups?.length) {
      this.renderHeaderGroups(options.headerGroups, columns);
    }

    const headerRow = document.createElement('tr');
    Object.assign(headerRow.style, this.theme.headerRowStyles());

    const visible = columns.filter(c => c._visible);

    if (options.selectionCheckbox) {
      const th = this.createCheckboxHeader(headerRow);
      headerRow.appendChild(th);
    }

    for (const col of visible) {
      const th = this.createHeaderCell(col, options);
      headerRow.appendChild(th);
    }

    this.thead.appendChild(headerRow);

    if (options.filteringEnabled && options.filterPosition === 'header') {
      this.filterRow = this.createFilterRow(visible, options.selectionCheckbox);
      this.thead.appendChild(this.filterRow);
    }

    table.appendChild(this.thead);
    return this.thead;
  }

  private createHeaderCell(
    col: InternalColumnDef,
    options: { sortingEnabled: boolean; resizingEnabled: boolean }
  ): HTMLTableCellElement {
    const th = document.createElement('th');
    Object.assign(th.style, this.theme.headerCellStyles(col));

    if (col._computedWidth) {
      th.style.width = `${col._computedWidth}px`;
    }

    if (col.pinned) {
      th.style.position = 'sticky';
      th.style.zIndex = '3';
      th.style.backgroundColor = '#f8fafc';
      if (col.pinned === 'left') {
        th.style.left = `${col._pinnedOffset}px`;
      } else {
        th.style.right = `${col._pinnedOffset}px`;
      }
    }

    const label = document.createElement('span');
    label.textContent = col.title ?? col.field;
    th.appendChild(label);

    if (options.sortingEnabled && col.sortable) {
      const sortIcon = this.createSortIcon(col);
      th.appendChild(sortIcon);
      th.style.cursor = 'pointer';

      th.addEventListener('click', (e) => {
        if (this.resizing) return;
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'SELECT') return;
        this.events.emit('header:sort', { field: col.field, shiftKey: e.shiftKey });
      });
    }

    if (col.headerTooltip) {
      th.title = col.headerTooltip;
    }

    if (options.resizingEnabled && col.resizable) {
      const handle = this.createResizeHandle(col, th);
      th.appendChild(handle);
    }

    th.setAttribute('data-field', col.field);
    return th;
  }

  private createSortIcon(col: InternalColumnDef): HTMLSpanElement {
    const icon = document.createElement('span');
    icon.className = 'katucharts-dt-sort-icon';

    const active = col._sortDirection != null;
    Object.assign(icon.style, this.theme.sortIconStyles(active));

    if (col._sortDirection === 'asc') {
      icon.textContent = ' \u25B2';
    } else if (col._sortDirection === 'desc') {
      icon.textContent = ' \u25BC';
    } else {
      icon.textContent = ' \u25B4\u25BE';
    }

    if (col._sortPriority >= 0 && col._sortDirection) {
      const badge = document.createElement('sup');
      badge.textContent = String(col._sortPriority + 1);
      badge.style.fontSize = '8px';
      badge.style.marginLeft = '1px';
      icon.appendChild(badge);
    }

    return icon;
  }

  private createResizeHandle(col: InternalColumnDef, th: HTMLTableCellElement): HTMLDivElement {
    const handle = document.createElement('div');
    Object.assign(handle.style, this.theme.resizeHandleStyles());

    handle.addEventListener('mouseenter', () => {
      handle.style.backgroundColor = 'rgba(59, 130, 246, 0.3)';
    });
    handle.addEventListener('mouseleave', () => {
      if (!this.resizing) handle.style.backgroundColor = 'transparent';
    });

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.resizing = true;

      const startX = e.clientX;
      const startWidth = col._computedWidth;

      const onMove = (me: MouseEvent) => {
        const delta = me.clientX - startX;
        const newWidth = Math.max(col.minWidth ?? 40, Math.min(col.maxWidth ?? 2000, startWidth + delta));
        col._computedWidth = newWidth;
        th.style.width = `${newWidth}px`;
        this.events.emit('column:resizing', { field: col.field, width: newWidth });
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        handle.style.backgroundColor = 'transparent';
        setTimeout(() => { this.resizing = false; }, 50);
        this.events.emit('column:resize', { field: col.field, width: col._computedWidth });
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    return handle;
  }

  private createCheckboxHeader(headerRow: HTMLTableRowElement): HTMLTableCellElement {
    const th = document.createElement('th');
    Object.assign(th.style, {
      ...this.theme.headerCellStyles(),
      width: '40px',
      textAlign: 'center',
      padding: '0',
    });

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.style.cursor = 'pointer';
    checkbox.addEventListener('change', () => {
      this.events.emit('selection:toggleAll', { checked: checkbox.checked });
    });

    th.appendChild(checkbox);
    return th;
  }

  private createFilterRow(
    columns: InternalColumnDef[],
    hasCheckbox: boolean
  ): HTMLTableRowElement {
    const row = document.createElement('tr');
    row.style.backgroundColor = '#fff';

    if (hasCheckbox) {
      const td = document.createElement('td');
      td.style.width = '40px';
      row.appendChild(td);
    }

    for (const col of columns) {
      const td = document.createElement('td');
      td.style.padding = '4px 8px';
      td.style.borderBottom = `1px solid ${this.theme['style']?.borderColor ?? '#e0e0e0'}`;

      if (col.filterable) {
        const input = this.createFilterInput(col);
        td.appendChild(input);
      }

      row.appendChild(td);
    }

    return row;
  }

  private createFilterInput(col: InternalColumnDef): HTMLElement {
    const filterType = col.filterType ?? this.inferFilterType(col);

    switch (filterType) {
      case 'select':
        return this.createSelectFilter(col);
      case 'number':
      case 'numberrange':
        return this.createNumberFilter(col);
      case 'date':
      case 'daterange':
        return this.createDateFilter(col);
      default:
        return this.createTextFilter(col);
    }
  }

  private createTextFilter(col: InternalColumnDef): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = `Filter ${col.title ?? col.field}...`;
    Object.assign(input.style, this.theme.filterInputStyles());

    if (col._filterValue) input.value = col._filterValue;

    input.addEventListener('input', () => {
      this.events.emit('filter:change', { field: col.field, value: input.value || null });
    });

    return input;
  }

  private createNumberFilter(col: InternalColumnDef): HTMLDivElement {
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.gap = '4px';

    const min = document.createElement('input');
    min.type = 'number';
    min.placeholder = 'Min';
    Object.assign(min.style, { ...this.theme.filterInputStyles(), width: '50%' });

    const max = document.createElement('input');
    max.type = 'number';
    max.placeholder = 'Max';
    Object.assign(max.style, { ...this.theme.filterInputStyles(), width: '50%' });

    if (col._filterValue && typeof col._filterValue === 'object') {
      if (col._filterValue.min != null) min.value = String(col._filterValue.min);
      if (col._filterValue.max != null) max.value = String(col._filterValue.max);
    }

    const emit = () => {
      const val = (min.value || max.value)
        ? { min: min.value ? Number(min.value) : null, max: max.value ? Number(max.value) : null }
        : null;
      this.events.emit('filter:change', { field: col.field, value: val });
    };

    min.addEventListener('input', emit);
    max.addEventListener('input', emit);

    container.appendChild(min);
    container.appendChild(max);
    return container;
  }

  private createDateFilter(col: InternalColumnDef): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'date';
    Object.assign(input.style, this.theme.filterInputStyles());

    if (col._filterValue) input.value = col._filterValue;

    input.addEventListener('change', () => {
      this.events.emit('filter:change', { field: col.field, value: input.value || null });
    });

    return input;
  }

  private createSelectFilter(col: InternalColumnDef): HTMLSelectElement {
    const select = document.createElement('select');
    Object.assign(select.style, { ...this.theme.filterInputStyles(), padding: '2px 4px' });

    const emptyOpt = document.createElement('option');
    emptyOpt.value = '';
    emptyOpt.textContent = 'All';
    select.appendChild(emptyOpt);

    const options = col.filterOptions ?? [];
    for (const opt of options) {
      const option = document.createElement('option');
      option.value = String(opt);
      option.textContent = String(opt);
      select.appendChild(option);
    }

    if (col._filterValue) select.value = String(col._filterValue);

    select.addEventListener('change', () => {
      this.events.emit('filter:change', { field: col.field, value: select.value || null });
    });

    return select;
  }

  private renderHeaderGroups(
    headerGroups: HeaderGroupDefinition[],
    columns: InternalColumnDef[]
  ): void {
    if (!this.thead) return;
    const row = document.createElement('tr');
    Object.assign(row.style, this.theme.headerRowStyles());

    const visible = columns.filter(c => c._visible);
    const assigned = new Set<string>();

    for (const group of headerGroups) {
      const span = group.columns.filter(f => visible.some(c => c.field === f)).length;
      if (span === 0) continue;

      const th = document.createElement('th');
      th.colSpan = span;
      th.textContent = group.title;
      Object.assign(th.style, {
        ...this.theme.headerCellStyles(),
        textAlign: 'center',
        ...(group.style ?? {}),
      });
      row.appendChild(th);

      group.columns.forEach(f => assigned.add(f));
    }

    for (const col of visible) {
      if (!assigned.has(col.field)) {
        const th = document.createElement('th');
        th.textContent = '';
        Object.assign(th.style, this.theme.headerCellStyles());
        row.appendChild(th);
      }
    }

    this.thead.appendChild(row);
  }

  private inferFilterType(col: InternalColumnDef): FilterType {
    switch (col.type) {
      case 'number': return 'number';
      case 'date': return 'date';
      case 'boolean': return 'select';
      default: return 'text';
    }
  }

  updateSelectAllCheckbox(allSelected: boolean, someSelected: boolean): void {
    if (!this.thead) return;
    const checkbox = this.thead.querySelector('input[type="checkbox"]') as HTMLInputElement;
    if (checkbox) {
      checkbox.checked = allSelected;
      checkbox.indeterminate = !allSelected && someSelected;
    }
  }

  destroy(): void {
    if (this.thead) {
      this.thead.remove();
      this.thead = null;
    }
    this.filterRow = null;
  }
}

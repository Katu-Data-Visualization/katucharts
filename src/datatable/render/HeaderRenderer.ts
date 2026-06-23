/**
 * Table header rendering with sort indicators, filter inputs, and resize handles.
 */

import type {
  InternalColumnDef, FilterType,
  HeaderGroupDefinition, HeaderContext, DataTableLangOptions,
} from '../../types/datatable-options';
import type { TableTheme } from '../themes/TableTheme';
import type { EventBus } from '../../core/EventBus';
import type { TableApi, TableHost } from '../api/TableApi';
import { ICONS } from './icons';
import { openPopover, type PopoverHandle } from './popover';

interface HeaderOptions {
  sortingEnabled: boolean;
  filteringEnabled: boolean;
  filterPosition: string;
  resizingEnabled: boolean;
  selectionCheckbox: boolean;
  headerGroups?: HeaderGroupDefinition[];
  api?: TableApi | null;
  host?: TableHost | null;
}

export class HeaderRenderer {
  private theme: TableTheme;
  private events: EventBus;
  private lang: DataTableLangOptions;
  private thead: HTMLTableSectionElement | null = null;
  private filterRow: HTMLTableRowElement | null = null;
  private resizing = false;
  private api: TableApi | null = null;
  private host: TableHost | null = null;

  constructor(theme: TableTheme, events: EventBus, lang: DataTableLangOptions = {}) {
    this.theme = theme;
    this.events = events;
    this.lang = lang;
  }

  /** Swap the active locale strings; takes effect on the next render. */
  setLang(lang: DataTableLangOptions): void {
    this.lang = lang;
  }

  render(
    table: HTMLTableElement,
    columns: InternalColumnDef[],
    options: HeaderOptions
  ): HTMLTableSectionElement {
    if (this.thead) this.thead.remove();
    this.thead = document.createElement('thead');
    this.thead.className = 'katucharts-dt-header';
    this.api = options.api ?? null;
    this.host = options.host ?? null;

    if (options.headerGroups?.length) {
      this.renderHeaderGroups(options.headerGroups, columns);
    }

    const headerRow = document.createElement('tr');
    headerRow.className = 'katucharts-dt-header-row';
    if (this.theme.userHeaderRowStyle) Object.assign(headerRow.style, this.theme.userHeaderRowStyle);

    const visible = columns.filter(c => c._visible);

    if (options.selectionCheckbox) {
      headerRow.appendChild(this.createCheckboxHeader());
    }

    for (const col of visible) {
      headerRow.appendChild(this.createHeaderCell(col, options));
    }

    this.thead.appendChild(headerRow);

    if (options.filteringEnabled && options.filterPosition === 'header') {
      this.filterRow = this.createFilterRow(visible, options.selectionCheckbox);
      this.thead.appendChild(this.filterRow);
    }

    table.appendChild(this.thead);
    return this.thead;
  }

  private createHeaderCell(col: InternalColumnDef, options: HeaderOptions): HTMLTableCellElement {
    const th = document.createElement('th');
    th.className = 'katucharts-dt-th';
    th.setAttribute('data-field', col.field);
    if (col.align) th.setAttribute('data-align', col.headerAlign ?? col.align);
    if (col._computedWidth) th.style.width = `${col._computedWidth}px`;
    if (this.theme.userHeaderCellStyle) Object.assign(th.style, this.theme.userHeaderCellStyle);
    if (col.headerStyle) Object.assign(th.style, col.headerStyle);

    if (col.pinned) {
      th.classList.add('is-pinned');
      if (col.pinned === 'left') th.style.left = `${col._pinnedOffset}px`;
      else th.style.right = `${col._pinnedOffset}px`;
    }

    const sortable = options.sortingEnabled && col.sortable;
    if (col._sortDirection) th.classList.add('is-sorted');

    /**
     * A `header` callback owns its markup (including any sort button).
     * It is placed in a full-width block so the returned content controls
     * its own alignment (e.g. a right-aligned div lines up with right-aligned cells).
     */
    if (typeof col.header === 'function' && this.api && this.host) {
      const ctx: HeaderContext = { column: this.api.getColumn(col.id ?? col.field)!, table: this.api };
      const out = col.header(ctx);
      const inner = document.createElement('div');
      inner.className = 'katucharts-dt-th-custom';
      if (out instanceof Node) inner.appendChild(out);
      else inner.innerHTML = String(out ?? '');
      th.appendChild(inner);
    } else {
      const inner = document.createElement('span');
      inner.className = 'katucharts-dt-th-inner';

      const label = document.createElement('span');
      if (col.headerFormatter) label.innerHTML = col.headerFormatter.call({ column: col });
      else label.textContent = col.title ?? col.field;
      inner.appendChild(label);

      if (sortable) inner.appendChild(this.createSortIcon(col));
      th.appendChild(inner);

      if (sortable) {
        th.classList.add('is-sortable');
        th.addEventListener('click', (e) => {
          if (this.resizing) return;
          const t = e.target as HTMLElement;
          if (t.tagName === 'INPUT' || t.tagName === 'SELECT') return;
          this.events.emit('header:sort', { field: col.field, shiftKey: e.shiftKey });
        });
      }
    }

    if (col.headerTooltip) th.title = col.headerTooltip;

    if (options.resizingEnabled && col.resizable) {
      th.appendChild(this.createResizeHandle(col, th));
    }

    return th;
  }

  private createSortIcon(col: InternalColumnDef): HTMLSpanElement {
    const icon = document.createElement('span');
    icon.className = 'katucharts-dt-sort-icon';
    if (col._sortDirection === 'asc') icon.innerHTML = ICONS.sortAsc;
    else if (col._sortDirection === 'desc') icon.innerHTML = ICONS.sortDesc;
    else icon.innerHTML = ICONS.sortNone;

    if (col._sortPriority >= 0 && col._sortDirection) {
      const badge = document.createElement('span');
      badge.className = 'katucharts-dt-sort-badge';
      badge.textContent = String(col._sortPriority + 1);
      icon.appendChild(badge);
    }
    return icon;
  }

  private createResizeHandle(col: InternalColumnDef, th: HTMLTableCellElement): HTMLDivElement {
    const handle = document.createElement('div');
    handle.className = 'katucharts-dt-resize-handle';

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
        setTimeout(() => { this.resizing = false; }, 50);
        this.events.emit('column:resize', { field: col.field, width: col._computedWidth });
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    return handle;
  }

  private createCheckboxHeader(): HTMLTableCellElement {
    const th = document.createElement('th');
    th.className = 'katucharts-dt-th katucharts-dt-checkbox-cell';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'katucharts-dt-checkbox';
    checkbox.setAttribute('aria-label', this.lang.selectAllRows ?? 'Select all rows');
    checkbox.addEventListener('change', () => {
      this.events.emit('selection:toggleAll', { checked: checkbox.checked });
    });
    th.appendChild(checkbox);
    return th;
  }

  private createFilterRow(columns: InternalColumnDef[], hasCheckbox: boolean): HTMLTableRowElement {
    const row = document.createElement('tr');
    row.className = 'katucharts-dt-filter-row';

    if (hasCheckbox) {
      const td = document.createElement('td');
      td.className = 'katucharts-dt-checkbox-cell';
      row.appendChild(td);
    }

    for (const col of columns) {
      const td = document.createElement('td');
      if (col.filterable) td.appendChild(this.createFilterInput(col));
      row.appendChild(td);
    }

    return row;
  }

  private createFilterInput(col: InternalColumnDef): HTMLElement {
    const filterType = col.filterType ?? this.inferFilterType(col);
    switch (filterType) {
      case 'select': return this.createSelectFilter(col);
      case 'multiselect':
      case 'faceted': return this.createFacetedFilter(col);
      case 'boolean': return this.createBooleanFilter(col);
      case 'number':
      case 'numberrange': return this.createNumberFilter(col);
      case 'date':
      case 'daterange': return this.createDateFilter(col);
      default: return this.createTextFilter(col);
    }
  }

  private createTextFilter(col: InternalColumnDef): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'katucharts-dt-input katucharts-dt-filter-input';
    input.placeholder = this.lang.filterPlaceholder ?? 'Filter…';
    if (col._filterValue) input.value = col._filterValue;
    input.addEventListener('input', () => {
      this.events.emit('filter:input', { field: col.field, value: input.value || null });
    });
    return input;
  }

  private createNumberFilter(col: InternalColumnDef): HTMLDivElement {
    const container = document.createElement('div');
    container.className = 'katucharts-dt-filter-range';

    const min = document.createElement('input');
    min.type = 'number';
    min.placeholder = this.lang.rangeMin ?? 'Min';
    min.className = 'katucharts-dt-input katucharts-dt-filter-input';

    const max = document.createElement('input');
    max.type = 'number';
    max.placeholder = this.lang.rangeMax ?? 'Max';
    max.className = 'katucharts-dt-input katucharts-dt-filter-input';

    if (col._filterValue && typeof col._filterValue === 'object') {
      if (col._filterValue.min != null) min.value = String(col._filterValue.min);
      if (col._filterValue.max != null) max.value = String(col._filterValue.max);
    }

    const emit = () => {
      const val = (min.value || max.value)
        ? { min: min.value ? Number(min.value) : null, max: max.value ? Number(max.value) : null }
        : null;
      this.events.emit('filter:input', { field: col.field, value: val });
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
    input.className = 'katucharts-dt-input katucharts-dt-filter-input';
    if (col._filterValue) input.value = col._filterValue;
    input.addEventListener('change', () => {
      this.events.emit('filter:input', { field: col.field, value: input.value || null });
    });
    return input;
  }

  private createSelectFilter(col: InternalColumnDef): HTMLElement {
    const options = [{ label: this.lang.filterAll ?? 'All', value: null as any }];
    for (const opt of col.filterOptions ?? []) options.push({ label: String(opt), value: opt });
    return this.createSingleSelectFilter(col, options);
  }

  private createBooleanFilter(col: InternalColumnDef): HTMLElement {
    return this.createSingleSelectFilter(col, [
      { label: this.lang.filterAll ?? 'All', value: null },
      { label: this.lang.filterTrue ?? 'True', value: true },
      { label: this.lang.filterFalse ?? 'False', value: false },
    ]);
  }

  /** A single-select column filter rendered as a themed dropdown (not a native <select>). */
  private createSingleSelectFilter(
    col: InternalColumnDef,
    options: Array<{ label: string; value: any }>
  ): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'katucharts-dt-btn katucharts-dt-filter-input';
    btn.style.width = '100%';
    btn.style.justifyContent = 'space-between';

    const current = () => options.find(o =>
      o.value === col._filterValue || String(o.value) === String(col._filterValue)) ?? options[0];
    const renderLabel = () => {
      btn.innerHTML = `<span>${current().label}</span>${ICONS.chevronDown}`;
    };
    renderLabel();

    let popover: PopoverHandle | null = null;
    const close = () => { popover?.close(); popover = null; };

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (popover) { close(); return; }
      const menu = document.createElement('div');
      menu.className = 'katucharts-dt-menu';
      for (const opt of options) {
        const item = document.createElement('div');
        item.className = 'katucharts-dt-menu-item';
        if (opt === current()) item.classList.add('is-active');
        item.textContent = opt.label;
        item.addEventListener('click', () => {
          col._filterValue = opt.value;
          renderLabel();
          close();
          this.events.emit('filter:input', { field: col.field, value: opt.value });
        });
        menu.appendChild(item);
      }
      popover = openPopover(btn, menu, { align: 'left' });
    });

    wrapper.appendChild(btn);
    return wrapper;
  }

  /** A faceted multi-select filter: button + checkbox menu. */
  private createFacetedFilter(col: InternalColumnDef): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';

    const selected: Set<string> = new Set(
      Array.isArray(col._filterValue) ? col._filterValue.map(String) : []
    );

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'katucharts-dt-btn katucharts-dt-filter-input';
    btn.style.width = '100%';
    btn.style.justifyContent = 'space-between';

    const renderLabel = () => {
      btn.innerHTML = `<span style="display:inline-flex;align-items:center;gap:6px">${ICONS.plusCircle}<span>${col.title ?? col.field}</span></span>`;
      if (selected.size) {
        const badge = document.createElement('span');
        badge.className = 'katucharts-dt-facet-count';
        badge.textContent = String(selected.size);
        btn.appendChild(badge);
      }
    };
    renderLabel();

    let popover: PopoverHandle | null = null;
    const close = () => { popover?.close(); popover = null; };

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (popover) { close(); return; }
      const menu = document.createElement('div');
      menu.className = 'katucharts-dt-menu';

      for (const opt of col.filterOptions ?? []) {
        const key = String(opt);
        const item = document.createElement('label');
        item.className = 'katucharts-dt-menu-item';
        if (selected.has(key)) item.classList.add('is-active');

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = selected.has(key);
        cb.addEventListener('change', () => {
          if (cb.checked) { selected.add(key); item.classList.add('is-active'); }
          else { selected.delete(key); item.classList.remove('is-active'); }
          renderLabel();
          this.events.emit('filter:input', {
            field: col.field,
            value: selected.size ? [...selected] : null,
          });
        });

        const span = document.createElement('span');
        span.textContent = key;
        item.appendChild(cb);
        item.appendChild(span);
        menu.appendChild(item);
      }

      popover = openPopover(btn, menu, { align: 'left' });
    });

    wrapper.appendChild(btn);
    return wrapper;
  }

  private renderHeaderGroups(
    headerGroups: HeaderGroupDefinition[],
    columns: InternalColumnDef[]
  ): void {
    if (!this.thead) return;
    const row = document.createElement('tr');
    row.className = 'katucharts-dt-header-row';

    const visible = columns.filter(c => c._visible);
    const assigned = new Set<string>();

    for (const group of headerGroups) {
      const span = group.columns.filter(f => visible.some(c => c.field === f)).length;
      if (span === 0) continue;
      const th = document.createElement('th');
      th.className = 'katucharts-dt-th';
      th.colSpan = span;
      th.style.textAlign = 'center';
      th.textContent = group.title;
      if (group.style) Object.assign(th.style, group.style);
      row.appendChild(th);
      group.columns.forEach(f => assigned.add(f));
    }

    for (const col of visible) {
      if (!assigned.has(col.field)) {
        const th = document.createElement('th');
        th.className = 'katucharts-dt-th';
        row.appendChild(th);
      }
    }

    this.thead.appendChild(row);
  }

  private inferFilterType(col: InternalColumnDef): FilterType {
    switch (col.type) {
      case 'number': return 'number';
      case 'date': return 'date';
      case 'boolean': return 'boolean';
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

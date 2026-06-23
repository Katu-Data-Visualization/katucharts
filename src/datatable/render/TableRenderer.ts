/**
 * Main HTML table rendering engine with virtual scrolling support.
 */

import type {
  InternalColumnDef, ProcessedRow, ProcessedResult,
  GroupingOptions, MasterDetailOptions,
  TreeDataOptions, VirtualScrollOptions, SelectionMode, DataTableLangOptions,
} from '../../types/datatable-options';
import type { TableTheme } from '../themes/TableTheme';
import type { EventBus } from '../../core/EventBus';
import type { TableApi, TableHost } from '../api/TableApi';
import { CellRenderer } from './CellRenderer';
import { HeaderRenderer } from './HeaderRenderer';
import { throttle } from '../../utils/throttle';

interface RenderOptions {
  height?: number | string;
  sortingEnabled: boolean;
  filteringEnabled: boolean;
  filterPosition: string;
  resizingEnabled: boolean;
  selectionMode: SelectionMode;
  selectionCheckbox: boolean;
  grouping?: GroupingOptions;
  masterDetail?: MasterDetailOptions;
  treeData?: TreeDataOptions;
  virtualScroll?: VirtualScrollOptions;
  headerGroups?: any[];
  selectedIndices: Set<number>;
  noDataText: string;
  loadingText: string;
  api?: TableApi | null;
  host?: TableHost | null;
  bodyClass?: string;
  tableClass?: string;
}

interface UpdateOptions {
  selectionMode: SelectionMode;
  selectionCheckbox: boolean;
  grouping?: GroupingOptions;
  masterDetail?: MasterDetailOptions;
  treeData?: TreeDataOptions;
  selectedIndices: Set<number>;
  noDataText: string;
  api?: TableApi | null;
  host?: TableHost | null;
}

export class TableRenderer {
  private theme: TableTheme;
  private events: EventBus;
  private lang: DataTableLangOptions;
  private cellRenderer: CellRenderer;
  private headerRenderer: HeaderRenderer;

  private tableContainer: HTMLDivElement | null = null;
  private headerScrollContainer: HTMLDivElement | null = null;
  private bodyScrollContainer: HTMLDivElement | null = null;
  private headerTable: HTMLTableElement | null = null;
  private bodyTable: HTMLTableElement | null = null;
  private tbody: HTMLTableSectionElement | null = null;
  private colgroup: HTMLTableColElement | null = null;
  private headerColgroup: HTMLTableColElement | null = null;
  private spacer: HTMLDivElement | null = null;
  private loadingOverlay: HTMLDivElement | null = null;

  private currentRows: ProcessedRow[] = [];
  private virtualEnabled = false;
  private virtualRowHeight = 44;
  private virtualOverscan = 10;
  private totalRows = 0;

  constructor(
    theme: TableTheme,
    events: EventBus,
    formatters?: Record<string, (value: any) => string>,
    lang: DataTableLangOptions = {}
  ) {
    this.theme = theme;
    this.events = events;
    this.lang = lang;
    this.cellRenderer = new CellRenderer(theme, formatters);
    this.headerRenderer = new HeaderRenderer(theme, events, lang);
  }

  /** Swap the active locale strings; takes effect on the next render. */
  setLang(lang: DataTableLangOptions): void {
    this.lang = lang;
    this.headerRenderer.setLang(lang);
  }

  render(parent: HTMLElement, columns: InternalColumnDef[], result: ProcessedResult, options: RenderOptions): void {
    this.cleanup();
    this.cellRenderer.setApi(options.api ?? null, options.host ?? null);

    this.tableContainer = document.createElement('div');
    this.tableContainer.className = 'katucharts-dt-table-container';

    this.virtualEnabled = options.virtualScroll?.enabled === true ||
      (options.virtualScroll?.threshold != null && result.totalFiltered >= options.virtualScroll.threshold);
    this.virtualRowHeight = options.virtualScroll?.rowHeight ?? this.theme.rowHeight;
    this.virtualOverscan = options.virtualScroll?.overscan ?? 10;
    this.totalRows = result.totalFiltered;

    /**
     * Table is sized to its columns (content width) rather than stretched to fill,
     * so short columns don't leave huge gaps and the selection column can't push
     * the total past the container into overflow.
     */
    const tableWidth = (options.selectionCheckbox ? 44 : 0)
      + columns.filter(c => c._visible).reduce((s, c) => s + c._computedWidth, 0);

    this.headerScrollContainer = document.createElement('div');
    this.headerScrollContainer.className = 'katucharts-dt-header-scroll';
    this.headerTable = document.createElement('table');
    this.headerTable.style.width = `${tableWidth}px`;
    if (options.tableClass) this.headerTable.className = options.tableClass;
    if (this.theme.userTableStyle) Object.assign(this.headerTable.style, this.theme.userTableStyle);

    this.headerColgroup = this.createColgroup(columns, options.selectionCheckbox);
    this.headerTable.appendChild(this.headerColgroup);

    this.headerRenderer.render(this.headerTable, columns, {
      sortingEnabled: options.sortingEnabled,
      filteringEnabled: options.filteringEnabled,
      filterPosition: options.filterPosition,
      resizingEnabled: options.resizingEnabled,
      selectionCheckbox: options.selectionCheckbox,
      headerGroups: options.headerGroups,
      api: options.api,
      host: options.host,
    });

    this.headerScrollContainer.appendChild(this.headerTable);
    this.tableContainer.appendChild(this.headerScrollContainer);

    this.bodyScrollContainer = document.createElement('div');
    this.bodyScrollContainer.className = 'katucharts-dt-body-scroll';
    if (options.bodyClass) this.bodyScrollContainer.className += ` ${options.bodyClass}`;
    if (this.theme.userBodyStyle) Object.assign(this.bodyScrollContainer.style, this.theme.userBodyStyle);
    if (options.height != null) {
      this.bodyScrollContainer.style.maxHeight =
        typeof options.height === 'number' ? `${options.height}px` : options.height;
    }

    if (this.virtualEnabled) {
      this.spacer = document.createElement('div');
      this.spacer.style.height = `${this.totalRows * this.virtualRowHeight}px`;
      this.spacer.style.width = `${tableWidth}px`;
      this.spacer.style.position = 'relative';
      this.bodyScrollContainer.appendChild(this.spacer);
    }

    this.bodyTable = document.createElement('table');
    this.bodyTable.style.width = `${tableWidth}px`;
    if (options.tableClass) this.bodyTable.className = options.tableClass;
    if (this.theme.userTableStyle) Object.assign(this.bodyTable.style, this.theme.userTableStyle);

    if (this.virtualEnabled) {
      this.bodyTable.style.position = 'absolute';
      this.bodyTable.style.top = '0';
      this.bodyTable.style.left = '0';
    }

    this.colgroup = this.createColgroup(columns, options.selectionCheckbox);
    this.bodyTable.appendChild(this.colgroup);

    this.tbody = document.createElement('tbody');
    if (result.rows.length === 0) this.renderNoData(options.noDataText, columns, options);
    else this.renderRows(result.rows, columns, options);
    this.bodyTable.appendChild(this.tbody);

    if (this.virtualEnabled && this.spacer) this.spacer.appendChild(this.bodyTable);
    else this.bodyScrollContainer.appendChild(this.bodyTable);

    this.tableContainer.appendChild(this.bodyScrollContainer);

    /**
     * Keep the header horizontally aligned with the scrolled body.
     */
    this.bodyScrollContainer.addEventListener('scroll', () => {
      if (this.headerScrollContainer) {
        this.headerScrollContainer.scrollLeft = this.bodyScrollContainer!.scrollLeft;
      }
      this.events.emit('scroll', {
        scrollTop: this.bodyScrollContainer!.scrollTop,
        scrollLeft: this.bodyScrollContainer!.scrollLeft,
      });
    });

    if (this.virtualEnabled) {
      const throttledScroll = throttle(() => {
        this.events.emit('virtual:scroll', {
          scrollTop: this.bodyScrollContainer!.scrollTop,
          viewportHeight: this.bodyScrollContainer!.clientHeight,
        });
      }, 16);
      this.bodyScrollContainer.addEventListener('scroll', throttledScroll);
    }

    this.loadingOverlay = document.createElement('div');
    this.loadingOverlay.className = 'katucharts-dt-loading';
    this.loadingOverlay.style.display = 'none';
    this.loadingOverlay.innerHTML = `<span class="katucharts-dt-spinner"></span><span>${options.loadingText}</span>`;
    this.tableContainer.appendChild(this.loadingOverlay);

    parent.appendChild(this.tableContainer);
    this.currentRows = result.rows;
  }

  updateRows(result: ProcessedResult, columns: InternalColumnDef[], options: UpdateOptions): void {
    if (!this.tbody) return;
    this.cellRenderer.setApi(options.api ?? null, options.host ?? null);
    this.tbody.innerHTML = '';
    this.totalRows = result.totalFiltered;

    if (this.virtualEnabled && this.spacer) {
      this.spacer.style.height = `${this.totalRows * this.virtualRowHeight}px`;
    }

    if (result.rows.length === 0) this.renderNoData(options.noDataText, columns, options);
    else this.renderRows(result.rows, columns, options);

    this.currentRows = result.rows;
  }

  private renderRows(
    rows: ProcessedRow[],
    columns: InternalColumnDef[],
    options: {
      selectionMode: SelectionMode;
      selectionCheckbox: boolean;
      grouping?: GroupingOptions;
      masterDetail?: MasterDetailOptions;
      treeData?: TreeDataOptions;
      selectedIndices: Set<number>;
    }
  ): void {
    const visibleCols = columns.filter(c => c._visible);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      if (row._type === 'group-header') {
        this.renderGroupHeader(row, visibleCols.length, options);
        continue;
      }
      if (row._type !== 'data') continue;

      const tr = document.createElement('tr');
      tr.className = 'katucharts-dt-row';
      const isSelected = options.selectedIndices.has(row._originalIndex);
      if (isSelected) tr.classList.add('is-selected');
      if (this.virtualEnabled) tr.style.height = `${this.virtualRowHeight}px`;

      const userRowStyle = this.theme.rowStyle({ row: row._data, rowIndex: row._originalIndex });
      if (userRowStyle) Object.assign(tr.style, userRowStyle);

      tr.addEventListener('mouseenter', () =>
        this.events.emit('row:mouseenter', { row: row._data, rowIndex: row._originalIndex }));
      tr.addEventListener('mouseleave', () =>
        this.events.emit('row:mouseleave', { row: row._data, rowIndex: row._originalIndex }));

      if (options.selectionCheckbox && options.selectionMode !== 'none') {
        const td = document.createElement('td');
        td.className = 'katucharts-dt-td katucharts-dt-checkbox-cell';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'katucharts-dt-checkbox';
        checkbox.checked = isSelected;
        checkbox.setAttribute('aria-label', this.lang.selectRow ?? 'Select row');
        checkbox.addEventListener('click', (e) => e.stopPropagation());
        checkbox.addEventListener('change', () => {
          this.events.emit('selection:checkbox', {
            rowIndex: row._originalIndex, row: row._data, checked: checkbox.checked,
          });
        });
        td.appendChild(checkbox);
        tr.appendChild(td);
      }

      const firstCellIndent = (options.treeData?.enabled && row._depth > 0)
        ? row._depth * (options.treeData.indent ?? 20) : 0;

      for (let j = 0; j < visibleCols.length; j++) {
        const col = visibleCols[j];
        const value = this.cellRenderer.resolveValue(row._data, col);
        const td = this.cellRenderer.createCell(tr, value, row, col, i);

        if (j === 0 && firstCellIndent > 0) td.style.paddingLeft = `${firstCellIndent + 16}px`;

        if (j === 0 && options.treeData?.enabled && row._expanded !== undefined) {
          const toggle = document.createElement('span');
          toggle.textContent = row._expanded ? '▼ ' : '▶ ';
          toggle.style.cursor = 'pointer';
          toggle.style.marginRight = '4px';
          toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            this.events.emit('tree:toggle', { rowIndex: row._originalIndex, expanded: !row._expanded });
          });
          td.insertBefore(toggle, td.firstChild);
        }

        td.addEventListener('click', (e) => {
          this.events.emit('cell:click', {
            value, row: row._data, column: col, rowIndex: row._originalIndex, colIndex: j, originalEvent: e,
          });
        });
        td.addEventListener('dblclick', (e) => {
          this.events.emit('cell:dblclick', {
            value, row: row._data, column: col, rowIndex: row._originalIndex, colIndex: j, originalEvent: e, td,
          });
        });
      }

      tr.addEventListener('click', (e) =>
        this.events.emit('row:click', { row: row._data, rowIndex: row._originalIndex, originalEvent: e }));
      tr.addEventListener('dblclick', (e) =>
        this.events.emit('row:dblclick', { row: row._data, rowIndex: row._originalIndex, originalEvent: e }));
      tr.addEventListener('contextmenu', (e) =>
        this.events.emit('row:contextmenu', { row: row._data, rowIndex: row._originalIndex, originalEvent: e }));

      tr.setAttribute('data-row-index', String(row._originalIndex));
      this.tbody!.appendChild(tr);

      if (options.masterDetail?.enabled && row._expanded) {
        this.renderDetailRow(row, visibleCols.length + (options.selectionCheckbox ? 1 : 0), options.masterDetail);
      }
    }
  }

  private renderGroupHeader(
    row: ProcessedRow,
    colSpan: number,
    options: { grouping?: GroupingOptions; selectionCheckbox?: boolean }
  ): void {
    const tr = document.createElement('tr');
    tr.className = 'katucharts-dt-group-header';
    const td = document.createElement('td');
    td.colSpan = colSpan + (options.selectionCheckbox ? 1 : 0);

    const icon = row._expanded ? '▼' : '▶';
    const count = options.grouping?.showCount !== false ? ` (${row._groupCount})` : '';

    if (options.grouping?.headerFormatter) {
      td.innerHTML = options.grouping.headerFormatter.call({
        value: row._groupValue, column: row._groupColumn!, count: row._groupCount!,
      });
    } else {
      td.textContent = `${icon} ${row._groupColumn}: ${row._groupValue}${count}`;
    }

    td.addEventListener('click', () => {
      this.events.emit('group:toggle', {
        groupValue: row._groupValue, groupColumn: row._groupColumn, expanded: !row._expanded,
      });
    });

    tr.appendChild(td);
    this.tbody!.appendChild(tr);
  }

  private renderDetailRow(row: ProcessedRow, colSpan: number, masterDetail: MasterDetailOptions): void {
    const tr = document.createElement('tr');
    tr.className = 'katucharts-dt-detail';
    const td = document.createElement('td');
    td.colSpan = colSpan;

    if (masterDetail.height && masterDetail.height !== 'auto') {
      td.style.height = `${masterDetail.height}px`;
      td.style.overflow = 'auto';
    }
    if (masterDetail.renderer) {
      const result = masterDetail.renderer(row._data, td);
      if (result instanceof HTMLElement) td.appendChild(result);
    }

    tr.appendChild(td);
    this.tbody!.appendChild(tr);
  }

  private renderNoData(
    text: string,
    columns: InternalColumnDef[],
    options: { selectionCheckbox: boolean }
  ): void {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.className = 'katucharts-dt-nodata';
    td.colSpan = columns.filter(c => c._visible).length + (options.selectionCheckbox ? 1 : 0) || 1;
    td.textContent = text;
    tr.appendChild(td);
    this.tbody!.appendChild(tr);
  }

  private createColgroup(columns: InternalColumnDef[], hasCheckbox: boolean): HTMLTableColElement {
    const colgroup = document.createElement('colgroup');
    if (hasCheckbox) {
      const col = document.createElement('col');
      col.style.width = '44px';
      colgroup.appendChild(col);
    }
    for (const c of columns) {
      if (!c._visible) continue;
      const col = document.createElement('col');
      col.style.width = `${c._computedWidth}px`;
      colgroup.appendChild(col);
    }
    return colgroup;
  }

  updateVirtualPosition(scrollTop: number): void {
    if (!this.virtualEnabled || !this.bodyTable) return;
    const startRow = Math.max(0, Math.floor(scrollTop / this.virtualRowHeight) - this.virtualOverscan);
    this.bodyTable.style.top = `${startRow * this.virtualRowHeight}px`;
  }

  showLoading(text?: string): void {
    if (this.loadingOverlay) {
      this.loadingOverlay.style.display = 'flex';
      if (text) {
        const span = this.loadingOverlay.querySelector('span:last-child');
        if (span) span.textContent = text;
      }
    }
  }

  hideLoading(): void {
    if (this.loadingOverlay) this.loadingOverlay.style.display = 'none';
  }

  scrollToRow(index: number): void {
    if (!this.bodyScrollContainer) return;
    if (this.virtualEnabled) {
      this.bodyScrollContainer.scrollTop = index * this.virtualRowHeight;
    } else {
      const row = this.tbody?.querySelector(`[data-row-index="${index}"]`);
      if (row) row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  getHeaderRenderer(): HeaderRenderer {
    return this.headerRenderer;
  }

  getBodyScrollContainer(): HTMLDivElement | null {
    return this.bodyScrollContainer;
  }

  private cleanup(): void {
    this.headerRenderer.destroy();
    if (this.tableContainer) {
      this.tableContainer.remove();
      this.tableContainer = null;
    }
    this.headerTable = null;
    this.bodyTable = null;
    this.tbody = null;
    this.colgroup = null;
    this.headerColgroup = null;
    this.spacer = null;
    this.bodyScrollContainer = null;
    this.headerScrollContainer = null;
    this.loadingOverlay = null;
  }

  destroy(): void {
    this.cleanup();
    this.currentRows = [];
  }
}

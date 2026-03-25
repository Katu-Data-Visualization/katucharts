/**
 * Main HTML table rendering engine with virtual scrolling support.
 */

import type {
  InternalColumnDef, ProcessedRow, ProcessedResult,
  DataTableStyleOptions, GroupingOptions, MasterDetailOptions,
  TreeDataOptions, VirtualScrollOptions, SelectionMode,
} from '../../types/datatable-options';
import type { TableTheme } from '../themes/TableTheme';
import type { EventBus } from '../../core/EventBus';
import { CellRenderer } from './CellRenderer';
import { HeaderRenderer } from './HeaderRenderer';
import { throttle } from '../../utils/throttle';

export class TableRenderer {
  private theme: TableTheme;
  private events: EventBus;
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
  private noDataEl: HTMLDivElement | null = null;
  private loadingOverlay: HTMLDivElement | null = null;

  private currentRows: ProcessedRow[] = [];
  private allProcessedRows: ProcessedRow[] = [];
  private virtualEnabled = false;
  private virtualRowHeight = 36;
  private virtualOverscan = 10;
  private totalRows = 0;

  constructor(theme: TableTheme, events: EventBus, formatters?: Record<string, (value: any) => string>) {
    this.theme = theme;
    this.events = events;
    this.cellRenderer = new CellRenderer(theme, formatters);
    this.headerRenderer = new HeaderRenderer(theme, events);
  }

  render(
    parent: HTMLElement,
    columns: InternalColumnDef[],
    result: ProcessedResult,
    options: {
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
    }
  ): void {
    this.cleanup();

    this.tableContainer = document.createElement('div');
    this.tableContainer.className = 'katucharts-dt-table-container';
    this.tableContainer.style.position = 'relative';

    this.virtualEnabled = options.virtualScroll?.enabled === true ||
      (options.virtualScroll?.threshold != null && result.totalFiltered >= options.virtualScroll.threshold);
    this.virtualRowHeight = options.virtualScroll?.rowHeight ?? this.theme.rowHeight;
    this.virtualOverscan = options.virtualScroll?.overscan ?? 10;
    this.totalRows = result.totalFiltered;

    // Header table (separate for sticky header)
    this.headerScrollContainer = document.createElement('div');
    this.headerScrollContainer.style.overflow = 'hidden';
    this.headerTable = document.createElement('table');
    Object.assign(this.headerTable.style, this.theme.tableStyles());

    this.headerColgroup = this.createColgroup(columns, options.selectionCheckbox);
    this.headerTable.appendChild(this.headerColgroup);

    this.headerRenderer.render(this.headerTable, columns, {
      sortingEnabled: options.sortingEnabled,
      filteringEnabled: options.filteringEnabled,
      filterPosition: options.filterPosition,
      resizingEnabled: options.resizingEnabled,
      selectionCheckbox: options.selectionCheckbox,
      headerGroups: options.headerGroups,
    });

    this.headerScrollContainer.appendChild(this.headerTable);
    this.tableContainer.appendChild(this.headerScrollContainer);

    // Body scroll container
    this.bodyScrollContainer = document.createElement('div');
    this.bodyScrollContainer.className = 'katucharts-dt-body-scroll';
    Object.assign(this.bodyScrollContainer.style, this.theme.bodyStyles(options.height));

    if (this.virtualEnabled) {
      this.bodyScrollContainer.style.overflow = 'auto';
      this.bodyScrollContainer.style.position = 'relative';

      this.spacer = document.createElement('div');
      this.spacer.style.height = `${this.totalRows * this.virtualRowHeight}px`;
      this.spacer.style.position = 'relative';
      this.bodyScrollContainer.appendChild(this.spacer);
    }

    this.bodyTable = document.createElement('table');
    Object.assign(this.bodyTable.style, this.theme.tableStyles());

    if (this.virtualEnabled) {
      this.bodyTable.style.position = 'absolute';
      this.bodyTable.style.top = '0';
      this.bodyTable.style.left = '0';
      this.bodyTable.style.right = '0';
    }

    this.colgroup = this.createColgroup(columns, options.selectionCheckbox);
    this.bodyTable.appendChild(this.colgroup);

    this.tbody = document.createElement('tbody');

    if (result.rows.length === 0) {
      this.renderNoData(options.noDataText);
    } else {
      this.renderRows(result.rows, columns, options);
    }

    this.bodyTable.appendChild(this.tbody);

    if (this.virtualEnabled && this.spacer) {
      this.spacer.appendChild(this.bodyTable);
    } else {
      this.bodyScrollContainer.appendChild(this.bodyTable);
    }

    this.tableContainer.appendChild(this.bodyScrollContainer);

    // Sync horizontal scroll
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

    // Loading overlay
    this.loadingOverlay = document.createElement('div');
    Object.assign(this.loadingOverlay.style, this.theme.loadingOverlayStyles());
    this.loadingOverlay.style.display = 'none';
    this.loadingOverlay.textContent = options.loadingText;
    this.tableContainer.appendChild(this.loadingOverlay);

    parent.appendChild(this.tableContainer);
    this.currentRows = result.rows;
  }

  updateRows(
    result: ProcessedResult,
    columns: InternalColumnDef[],
    options: {
      selectionMode: SelectionMode;
      selectionCheckbox: boolean;
      grouping?: GroupingOptions;
      masterDetail?: MasterDetailOptions;
      treeData?: TreeDataOptions;
      selectedIndices: Set<number>;
      noDataText: string;
    }
  ): void {
    if (!this.tbody) return;

    this.tbody.innerHTML = '';
    this.totalRows = result.totalFiltered;

    if (this.virtualEnabled && this.spacer) {
      this.spacer.style.height = `${this.totalRows * this.virtualRowHeight}px`;
    }

    if (result.rows.length === 0) {
      this.renderNoData(options.noDataText);
    } else {
      this.renderRows(result.rows, columns, options);
    }

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
      const isSelected = options.selectedIndices.has(row._originalIndex);
      const rowStyles = this.theme.rowStyles(i, isSelected);
      Object.assign(tr.style, rowStyles);

      if (this.virtualEnabled) {
        tr.style.height = `${this.virtualRowHeight}px`;
      }

      // Hover effects
      const hoverColor = this.theme.hoverRowColor();
      if (hoverColor) {
        const originalBg = tr.style.backgroundColor;
        tr.addEventListener('mouseenter', () => {
          if (!options.selectedIndices.has(row._originalIndex)) {
            tr.style.backgroundColor = hoverColor as string;
          }
          this.events.emit('row:mouseenter', { row: row._data, rowIndex: row._originalIndex });
        });
        tr.addEventListener('mouseleave', () => {
          if (!options.selectedIndices.has(row._originalIndex)) {
            tr.style.backgroundColor = originalBg;
          }
          this.events.emit('row:mouseleave', { row: row._data, rowIndex: row._originalIndex });
        });
      }

      // Selection checkbox
      if (options.selectionCheckbox && options.selectionMode !== 'none') {
        const td = document.createElement('td');
        td.style.width = '40px';
        td.style.textAlign = 'center';
        td.style.padding = '0';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = isSelected;
        checkbox.style.cursor = 'pointer';

        checkbox.addEventListener('change', (e) => {
          e.stopPropagation();
          this.events.emit('selection:checkbox', {
            rowIndex: row._originalIndex,
            row: row._data,
            checked: checkbox.checked,
          });
        });

        td.appendChild(checkbox);
        tr.appendChild(td);
      }

      // Tree data indent
      let firstCellIndent = 0;
      if (options.treeData?.enabled && row._depth > 0) {
        firstCellIndent = row._depth * (options.treeData.indent ?? 20);
      }

      // Data cells
      for (let j = 0; j < visibleCols.length; j++) {
        const col = visibleCols[j];
        const value = row._data[col.field];
        const td = this.cellRenderer.createCell(tr, value, row, col, i);

        if (j === 0 && firstCellIndent > 0) {
          td.style.paddingLeft = `${firstCellIndent + 12}px`;
        }

        // Tree expand toggle
        if (j === 0 && options.treeData?.enabled && row._expanded !== undefined) {
          const toggle = document.createElement('span');
          toggle.textContent = row._expanded ? '\u25BC ' : '\u25B6 ';
          toggle.style.cursor = 'pointer';
          toggle.style.marginRight = '4px';
          toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            this.events.emit('tree:toggle', { rowIndex: row._originalIndex, expanded: !row._expanded });
          });
          td.insertBefore(toggle, td.firstChild);
        }

        // Cell click
        td.addEventListener('click', (e) => {
          this.events.emit('cell:click', {
            value,
            row: row._data,
            column: col,
            rowIndex: row._originalIndex,
            colIndex: j,
            originalEvent: e,
          });
        });

        td.addEventListener('dblclick', (e) => {
          this.events.emit('cell:dblclick', {
            value,
            row: row._data,
            column: col,
            rowIndex: row._originalIndex,
            colIndex: j,
            originalEvent: e,
            td,
          });
        });
      }

      // Row click
      tr.addEventListener('click', (e) => {
        this.events.emit('row:click', {
          row: row._data,
          rowIndex: row._originalIndex,
          originalEvent: e,
        });
      });

      tr.addEventListener('dblclick', (e) => {
        this.events.emit('row:dblclick', {
          row: row._data,
          rowIndex: row._originalIndex,
          originalEvent: e,
        });
      });

      tr.addEventListener('contextmenu', (e) => {
        this.events.emit('row:contextmenu', {
          row: row._data,
          rowIndex: row._originalIndex,
          originalEvent: e,
        });
      });

      tr.setAttribute('data-row-index', String(row._originalIndex));
      this.tbody!.appendChild(tr);

      // Master-detail
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
    const totalCols = colSpan + (options.selectionCheckbox ? 1 : 0);

    const td = document.createElement('td');
    td.colSpan = totalCols;
    Object.assign(td.style, this.theme.groupHeaderStyles());

    const icon = row._expanded ? '\u25BC' : '\u25B6';
    const count = options.grouping?.showCount !== false ? ` (${row._groupCount})` : '';

    let label: string;
    if (options.grouping?.headerFormatter) {
      label = options.grouping.headerFormatter.call({
        value: row._groupValue,
        column: row._groupColumn!,
        count: row._groupCount!,
      });
    } else {
      label = `${icon} ${row._groupColumn}: ${row._groupValue}${count}`;
    }

    td.textContent = label;

    td.addEventListener('click', () => {
      this.events.emit('group:toggle', {
        groupValue: row._groupValue,
        groupColumn: row._groupColumn,
        expanded: !row._expanded,
      });
    });

    tr.appendChild(td);
    this.tbody!.appendChild(tr);
  }

  private renderDetailRow(
    row: ProcessedRow,
    colSpan: number,
    masterDetail: MasterDetailOptions
  ): void {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = colSpan;
    td.style.padding = '12px';
    td.style.backgroundColor = '#fafbfc';

    if (masterDetail.height && masterDetail.height !== 'auto') {
      td.style.height = `${masterDetail.height}px`;
      td.style.overflow = 'auto';
    }

    if (masterDetail.renderer) {
      const result = masterDetail.renderer(row._data, td);
      if (result instanceof HTMLElement) {
        td.appendChild(result);
      }
    }

    tr.appendChild(td);
    this.tbody!.appendChild(tr);
  }

  private renderNoData(text: string): void {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 100;
    Object.assign(td.style, this.theme.noDataStyles());
    td.textContent = text;
    tr.appendChild(td);
    this.tbody!.appendChild(tr);
  }

  private createColgroup(columns: InternalColumnDef[], hasCheckbox: boolean): HTMLTableColElement {
    const colgroup = document.createElement('colgroup');

    if (hasCheckbox) {
      const col = document.createElement('col');
      col.style.width = '40px';
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
      if (text) this.loadingOverlay.textContent = text;
    }
  }

  hideLoading(): void {
    if (this.loadingOverlay) {
      this.loadingOverlay.style.display = 'none';
    }
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
    this.noDataEl = null;
    this.loadingOverlay = null;
  }

  destroy(): void {
    this.cleanup();
    this.currentRows = [];
  }
}

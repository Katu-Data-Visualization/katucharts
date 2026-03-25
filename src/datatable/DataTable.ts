/**
 * KatuCharts DataTable — main orchestrator.
 */

import type {
  DataTableOptions, InternalColumnDef, ColumnDefinition,
  ProcessedResult, PageInfo, SortState, SortDirection,
  PinDirection, SelectionMode, DensityMode,
} from '../types/datatable-options';
import { EventBus } from '../core/EventBus';
import { resolveContainer, createDiv, removeElement } from '../utils/dom';
import { deepMerge } from '../utils/deepMerge';
import { debounce } from '../utils/throttle';
import { DATA_TABLE_DEFAULTS } from './DataTableDefaults';
import { inferColumnsFromData, normalizeColumns, computePinnedOffsets } from './columns/ColumnDef';
import { ColumnManager } from './columns/ColumnManager';
import { DataSource } from './data/DataSource';
import { DataProcessor, type ProcessorState } from './data/DataProcessor';
import { TableTheme } from './themes/TableTheme';
import { TableRenderer } from './render/TableRenderer';
import { PaginationRenderer } from './render/PaginationRenderer';
import { ToolbarRenderer } from './render/ToolbarRenderer';
import { SelectionManager } from './selection/SelectionManager';
import { TableExport } from './export/TableExport';
import { CellEditor } from './editing/CellEditor';

export class DataTable {
  readonly container: HTMLElement;
  readonly events: EventBus;

  private options: DataTableOptions;
  private theme: TableTheme;
  private dataSource: DataSource;
  private processor: DataProcessor;
  private columnManager: ColumnManager;
  private selectionManager: SelectionManager;
  private cellEditor: CellEditor;

  private tableRenderer: TableRenderer;
  private paginationRenderer: PaginationRenderer;
  private toolbarRenderer: ToolbarRenderer;

  private rootEl: HTMLDivElement;
  private tableArea: HTMLDivElement;
  private columns: InternalColumnDef[] = [];
  private currentResult: ProcessedResult | null = null;

  private currentPage = 1;
  private currentPageSize: number;
  private searchQuery = '';
  private sortState: SortState[] = [];
  private filterState: Record<string, any> = {};
  private groupExpanded = new Map<string, boolean>();
  private resizeObserver: ResizeObserver | null = null;

  private destroyed = false;
  private lastResponsiveWidth = 0;
  private refreshing = false;
  private serverTotal = 0;

  constructor(containerOrId: string | HTMLElement, options: DataTableOptions = {}) {
    this.container = resolveContainer(containerOrId);
    this.options = deepMerge(DATA_TABLE_DEFAULTS, options);
    this.events = new EventBus();

    this.currentPageSize = this.options.pagination?.pageSize ?? 25;

    this.theme = new TableTheme(this.options.style);
    this.dataSource = new DataSource(this.options);
    this.processor = new DataProcessor();

    const userFormatters: Record<string, (v: any) => string> = {};
    if (this.options.formatters) {
      for (const [k, v] of Object.entries(this.options.formatters)) {
        if (v) userFormatters[k] = v;
      }
    }

    this.tableRenderer = new TableRenderer(this.theme, this.events, userFormatters);
    this.paginationRenderer = new PaginationRenderer(this.theme, this.events, this.options.lang);
    this.toolbarRenderer = new ToolbarRenderer(this.theme, this.events, this.options.lang);

    this.selectionManager = new SelectionManager(
      this.options.selection?.mode ?? 'none',
      this.events,
      this.options.selection?.preserveOnFilter
    );

    this.cellEditor = new CellEditor(this.events, this.theme, this.options.editing ?? { enabled: false });

    // Create root element
    this.rootEl = createDiv('katucharts-datatable', this.container);
    Object.assign(this.rootEl.style, this.theme.containerStyles(this.options.width, this.options.height));

    this.tableArea = createDiv('katucharts-dt-table-area', this.rootEl);

    // Placeholder columnManager (will be replaced after data load)
    this.columnManager = new ColumnManager([], this.events);

    // Wire internal events
    this.wireEvents();

    // Apply default sort
    if (this.options.sorting?.defaultSort?.length) {
      this.sortState = this.options.sorting.defaultSort.map(s => ({
        column: s.column,
        direction: s.direction,
      }));
    }

    // Initialize
    this.init();
  }

  private init(): void {
    if (this.options.serverSide?.enabled && this.options.serverSide.url) {
      this.initAsync();
      return;
    }

    const { data } = this.dataSource.loadSync();
    this.initColumns(data);
    this.renderFull();
    this.setupResponsive();
    this.bindUserEvents();
    this.events.emit('datatable:load', {});
  }

  private async initAsync(): Promise<void> {
    try {
      this.showLoading();
      const { data, total } = await this.dataSource.load();
      this.serverTotal = total;
      this.initColumns(data);
      this.renderFull();
      this.setupResponsive();
      this.bindUserEvents();
      this.hideLoading();
      this.events.emit('datatable:load', {});
    } catch (err) {
      this.hideLoading();
      console.error('DataTable: initialization failed', err);
    }
  }

  private initColumns(data: any[]): void {
    const userCols = this.options.columns;
    const colDefs = (userCols && userCols.length > 0) ? userCols : inferColumnsFromData(data);
    const containerWidth = this.rootEl.clientWidth || 800;
    this.columns = normalizeColumns(colDefs, containerWidth);

    // Build select filter options from data if not provided
    for (const col of this.columns) {
      if ((col.type === 'boolean' || col.filterType === 'select') && !col.filterOptions) {
        const unique = [...new Set(data.map(r => r[col.field]).filter(v => v != null))];
        col.filterOptions = unique.sort();
      }
    }

    computePinnedOffsets(this.columns);
    this.columnManager = new ColumnManager(this.columns, this.events);
    this.columnManager.setSortState(this.sortState);
  }

  private renderFull(): void {
    // Clear
    this.rootEl.innerHTML = '';
    this.tableArea = createDiv('katucharts-dt-table-area', this.rootEl);

    // Title
    if (this.options.title?.text) {
      const titleEl = document.createElement('div');
      titleEl.textContent = this.options.title.text;
      Object.assign(titleEl.style, {
        padding: '12px 12px 4px',
        fontSize: '16px',
        fontWeight: '600',
        color: '#1f2937',
        ...(this.options.title.style ?? {}),
      });
      this.rootEl.insertBefore(titleEl, this.tableArea);
    }

    // Toolbar
    if (this.options.toolbar?.enabled !== false) {
      this.toolbarRenderer.render(
        this.rootEl,
        this.options.toolbar ?? {},
        this.options.search ?? {},
        this.options.exporting ?? {},
        this.columns
      );
      this.rootEl.insertBefore(
        this.rootEl.querySelector('.katucharts-dt-toolbar')!,
        this.tableArea
      );
    }

    // Process data
    const result = this.processData();
    this.currentResult = result;

    // Render table
    this.tableRenderer.render(this.tableArea, this.columns, result, {
      height: this.computeBodyHeight(),
      sortingEnabled: this.options.sorting?.enabled !== false,
      filteringEnabled: this.options.filtering?.enabled !== false,
      filterPosition: this.options.filtering?.position ?? 'header',
      resizingEnabled: this.options.columnResizing?.enabled !== false,
      selectionMode: this.options.selection?.mode ?? 'none',
      selectionCheckbox: this.options.selection?.checkbox === true,
      grouping: this.options.grouping,
      masterDetail: this.options.masterDetail,
      treeData: this.options.treeData,
      virtualScroll: this.options.virtualScroll,
      headerGroups: this.options.headerGroups,
      selectedIndices: new Set(this.selectionManager.getSelectedIndices()),
      noDataText: this.options.lang?.noData ?? 'No data available',
      loadingText: this.options.lang?.loading ?? 'Loading...',
    });

    // Pagination
    if (this.options.pagination?.enabled !== false && !this.isVirtualEnabled()) {
      const pageInfo = this.getPageInfo();
      this.paginationRenderer.render(this.rootEl, pageInfo, this.options.pagination!);
    }
  }

  private processData(): ProcessedResult {
    const state: ProcessorState = {
      search: this.searchQuery,
      searchColumns: this.options.search?.columns,
      caseSensitive: this.options.search?.caseSensitive ?? false,
      filters: this.filterState,
      sort: this.sortState,
      groupBy: this.options.grouping?.enabled ? (this.options.grouping.columns ?? []) : [],
      groupExpanded: this.groupExpanded,
      page: this.currentPage,
      pageSize: this.currentPageSize,
      paginationEnabled: this.options.pagination?.enabled !== false,
      scrollTop: 0,
      viewportHeight: 0,
      virtualEnabled: this.isVirtualEnabled(),
      virtualRowHeight: this.options.virtualScroll?.rowHeight ?? this.theme.rowHeight,
      virtualOverscan: this.options.virtualScroll?.overscan ?? 10,
      treeData: this.options.treeData?.enabled ? this.options.treeData : undefined,
    };

    return this.processor.process(this.dataSource.getData(), this.columns, state);
  }

  private isVirtualEnabled(): boolean {
    if (this.options.virtualScroll?.enabled) return true;
    const threshold = this.options.virtualScroll?.threshold ?? 1000;
    return this.dataSource.getData().length >= threshold;
  }

  private computeBodyHeight(): number | string | undefined {
    if (this.options.height) {
      // Subtract estimated toolbar + pagination height
      const h = typeof this.options.height === 'number' ? this.options.height : undefined;
      if (h) return Math.max(100, h - 120);
    }
    if (this.isVirtualEnabled()) return 400;
    return undefined as any;
  }

  private wireEvents(): void {
    // Sort
    this.events.on('header:sort', ({ field, shiftKey }: { field: string; shiftKey: boolean }) => {
      this.handleSort(field, shiftKey);
    });

    // Filter
    this.events.on('filter:change', ({ field, value }: { field: string; value: any }) => {
      this.handleFilter(field, value);
    });

    // Search
    this.events.on('search:change', ({ query }: { query: string }) => {
      this.handleSearch(query);
    });

    // Pagination
    this.events.on('page:change', ({ page }: { page: number }) => {
      this.goToPage(page);
    });

    this.events.on('page:sizechange', ({ pageSize }: { pageSize: number }) => {
      this.setPageSize(pageSize);
    });

    // Selection
    this.events.on('row:click', (data: any) => {
      if (this.options.selection?.mode !== 'none') {
        this.selectionManager.handleRowClick(data.rowIndex, data.row, data.originalEvent);
      }
    });

    this.events.on('selection:checkbox', ({ rowIndex, row, checked }: any) => {
      this.selectionManager.handleCheckboxToggle(rowIndex, row, checked);
    });

    this.events.on('selection:toggleAll', ({ checked }: { checked: boolean }) => {
      if (checked && this.currentResult) {
        this.selectionManager.selectAll(this.currentResult.rows);
      } else {
        this.selectionManager.deselectAll();
      }
      this.refreshRows();
    });

    this.events.on('selection:change', () => {
      if (this.refreshing) return;
      this.refreshRows();
      const headerRenderer = this.tableRenderer.getHeaderRenderer();
      if (headerRenderer) {
        headerRenderer.updateSelectAllCheckbox(
          this.selectionManager.isAllSelected(this.currentResult?.totalFiltered ?? 0),
          this.selectionManager.isSomeSelected()
        );
      }
    });

    // Column visibility
    this.events.on('column:visibility', ({ field, visible }: { field: string; visible: boolean }) => {
      this.columnManager.toggleColumn(field, visible);
      this.renderFull();
    });

    // Column resize
    this.events.on('column:resize', ({ field, width }: { field: string; width: number }) => {
      this.columnManager.resizeColumn(field, width);
    });

    // Export
    this.events.on('export:trigger', ({ format }: { format: string }) => {
      switch (format) {
        case 'csv': this.exportCSV(); break;
        case 'json': this.exportJSON(); break;
        case 'clipboard': this.copyToClipboard(); break;
        case 'html': TableExport.exportHTML(this.getExportData(), this.columns, this.options.exporting?.filename); break;
      }
    });

    // Density
    this.events.on('density:change', ({ density }: { density: DensityMode }) => {
      this.theme.update({ density });
      this.renderFull();
    });

    // Cell editing
    this.events.on('cell:dblclick', (data: any) => {
      if (this.options.editing?.enabled) {
        this.cellEditor.startEditing(data.td, data.value, data.row, data.column, data.rowIndex);
      }
    });

    this.events.on('cell:edit:commit', ({ row, column, oldValue, newValue, rowIndex }: any) => {
      this.dataSource.updateCell(rowIndex, column, newValue);
      this.processor.invalidateAll();
      this.refreshRows();
    });

    // Group toggle
    this.events.on('group:toggle', ({ groupValue, groupColumn, expanded }: any) => {
      const key = `${groupColumn}:${groupValue}`;
      this.groupExpanded.set(key, expanded);
      this.processor.invalidate('group');
      this.refreshRows();
    });

    // Virtual scroll
    this.events.on('virtual:scroll', ({ scrollTop, viewportHeight }: any) => {
      this.tableRenderer.updateVirtualPosition(scrollTop);
    });

    // Fullscreen
    this.events.on('fullscreen:toggle', () => {
      if (document.fullscreenElement === this.rootEl) {
        document.exitFullscreen();
      } else {
        this.rootEl.requestFullscreen?.();
      }
    });

    // Context menu
    this.events.on('row:contextmenu', (data: any) => {
      if (this.options.contextMenu?.enabled && this.options.contextMenu.items?.length) {
        data.originalEvent.preventDefault();
        this.showContextMenu(data);
      }
    });
  }

  private bindUserEvents(): void {
    const evts = this.options.events;
    if (!evts) return;

    const mapping: Record<string, string> = {
      load: 'datatable:load',
      dataLoad: 'datatable:dataload',
      rowClick: 'row:click',
      cellClick: 'cell:click',
      rowDblClick: 'row:dblclick',
      selectionChange: 'selection:change',
      sortChange: 'sort:change',
      filterChange: 'filter:change',
      pageChange: 'page:changed',
      columnResize: 'column:resize',
      columnReorder: 'column:reorder',
      cellEdit: 'cell:edit:commit',
      cellEditCancel: 'cell:edit:cancel',
      groupToggle: 'group:toggle',
      searchChange: 'search:changed',
      scroll: 'scroll',
      destroy: 'datatable:destroy',
    };

    for (const [key, event] of Object.entries(mapping)) {
      const handler = (evts as any)[key];
      if (handler) this.events.on(event, handler.bind(this));
    }
  }

  private handleSort(field: string, multiSort: boolean): void {
    if (multiSort && this.options.sorting?.multiSort) {
      const existing = this.sortState.findIndex(s => s.column === field);
      if (existing >= 0) {
        const current = this.sortState[existing].direction;
        if (current === 'asc') {
          this.sortState[existing].direction = 'desc';
        } else if (current === 'desc') {
          this.sortState.splice(existing, 1);
        }
      } else {
        this.sortState.push({ column: field, direction: 'asc' });
      }
    } else {
      const current = this.sortState.length === 1 && this.sortState[0].column === field
        ? this.sortState[0].direction
        : null;

      if (current === null) {
        this.sortState = [{ column: field, direction: 'asc' }];
      } else if (current === 'asc') {
        this.sortState = [{ column: field, direction: 'desc' }];
      } else {
        this.sortState = [];
      }
    }

    this.columnManager.setSortState(this.sortState);
    this.processor.invalidate('sort');
    this.currentPage = 1;
    this.refreshRows();

    this.events.emit('sort:change', {
      column: field,
      direction: this.sortState.find(s => s.column === field)?.direction ?? null,
      multiSort: [...this.sortState],
    });
  }

  private handleFilter(field: string, value: any): void {
    if (value == null || value === '') {
      delete this.filterState[field];
    } else {
      this.filterState[field] = value;
    }

    this.columnManager.setFilterValue(field, value);
    this.selectionManager.clearOnFilter();
    this.processor.invalidate('filter');
    this.currentPage = 1;
    this.refreshRows();

    this.events.emit('filter:change', {
      column: field,
      value,
      allFilters: { ...this.filterState },
    });
  }

  private handleSearch(query: string): void {
    this.searchQuery = query;
    this.selectionManager.clearOnFilter();
    this.processor.invalidate('search');
    this.currentPage = 1;
    this.refreshRows();

    this.events.emit('search:changed', { query });
  }

  private refreshRows(): void {
    if (this.refreshing) return;
    this.refreshing = true;
    const result = this.processData();
    this.currentResult = result;

    this.tableRenderer.updateRows(result, this.columns, {
      selectionMode: this.options.selection?.mode ?? 'none',
      selectionCheckbox: this.options.selection?.checkbox === true,
      grouping: this.options.grouping,
      masterDetail: this.options.masterDetail,
      treeData: this.options.treeData,
      selectedIndices: new Set(this.selectionManager.getSelectedIndices()),
      noDataText: this.options.lang?.noData ?? 'No data available',
    });

    if (this.options.pagination?.enabled !== false && !this.isVirtualEnabled()) {
      this.paginationRenderer.update(this.getPageInfo(), this.options.pagination!, this.rootEl);
    }
    this.refreshing = false;
  }

  private getExportData(): any[] {
    const onlyVisible = this.options.exporting?.csv?.onlyVisible ?? true;
    return onlyVisible ? (this.currentResult?.rows.filter(r => r._type === 'data').map(r => r._data) ?? [])
      : this.dataSource.getData();
  }

  private setupResponsive(): void {
    if (this.options.responsive === false) return;

    this.lastResponsiveWidth = this.rootEl.clientWidth;

    this.resizeObserver = new ResizeObserver(
      debounce(() => {
        if (this.destroyed) return;
        const width = this.rootEl.clientWidth;
        if (Math.abs(width - this.lastResponsiveWidth) < 2) return;
        this.lastResponsiveWidth = width;
        this.columnManager.applyResponsiveHiding(width);
        this.renderFull();
      }, 250)
    );

    this.resizeObserver.observe(this.container);
  }

  private showContextMenu(data: any): void {
    const items = this.options.contextMenu!.items!;
    const menu = document.createElement('div');
    Object.assign(menu.style, this.theme.contextMenuStyles());
    menu.style.left = `${data.originalEvent.clientX}px`;
    menu.style.top = `${data.originalEvent.clientY}px`;

    for (const item of items) {
      if (item.separator) {
        const sep = document.createElement('hr');
        sep.style.margin = '4px 0';
        sep.style.border = 'none';
        sep.style.borderTop = '1px solid #e5e7eb';
        menu.appendChild(sep);
        continue;
      }

      if (item.visible && !item.visible(data.row, data.column)) continue;

      const el = document.createElement('div');
      const disabled = item.disabled ? item.disabled(data.row, data.column) : false;
      Object.assign(el.style, this.theme.contextMenuItemStyles(disabled));
      el.textContent = item.label;

      if (!disabled) {
        el.addEventListener('mouseenter', () => { el.style.backgroundColor = '#f3f4f6'; });
        el.addEventListener('mouseleave', () => { el.style.backgroundColor = 'transparent'; });
        el.addEventListener('click', () => {
          item.action(data.row, data.column, data.originalEvent);
          removeElement(menu);
        });
      }

      menu.appendChild(el);
    }

    document.body.appendChild(menu);

    const closeMenu = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        removeElement(menu);
        document.removeEventListener('click', closeMenu);
      }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
  }

  // --- Public API ---

  /**
   * Replace all table data. Columns are re-detected if not explicitly set.
   * Use this to feed data from any source (your own fetch, websocket, etc.)
   */
  setData(data: any[]): void {
    this.dataSource.setData(data);
    this.initColumns(data);
    this.processor.invalidateAll();
    this.currentPage = 1;
    this.renderFull();
    this.events.emit('datatable:dataload', { data });
  }

  /**
   * Load data from a URL. Fetches JSON and calls setData().
   * Supports GET/POST, custom headers, and response mapping.
   */
  async loadFromUrl(
    url: string,
    options?: {
      method?: 'GET' | 'POST';
      headers?: Record<string, string>;
      body?: any;
      responseMapper?: (json: any) => { data: any[]; total?: number };
    }
  ): Promise<void> {
    this.showLoading();
    try {
      const method = options?.method ?? 'GET';
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options?.headers ?? {}),
      };

      const fetchOpts: RequestInit = { method, headers };
      if (method === 'POST' && options?.body) {
        fetchOpts.body = JSON.stringify(options.body);
      }

      const response = await fetch(url, fetchOpts);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const json = await response.json();
      let data: any[];
      let total: number | undefined;

      if (options?.responseMapper) {
        const mapped = options.responseMapper(json);
        data = mapped.data;
        total = mapped.total;
      } else if (Array.isArray(json)) {
        data = json;
      } else if (json.data && Array.isArray(json.data)) {
        data = json.data;
        total = json.total ?? json.count ?? json.data.length;
      } else if (json.results && Array.isArray(json.results)) {
        data = json.results;
        total = json.total ?? json.count ?? json.results.length;
      } else {
        data = [json];
      }

      if (total !== undefined) this.serverTotal = total;
      this.setData(data);
      this.hideLoading();
    } catch (err) {
      this.hideLoading();
      console.error('DataTable: loadFromUrl failed', err);
      this.events.emit('datatable:error', { error: err, url });
    }
  }

  getData(): any[] {
    return this.dataSource.getData();
  }

  getFilteredData(): any[] {
    return this.currentResult?.rows.filter(r => r._type === 'data').map(r => r._data) ?? [];
  }

  getSelectedData(): any[] {
    return this.selectionManager.getSelectedData(this.dataSource.getData());
  }

  addRow(row: any, index?: number): void {
    this.dataSource.addRow(row, index);
    this.processor.invalidateAll();
    this.refreshRows();
  }

  removeRow(indexOrPredicate: number | ((row: any) => boolean)): void {
    if (typeof indexOrPredicate === 'function') {
      const data = this.dataSource.getData();
      for (let i = data.length - 1; i >= 0; i--) {
        if (indexOrPredicate(data[i])) {
          this.dataSource.removeRow(i);
        }
      }
    } else {
      this.dataSource.removeRow(indexOrPredicate);
    }
    this.processor.invalidateAll();
    this.refreshRows();
  }

  updateRow(index: number, data: Partial<any>): void {
    this.dataSource.updateRow(index, data);
    this.processor.invalidateAll();
    this.refreshRows();
  }

  updateCell(rowIndex: number, column: string, value: any): void {
    this.dataSource.updateCell(rowIndex, column, value);
    this.processor.invalidateAll();
    this.refreshRows();
  }

  getRow(index: number): any {
    return this.dataSource.getData()[index];
  }

  getRowCount(): number {
    return this.dataSource.getData().length;
  }

  getFilteredRowCount(): number {
    return this.currentResult?.totalFiltered ?? 0;
  }

  // Columns
  getColumns(): ColumnDefinition[] {
    return this.columns.map(c => ({
      field: c.field, title: c.title, type: c.type, width: c._computedWidth,
      visible: c._visible, pinned: c.pinned, align: c.align,
    }));
  }

  updateColumn(field: string, updates: Partial<ColumnDefinition>): void {
    this.columnManager.updateColumn(field, updates as Partial<InternalColumnDef>);
    this.renderFull();
  }

  showColumn(field: string): void {
    this.columnManager.showColumn(field);
    this.renderFull();
  }

  hideColumn(field: string): void {
    this.columnManager.hideColumn(field);
    this.renderFull();
  }

  pinColumn(field: string, direction: PinDirection): void {
    this.columnManager.pinColumn(field, direction);
    this.renderFull();
  }

  // Sorting
  sort(column: string, direction?: SortDirection): void {
    if (direction) {
      this.sortState = [{ column, direction }];
    } else {
      this.handleSort(column, false);
      return;
    }
    this.columnManager.setSortState(this.sortState);
    this.processor.invalidate('sort');
    this.currentPage = 1;
    this.refreshRows();
  }

  clearSort(): void {
    this.sortState = [];
    this.columnManager.setSortState([]);
    this.processor.invalidate('sort');
    this.refreshRows();
  }

  getSortState(): SortState[] {
    return [...this.sortState];
  }

  // Filtering
  setFilter(column: string, value: any): void {
    this.handleFilter(column, value);
  }

  clearFilter(column?: string): void {
    if (column) {
      delete this.filterState[column];
      this.columnManager.setFilterValue(column, null);
    } else {
      this.filterState = {};
      this.columnManager.clearFilters();
    }
    this.processor.invalidate('filter');
    this.currentPage = 1;
    this.refreshRows();
  }

  getFilterState(): Record<string, any> {
    return { ...this.filterState };
  }

  // Search
  search(query: string): void {
    this.handleSearch(query);
    this.toolbarRenderer.getSearchRenderer().setValue(query);
  }

  clearSearch(): void {
    this.search('');
  }

  // Pagination
  goToPage(page: number): void {
    const info = this.getPageInfo();
    this.currentPage = Math.max(1, Math.min(page, info.totalPages));
    this.processor.invalidate('paginate');
    this.refreshRows();

    this.events.emit('page:changed', {
      page: this.currentPage,
      pageSize: this.currentPageSize,
      totalPages: info.totalPages,
    });
  }

  setPageSize(size: number): void {
    this.currentPageSize = size;
    this.currentPage = 1;
    this.processor.invalidateAll();
    this.refreshRows();
  }

  getPageInfo(): PageInfo {
    const totalFiltered = this.currentResult?.totalFiltered ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalFiltered / this.currentPageSize));
    const from = totalFiltered > 0 ? (this.currentPage - 1) * this.currentPageSize + 1 : 0;
    const to = Math.min(this.currentPage * this.currentPageSize, totalFiltered);

    return {
      page: this.currentPage,
      pageSize: this.currentPageSize,
      totalPages,
      totalRows: totalFiltered,
      from,
      to,
    };
  }

  // Selection
  selectRow(index: number | number[]): void {
    this.selectionManager.selectRow(index);
    this.refreshRows();
  }

  deselectRow(index: number | number[]): void {
    this.selectionManager.deselectRow(index);
    this.refreshRows();
  }

  selectAll(): void {
    if (this.currentResult) {
      this.selectionManager.selectAll(this.currentResult.rows);
      this.refreshRows();
    }
  }

  deselectAll(): void {
    this.selectionManager.deselectAll();
    this.refreshRows();
  }

  getSelectedRows(): any[] {
    return this.selectionManager.getSelectedData(this.dataSource.getData());
  }

  getSelectedIndices(): number[] {
    return this.selectionManager.getSelectedIndices();
  }

  // Grouping
  groupBy(columns: string[]): void {
    this.options.grouping = { ...this.options.grouping, enabled: true, columns };
    this.processor.invalidateAll();
    this.renderFull();
  }

  ungroup(): void {
    this.options.grouping = { ...this.options.grouping, enabled: false, columns: [] };
    this.groupExpanded.clear();
    this.processor.invalidateAll();
    this.renderFull();
  }

  expandGroup(value: any): void {
    for (const [key] of this.groupExpanded) {
      if (key.endsWith(`:${value}`)) {
        this.groupExpanded.set(key, true);
      }
    }
    this.processor.invalidate('group');
    this.refreshRows();
  }

  collapseGroup(value: any): void {
    for (const [key] of this.groupExpanded) {
      if (key.endsWith(`:${value}`)) {
        this.groupExpanded.set(key, false);
      }
    }
    this.processor.invalidate('group');
    this.refreshRows();
  }

  expandAll(): void {
    for (const [key] of this.groupExpanded) {
      this.groupExpanded.set(key, true);
    }
    this.processor.invalidate('group');
    this.refreshRows();
  }

  collapseAll(): void {
    for (const [key] of this.groupExpanded) {
      this.groupExpanded.set(key, false);
    }
    this.processor.invalidate('group');
    this.refreshRows();
  }

  // Export
  exportCSV(opts?: any): void {
    TableExport.exportCSV(this.getExportData(), this.columns, { ...this.options.exporting?.csv, ...opts }, this.options.exporting?.filename);
    this.events.emit('export:csv');
  }

  exportJSON(opts?: any): void {
    TableExport.exportJSON(this.getExportData(), this.columns, { ...this.options.exporting?.json, ...opts }, this.options.exporting?.filename);
    this.events.emit('export:json');
  }

  copyToClipboard(): void {
    TableExport.copyToClipboard(this.getExportData(), this.columns);
    this.events.emit('export:clipboard');
  }

  getCSV(): string {
    return TableExport.toCSV(this.getExportData(), this.columns, this.options.exporting?.csv);
  }

  getJSON(): string {
    return TableExport.toJSON(this.getExportData(), this.columns, this.options.exporting?.json);
  }

  getHTML(): string {
    return TableExport.toHTML(this.getExportData(), this.columns);
  }

  // Display
  update(options: Partial<DataTableOptions>): void {
    this.options = deepMerge(this.options, options);
    if (options.style) this.theme.update(options.style);
    if (options.data) {
      this.dataSource.setData(options.data);
      this.initColumns(options.data);
    }
    this.processor.invalidateAll();
    this.renderFull();
  }

  redraw(): void {
    this.processor.invalidateAll();
    this.renderFull();
  }

  showLoading(text?: string): void {
    this.tableRenderer.showLoading(text);
  }

  hideLoading(): void {
    this.tableRenderer.hideLoading();
  }

  scrollToRow(index: number): void {
    this.tableRenderer.scrollToRow(index);
  }

  // Trigger actions — programmatic action execution
  trigger(action: string, payload?: any): this {
    switch (action) {
      case 'sort':
        if (payload?.column) this.sort(payload.column, payload.direction);
        break;
      case 'filter':
        if (payload?.column) this.setFilter(payload.column, payload.value);
        break;
      case 'clearFilters':
        this.clearFilter();
        break;
      case 'search':
        this.search(payload?.query ?? '');
        break;
      case 'clearSearch':
        this.clearSearch();
        break;
      case 'goToPage':
        if (payload?.page) this.goToPage(payload.page);
        break;
      case 'nextPage':
        this.goToPage(this.currentPage + 1);
        break;
      case 'prevPage':
        this.goToPage(this.currentPage - 1);
        break;
      case 'firstPage':
        this.goToPage(1);
        break;
      case 'lastPage':
        this.goToPage(this.getPageInfo().totalPages);
        break;
      case 'setPageSize':
        if (payload?.size) this.setPageSize(payload.size);
        break;
      case 'selectAll':
        this.selectAll();
        break;
      case 'deselectAll':
        this.deselectAll();
        break;
      case 'selectRow':
        if (payload?.index != null) this.selectRow(payload.index);
        break;
      case 'deselectRow':
        if (payload?.index != null) this.deselectRow(payload.index);
        break;
      case 'addRow':
        if (payload?.row) this.addRow(payload.row, payload.index);
        break;
      case 'removeRow':
        if (payload?.index != null) this.removeRow(payload.index);
        break;
      case 'updateRow':
        if (payload?.index != null && payload?.data) this.updateRow(payload.index, payload.data);
        break;
      case 'updateCell':
        if (payload?.rowIndex != null && payload?.column) this.updateCell(payload.rowIndex, payload.column, payload.value);
        break;
      case 'exportCSV':
        this.exportCSV(payload);
        break;
      case 'exportJSON':
        this.exportJSON(payload);
        break;
      case 'copyToClipboard':
        this.copyToClipboard();
        break;
      case 'showColumn':
        if (payload?.field) this.showColumn(payload.field);
        break;
      case 'hideColumn':
        if (payload?.field) this.hideColumn(payload.field);
        break;
      case 'pinColumn':
        if (payload?.field) this.pinColumn(payload.field, payload.direction ?? null);
        break;
      case 'groupBy':
        if (payload?.columns) this.groupBy(payload.columns);
        break;
      case 'ungroup':
        this.ungroup();
        break;
      case 'expandAll':
        this.expandAll();
        break;
      case 'collapseAll':
        this.collapseAll();
        break;
      case 'showLoading':
        this.showLoading(payload?.text);
        break;
      case 'hideLoading':
        this.hideLoading();
        break;
      case 'scrollToRow':
        if (payload?.index != null) this.scrollToRow(payload.index);
        break;
      case 'redraw':
        this.redraw();
        break;
      case 'setDensity':
        if (payload?.density) {
          this.theme.update({ density: payload.density });
          this.renderFull();
        }
        break;
      case 'setData':
        if (payload?.data) this.setData(payload.data);
        break;
      case 'loadFromUrl':
        if (payload?.url) this.loadFromUrl(payload.url, payload);
        break;
      default:
        this.events.emit(`action:${action}`, payload);
        break;
    }
    return this;
  }

  // Events
  on(event: string, callback: (...args: any[]) => void): this {
    this.events.on(event, callback);
    return this;
  }

  off(event: string, callback?: (...args: any[]) => void): this {
    this.events.off(event, callback);
    return this;
  }

  destroy(): void {
    this.destroyed = true;
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    this.cellEditor.destroy();
    this.selectionManager.destroy();
    this.tableRenderer.destroy();
    this.paginationRenderer.destroy();
    this.toolbarRenderer.destroy();
    this.columnManager.destroy();
    this.events.emit('datatable:destroy', {});
    this.events.removeAllListeners();

    removeElement(this.rootEl);
  }
}

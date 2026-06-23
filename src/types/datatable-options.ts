/**
 * TypeScript interfaces for the KatuCharts DataTable module.
 */

import type { CSSObject, AlignType } from './options';

export type { CSSObject, AlignType } from './options';

export type ColumnType = 'string' | 'number' | 'date' | 'boolean' | 'html';
export type SortDirection = 'asc' | 'desc' | null;
export type FilterType =
  | 'text' | 'number' | 'select' | 'multiselect' | 'faceted'
  | 'boolean' | 'date' | 'daterange' | 'numberrange';
export type SelectionMode = 'none' | 'single' | 'multi';
export type PinDirection = 'left' | 'right' | null;
export type DensityMode = 'compact' | 'normal' | 'comfortable';
export type LayoutStyle = 'default' | 'bordered' | 'minimal' | 'striped-dark';

export interface FormatterContext {
  value: any;
  row: any;
  column: ColumnDefinition;
  rowIndex: number;
}

export interface CellStyleContext {
  value: any;
  row: any;
  column: ColumnDefinition;
  rowIndex: number;
}

export interface RowStyleContext {
  row: any;
  rowIndex: number;
}

export interface CustomEditorResult {
  getValue: () => any;
  destroy: () => void;
}

export type CustomEditorFn = (
  cell: HTMLElement,
  value: any,
  row: any,
  column: ColumnDefinition
) => CustomEditorResult;

/** TanStack-compatible column facade passed to header/cell callbacks. */
export interface ColumnApi {
  id: string;
  columnDef: ColumnDefinition;
  getCanSort(): boolean;
  getCanHide(): boolean;
  getIsSorted(): 'asc' | 'desc' | false;
  toggleSorting(desc?: boolean): void;
  clearSorting(): void;
  getIsVisible(): boolean;
  toggleVisibility(visible?: boolean): void;
  getFilterValue(): any;
  setFilterValue(value: any): void;
}

/** TanStack-compatible row facade passed to cell callbacks. */
export interface RowApi {
  id: string;
  index: number;
  original: any;
  getValue(columnId: string): any;
  renderValue(columnId: string): any;
  getIsSelected(): boolean;
  toggleSelected(selected?: boolean): void;
}

/** TanStack-compatible table facade passed to header/cell callbacks. */
export interface TableApi {
  getColumn(id: string): ColumnApi | undefined;
  getAllColumns(): ColumnApi[];
  getAllLeafColumns(): ColumnApi[];
  getIsAllPageRowsSelected(): boolean;
  getIsSomePageRowsSelected(): boolean;
  toggleAllPageRowsSelected(selected?: boolean): void;
  getState(): { pagination: { pageIndex: number; pageSize: number } };
  nextPage(): void;
  previousPage(): void;
  setPageIndex(index: number): void;
  setPageSize(size: number): void;
  getCanNextPage(): boolean;
  getCanPreviousPage(): boolean;
  getPageCount(): number;
}

export interface HeaderContext {
  column: ColumnApi;
  table: TableApi;
}

export interface CellContext {
  row: RowApi;
  column: ColumnApi;
  table: TableApi;
  getValue(): any;
  renderValue(): any;
}

export type HeaderRenderFn = (ctx: HeaderContext) => string | Node;
export type CellRenderFn = (ctx: CellContext) => string | Node;
export type ColumnFilterFn = (row: any, columnId: string, filterValue: any) => boolean;

export interface ColumnDefinition {
  field: string;
  title?: string;
  type?: ColumnType;
  width?: number | string;
  minWidth?: number;
  maxWidth?: number;
  align?: AlignType;
  headerAlign?: AlignType;
  visible?: boolean;
  sortable?: boolean;
  filterable?: boolean;
  resizable?: boolean;
  reorderable?: boolean;
  pinned?: PinDirection;
  formatter?: (this: FormatterContext) => string;
  headerFormatter?: (this: { column: ColumnDefinition }) => string;
  comparator?: (a: any, b: any) => number;
  filterType?: FilterType;
  filterOptions?: any[];
  cellStyle?: CSSObject | ((this: CellStyleContext) => CSSObject);
  cellClass?: string | ((this: { value: any; row: any }) => string);
  headerStyle?: CSSObject;
  editable?: boolean;
  editor?: 'text' | 'number' | 'select' | 'date' | 'checkbox' | CustomEditorFn;
  editorOptions?: any[];
  validator?: (value: any, row: any) => boolean | string;
  aggregate?: 'sum' | 'avg' | 'count' | 'min' | 'max' | ((values: any[]) => any);
  groupFormatter?: (this: { value: any; count: number; rows: any[] }) => string;
  priority?: number;
  headerTooltip?: string;
  cellTooltip?: boolean | ((this: { value: any; row: any }) => string);

  /**
   * TanStack-compatible aliases. These let you paste familiar column
   * definitions, e.g.:
   *   { accessorKey: 'amount', header: ({ column }) => ..., cell: ({ row }) => ... }
   */
  accessorKey?: string;
  accessorFn?: (row: any) => any;
  id?: string;
  header?: string | HeaderRenderFn;
  cell?: CellRenderFn;
  enableSorting?: boolean;
  enableHiding?: boolean;
  enableColumnFilter?: boolean;
  filterFn?: ColumnFilterFn;
  meta?: Record<string, any>;
  size?: number;
  minSize?: number;
  maxSize?: number;
}

export interface DataTableEventsOptions {
  load?: (this: any, event: Event) => void;
  dataLoad?: (this: any, event: { data: any[] }) => void;
  rowClick?: (this: any, event: { row: any; rowIndex: number; originalEvent: MouseEvent }) => void;
  cellClick?: (this: any, event: {
    value: any; row: any; column: ColumnDefinition;
    rowIndex: number; colIndex: number; originalEvent: MouseEvent;
  }) => void;
  rowDblClick?: (this: any, event: { row: any; rowIndex: number; originalEvent: MouseEvent }) => void;
  selectionChange?: (this: any, event: { selected: any[]; added: any[]; removed: any[] }) => void;
  sortChange?: (this: any, event: {
    column: string; direction: SortDirection;
    multiSort: Array<{ column: string; direction: SortDirection }>;
  }) => void;
  filterChange?: (this: any, event: { column: string; value: any; allFilters: Record<string, any> }) => void;
  pageChange?: (this: any, event: { page: number; pageSize: number; totalPages: number }) => void;
  columnResize?: (this: any, event: { column: string; width: number }) => void;
  columnReorder?: (this: any, event: { column: string; fromIndex: number; toIndex: number }) => void;
  cellEdit?: (this: any, event: { row: any; column: string; oldValue: any; newValue: any }) => void;
  cellEditCancel?: (this: any, event: { row: any; column: string; value: any }) => void;
  groupToggle?: (this: any, event: { groupValue: any; expanded: boolean }) => void;
  searchChange?: (this: any, event: { query: string }) => void;
  scroll?: (this: any, event: { scrollTop: number; scrollLeft: number }) => void;
  destroy?: (this: any, event: Event) => void;
}

export interface PaginationOptions {
  enabled?: boolean;
  pageSize?: number;
  pageSizes?: number[];
  position?: 'top' | 'bottom' | 'both';
  showPageSizeSelector?: boolean;
  showPageInfo?: boolean;
  showFirstLast?: boolean;
  style?: CSSObject;
  buttonStyle?: CSSObject;
  activeButtonStyle?: CSSObject;
}

export interface SearchOptions {
  enabled?: boolean;
  placeholder?: string;
  debounceMs?: number;
  caseSensitive?: boolean;
  columns?: string[];
  position?: 'toolbar' | 'above';
  style?: CSSObject;
  inputStyle?: CSSObject;
}

export interface ToolbarOptions {
  enabled?: boolean;
  position?: 'top' | 'bottom' | 'both';
  items?: ('search' | 'columnToggle' | 'export' | 'fullscreen' | 'density')[];
  style?: CSSObject;
  customItems?: Array<{
    content: string;
    onClick?: () => void;
    position?: 'left' | 'right';
    style?: CSSObject;
  }>;
}

export interface ExportTableOptions {
  enabled?: boolean;
  formats?: ('csv' | 'json' | 'clipboard' | 'html')[];
  filename?: string;
  csv?: {
    delimiter?: string;
    lineDelimiter?: string;
    decimalPoint?: string;
    includeHeaders?: boolean;
    onlyVisible?: boolean;
  };
  json?: {
    indent?: number;
    onlyVisible?: boolean;
  };
}

export interface ServerSideOptions {
  enabled?: boolean;
  url?: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  requestMapper?: (params: ServerSideRequestParams) => any;
  responseMapper?: (response: any) => { data: any[]; total: number };
  debounceMs?: number;
  loadingText?: string;
}

export interface ServerSideRequestParams {
  page: number;
  pageSize: number;
  sort: Array<{ column: string; direction: SortDirection }>;
  filters: Record<string, any>;
  search: string;
}

export interface VirtualScrollOptions {
  enabled?: boolean;
  rowHeight?: number;
  overscan?: number;
  threshold?: number;
}

export interface GroupingOptions {
  enabled?: boolean;
  columns?: string[];
  expanded?: boolean;
  showCount?: boolean;
  aggregations?: Record<string, 'sum' | 'avg' | 'count' | 'min' | 'max' | ((values: any[]) => any)>;
  headerStyle?: CSSObject;
  headerFormatter?: (this: { value: any; column: string; count: number }) => string;
}

export interface MasterDetailOptions {
  enabled?: boolean;
  renderer?: (row: any, container: HTMLElement) => void | HTMLElement;
  height?: number | 'auto';
  expandOnRowClick?: boolean;
  expandIcon?: string;
  collapseIcon?: string;
  singleExpand?: boolean;
}

export interface TreeDataOptions {
  enabled?: boolean;
  childrenField?: string;
  expandAll?: boolean;
  indent?: number;
}

export interface ContextMenuItem {
  label: string;
  icon?: string;
  action: (row: any, column: ColumnDefinition, event: MouseEvent) => void;
  visible?: (row: any, column: ColumnDefinition) => boolean;
  disabled?: (row: any, column: ColumnDefinition) => boolean;
  separator?: boolean;
}

export interface ContextMenuOptions {
  enabled?: boolean;
  items?: ContextMenuItem[];
}

export interface HeaderGroupDefinition {
  title: string;
  columns: string[];
  style?: CSSObject;
}

export interface DataTableStyleOptions {
  containerStyle?: CSSObject;
  tableStyle?: CSSObject;
  headerStyle?: CSSObject;
  headerCellStyle?: CSSObject;
  bodyStyle?: CSSObject;
  rowStyle?: CSSObject | ((this: RowStyleContext) => CSSObject);
  cellStyle?: CSSObject;
  alternateRowColor?: string | false;
  hoverRowColor?: string | false;
  selectedRowColor?: string | false;
  borderColor?: string;
  fontSize?: string;
  fontFamily?: string;
  headerFontSize?: string;
  headerFontWeight?: string;
  rowHeight?: number;
  headerHeight?: number;
  density?: DensityMode;
  layout?: LayoutStyle;
  stripedRows?: boolean;
  showBorders?: boolean | 'horizontal' | 'vertical' | 'both' | 'none';

  /** Light or dark palette. Maps to the `data-theme` attribute. */
  theme?: 'light' | 'dark';
  /** Page/cell background color. */
  background?: string;
  /** Default text color. */
  foreground?: string;
  /** Subtle surface color (headers, group rows, badges). */
  mutedColor?: string;
  /** Secondary/placeholder text color. */
  mutedForeground?: string;
  /** Hover/active surface color for rows, buttons and menu items. */
  accentColor?: string;
  /** Primary accent (selected checkbox, active pagination button). */
  primaryColor?: string;
  /** Corner radius for the container, inputs, buttons and menus. */
  radius?: number | string;
  /** Escape hatch: any extra `--kdt-*` custom properties to set on the root. */
  cssVars?: Record<string, string>;
}

/**
 * Per-part class hooks. Strings are appended to the element's class list,
 * letting consumers attach their own CSS (e.g. Tailwind utilities) to any
 * structural piece of the table — the `className` convention.
 */
export interface DataTableClassNames {
  root?: string;
  toolbar?: string;
  title?: string;
  search?: string;
  table?: string;
  header?: string;
  headerRow?: string;
  headerCell?: string;
  filterRow?: string;
  body?: string;
  row?: string;
  cell?: string;
  footer?: string;
  pagination?: string;
}

export interface DataTableLangOptions {
  search?: string;
  noData?: string;
  loading?: string;
  pageInfo?: string;
  pageSizeLabel?: string;
  firstPage?: string;
  lastPage?: string;
  previousPage?: string;
  nextPage?: string;
  selectAll?: string;
  columns?: string;
  exportCSV?: string;
  exportJSON?: string;
  copyClipboard?: string;
  resetFilters?: string;
  of?: string;
  rows?: string;
  showing?: string;
  /** Placeholder for the per-column text filter input. */
  filterPlaceholder?: string;
  /** "All" option shown in select and boolean column filters. */
  filterAll?: string;
  /** "True" option in boolean column filters. */
  filterTrue?: string;
  /** "False" option in boolean column filters. */
  filterFalse?: string;
  /** Placeholder for the lower bound of a numeric range filter. */
  rangeMin?: string;
  /** Placeholder for the upper bound of a numeric range filter. */
  rangeMax?: string;
  /** Accessible label for the header "select all rows" checkbox. */
  selectAllRows?: string;
  /** Accessible label for a per-row selection checkbox. */
  selectRow?: string;
  /** Heading of the column visibility menu. */
  toggleColumns?: string;
  /** Label of the export menu button. */
  exportButton?: string;
  /** "Export HTML" item in the export menu. */
  exportHTML?: string;
  /** Label of the row-density menu button. */
  density?: string;
  /** "Compact" density option. */
  densityCompact?: string;
  /** "Normal" density option. */
  densityNormal?: string;
  /** "Comfortable" density option. */
  densityComfortable?: string;
}

export interface SortingOptions {
  enabled?: boolean;
  multiSort?: boolean;
  defaultSort?: Array<{ column: string; direction: SortDirection }>;
}

export interface FilteringOptions {
  /** Master switch for all per-column filtering. */
  enabled?: boolean;
  /** Where the per-column filter inputs live. */
  position?: 'header' | 'toolbar';
  /** Render the inline filter row under the header (defaults to true when enabled). */
  showFilterRow?: boolean;
  /** Case sensitivity for text filters. */
  caseSensitive?: boolean;
  /** Show a "reset filters" control in the toolbar when any filter is active. */
  showReset?: boolean;
}

export interface SelectionOptions {
  mode?: SelectionMode;
  checkbox?: boolean;
  selectAll?: boolean;
  preserveOnFilter?: boolean;
}

export interface EditingOptions {
  enabled?: boolean;
  mode?: 'cell' | 'row';
  saveOnBlur?: boolean;
}

export interface DataTableOptions {
  data?: any[];
  columns?: ColumnDefinition[];
  rowKey?: string;

  title?: { text?: string; style?: CSSObject };
  style?: DataTableStyleOptions;
  height?: number | string;
  width?: number | string;
  responsive?: boolean;

  sorting?: SortingOptions;
  filtering?: FilteringOptions;
  search?: SearchOptions;
  pagination?: PaginationOptions;
  selection?: SelectionOptions;
  editing?: EditingOptions;
  columnPinning?: { enabled?: boolean };
  columnResizing?: { enabled?: boolean };
  columnReordering?: { enabled?: boolean };
  columnVisibility?: { enabled?: boolean };
  grouping?: GroupingOptions;
  virtualScroll?: VirtualScrollOptions;
  masterDetail?: MasterDetailOptions;
  treeData?: TreeDataOptions;
  contextMenu?: ContextMenuOptions;
  toolbar?: ToolbarOptions;
  exporting?: ExportTableOptions;
  serverSide?: ServerSideOptions;
  headerGroups?: HeaderGroupDefinition[];

  formatters?: {
    number?: (value: number) => string;
    date?: (value: Date | string | number) => string;
    currency?: (value: number) => string;
    percentage?: (value: number) => string;
    boolean?: (value: boolean) => string;
  };

  events?: DataTableEventsOptions;
  /**
   * Locale code for the built-in UI strings (e.g. `'pt-BR'`, `'es'`, `'zh'`).
   * Omitted or `'auto'` auto-detects from the browser language and falls back to
   * English; any other value pins that locale. Per-key `lang` overrides always win.
   */
  locale?: string;
  lang?: DataTableLangOptions;
  chart?: any;

  /** Per-part class hooks (`className` convention). */
  classNames?: DataTableClassNames;

  /**
   * TanStack-style initial state. A convenient way to set the starting page
   * size, sort, hidden columns and active filters in one place.
   */
  initialState?: {
    pagination?: { pageSize?: number; pageIndex?: number };
    sorting?: Array<{ column?: string; id?: string; direction?: SortDirection; desc?: boolean }>;
    columnVisibility?: Record<string, boolean>;
    columnFilters?: Array<{ id: string; value: any }> | Record<string, any>;
  };
}

export interface InternalColumnDef extends ColumnDefinition {
  _index: number;
  _computedWidth: number;
  _explicitWidth?: boolean;
  _visible: boolean;
  _sortDirection: SortDirection;
  _sortPriority: number;
  _filterValue: any;
  _pinnedOffset: number;
}

export interface ProcessedRow {
  _type: 'data' | 'group-header' | 'group-footer' | 'detail';
  _index: number;
  _originalIndex: number;
  _data: any;
  _depth: number;
  _groupValue?: any;
  _groupColumn?: string;
  _groupCount?: number;
  _expanded?: boolean;
  _selected?: boolean;
  _children?: ProcessedRow[];
  _parentKey?: string;
  _visible: boolean;
}

export interface ProcessedResult {
  rows: ProcessedRow[];
  totalFiltered: number;
  totalAll: number;
  aggregates: Record<string, Record<string, any>>;
  groups?: GroupInfo[];
}

export interface GroupInfo {
  column: string;
  value: any;
  count: number;
  expanded: boolean;
  rows: any[];
  aggregates: Record<string, any>;
}

export interface PageInfo {
  page: number;
  pageSize: number;
  totalPages: number;
  totalRows: number;
  from: number;
  to: number;
}

export interface SortState {
  column: string;
  direction: SortDirection;
}

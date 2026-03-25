/**
 * TypeScript interfaces for the KatuCharts DataTable module.
 */

import type { CSSObject, AlignType } from './options';

export type { CSSObject, AlignType } from './options';

export type ColumnType = 'string' | 'number' | 'date' | 'boolean' | 'html';
export type SortDirection = 'asc' | 'desc' | null;
export type FilterType = 'text' | 'number' | 'select' | 'date' | 'daterange' | 'numberrange';
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
  showBorders?: boolean | 'horizontal' | 'vertical' | 'both';
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
}

export interface SortingOptions {
  enabled?: boolean;
  multiSort?: boolean;
  defaultSort?: Array<{ column: string; direction: SortDirection }>;
}

export interface FilteringOptions {
  enabled?: boolean;
  position?: 'header' | 'toolbar';
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
  lang?: DataTableLangOptions;
  chart?: any;
}

export interface InternalColumnDef extends ColumnDefinition {
  _index: number;
  _computedWidth: number;
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

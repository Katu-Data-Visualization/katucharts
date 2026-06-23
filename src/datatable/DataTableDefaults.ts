/**
 * Default option values for DataTable.
 */

import type { DataTableOptions } from '../types/datatable-options';

export const DATA_TABLE_DEFAULTS: DataTableOptions = {
  data: [],
  responsive: true,

  sorting: {
    enabled: true,
    multiSort: false,
    defaultSort: [],
  },

  filtering: {
    enabled: true,
    position: 'header',
  },

  search: {
    enabled: false,
    placeholder: 'Search...',
    debounceMs: 300,
    caseSensitive: false,
  },

  pagination: {
    enabled: true,
    pageSize: 25,
    pageSizes: [10, 25, 50, 100],
    position: 'bottom',
    showPageSizeSelector: true,
    showPageInfo: true,
    showFirstLast: true,
  },

  selection: {
    mode: 'none',
    checkbox: false,
    selectAll: true,
    preserveOnFilter: false,
  },

  editing: {
    enabled: false,
    mode: 'cell',
    saveOnBlur: true,
  },

  columnPinning: { enabled: false },
  columnResizing: { enabled: true },
  columnReordering: { enabled: false },
  columnVisibility: { enabled: true },

  grouping: {
    enabled: false,
    expanded: true,
    showCount: true,
  },

  virtualScroll: {
    enabled: false,
    rowHeight: 36,
    overscan: 10,
    threshold: 1000,
  },

  masterDetail: {
    enabled: false,
    expandOnRowClick: false,
    singleExpand: false,
    expandIcon: '\u25B6',
    collapseIcon: '\u25BC',
  },

  treeData: {
    enabled: false,
    childrenField: 'children',
    expandAll: false,
    indent: 20,
  },

  contextMenu: {
    enabled: false,
  },

  toolbar: {
    enabled: true,
    position: 'top',
    items: ['search', 'columnToggle', 'export'],
  },

  exporting: {
    enabled: true,
    formats: ['csv', 'json', 'clipboard'],
    csv: {
      delimiter: ',',
      lineDelimiter: '\n',
      decimalPoint: '.',
      includeHeaders: true,
      onlyVisible: true,
    },
    json: {
      indent: 2,
      onlyVisible: true,
    },
  },

  serverSide: {
    enabled: false,
    method: 'GET',
    debounceMs: 300,
    loadingText: 'Loading...',
  },

  style: {
    density: 'normal',
    stripedRows: false,
    showBorders: 'horizontal',
  },

  /**
   * UI strings are resolved per-locale at construction time (English base, then
   * the matched locale pack, then these user overrides), so the defaults stay empty.
   */
  lang: {},
};

export const DENSITY_ROW_HEIGHTS: Record<string, number> = {
  compact: 34,
  normal: 44,
  comfortable: 56,
};

export const DENSITY_HEADER_HEIGHTS: Record<string, number> = {
  compact: 36,
  normal: 44,
  comfortable: 52,
};

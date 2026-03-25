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
  columnVisibility: { enabled: false },

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
    alternateRowColor: '#f9fafb',
    hoverRowColor: '#e8f0fe',
    selectedRowColor: '#d2e3fc',
    borderColor: '#e0e0e0',
    fontSize: '13px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    headerFontSize: '13px',
    headerFontWeight: '600',
    density: 'normal',
    stripedRows: true,
    showBorders: 'horizontal',
  },

  lang: {
    search: 'Search...',
    noData: 'No data available',
    loading: 'Loading...',
    pageInfo: 'Showing {from}-{to} of {total}',
    pageSizeLabel: 'Rows per page:',
    firstPage: '\u00AB',
    lastPage: '\u00BB',
    previousPage: '\u2039',
    nextPage: '\u203A',
    selectAll: 'Select all',
    columns: 'Columns',
    exportCSV: 'Export CSV',
    exportJSON: 'Export JSON',
    copyClipboard: 'Copy to clipboard',
    resetFilters: 'Reset filters',
    of: 'of',
    rows: 'rows',
    showing: 'Showing',
  },
};

export const DENSITY_ROW_HEIGHTS: Record<string, number> = {
  compact: 28,
  normal: 36,
  comfortable: 48,
};

export const DENSITY_HEADER_HEIGHTS: Record<string, number> = {
  compact: 32,
  normal: 40,
  comfortable: 52,
};

export const DENSITY_CELL_PADDING: Record<string, string> = {
  compact: '2px 8px',
  normal: '6px 12px',
  comfortable: '12px 16px',
};

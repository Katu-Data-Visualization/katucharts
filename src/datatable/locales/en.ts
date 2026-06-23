/**
 * English locale pack — the base/fallback for every other locale.
 *
 * This pack is complete: it populates every key in DataTableLangOptions and is
 * the single source of truth for English defaults. resolveLocale always starts
 * from this pack, so partial packs only need to list the strings they translate.
 */

import type { DataTableLangOptions } from '../../types/datatable-options';

export const enLocale: Required<DataTableLangOptions> = {
  search: 'Search...',
  noData: 'No data available',
  loading: 'Loading...',
  pageInfo: 'Showing {from}-{to} of {total}',
  pageSizeLabel: 'Rows per page:',
  firstPage: '«',
  lastPage: '»',
  previousPage: '‹',
  nextPage: '›',
  selectAll: 'Select all',
  columns: 'Columns',
  exportCSV: 'Export CSV',
  exportJSON: 'Export JSON',
  copyClipboard: 'Copy to clipboard',
  resetFilters: 'Reset filters',
  of: 'of',
  rows: 'rows',
  showing: 'Showing',
  filterPlaceholder: 'Filter…',
  filterAll: 'All',
  filterTrue: 'True',
  filterFalse: 'False',
  rangeMin: 'Min',
  rangeMax: 'Max',
  selectAllRows: 'Select all rows',
  selectRow: 'Select row',
  toggleColumns: 'Toggle columns',
  exportButton: 'Export',
  exportHTML: 'Export HTML',
  density: 'Density',
  densityCompact: 'Compact',
  densityNormal: 'Normal',
  densityComfortable: 'Comfortable',
};

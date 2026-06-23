/**
 * TanStack Table-compatible facade.
 *
 * Column `header`/`cell` callbacks are written against TanStack's `table`,
 * `column` and `row` objects (`row.getValue(id)`, `row.original`,
 * `column.toggleSorting()`, `table.getIsAllPageRowsSelected()`, …). This module
 * reproduces that surface on top of KatuCharts' own engine so familiar
 * TanStack-style column definitions run unchanged.
 */

import type {
  InternalColumnDef, SortDirection, PageInfo, ProcessedRow,
  ColumnApi, RowApi, TableApi,
} from '../../types/datatable-options';

export interface TableHost {
  getInternalColumns(): InternalColumnDef[];
  getRawData(): any[];
  toggleSort(field: string, desc?: boolean): void;
  setSort(field: string, dir: SortDirection): void;
  clearColumnSort(field: string): void;
  getSortDirection(field: string): SortDirection;
  getFilterValue(field: string): any;
  setColumnFilter(field: string, value: any): void;
  isColumnVisible(field: string): boolean;
  setColumnVisible(field: string, visible: boolean): void;
  isRowSelected(index: number): boolean;
  setRowSelected(index: number, selected: boolean): void;
  isAllPageSelected(): boolean;
  isSomePageSelected(): boolean;
  toggleAllPageSelected(selected: boolean): void;
  getPageInfo(): PageInfo;
  goToPage(page: number): void;
  setPageSizeValue(size: number): void;
}

export type { ColumnApi, RowApi, TableApi };

function makeColumnApi(host: TableHost, col: InternalColumnDef): ColumnApi {
  const field = col.field;
  return {
    id: col.id ?? field,
    columnDef: col,
    getCanSort: () => col.sortable !== false,
    getCanHide: () => col.enableHiding !== false,
    getIsSorted: () => host.getSortDirection(field) ?? false,
    toggleSorting: (desc?: boolean) => host.toggleSort(field, desc),
    clearSorting: () => host.clearColumnSort(field),
    getIsVisible: () => host.isColumnVisible(field),
    toggleVisibility: (visible?: boolean) =>
      host.setColumnVisible(field, visible ?? !host.isColumnVisible(field)),
    getFilterValue: () => host.getFilterValue(field),
    setFilterValue: (value: any) => host.setColumnFilter(field, value),
  };
}

export function makeRowApi(host: TableHost, row: ProcessedRow): RowApi {
  return {
    id: String(row._originalIndex),
    index: row._originalIndex,
    original: row._data,
    getValue: (columnId: string) => row._data[columnId],
    renderValue: (columnId: string) => row._data[columnId],
    getIsSelected: () => host.isRowSelected(row._originalIndex),
    toggleSelected: (selected?: boolean) =>
      host.setRowSelected(row._originalIndex, selected ?? !host.isRowSelected(row._originalIndex)),
  };
}

export function createTableApi(host: TableHost): TableApi {
  const columnApis = () => host.getInternalColumns().map(c => makeColumnApi(host, c));
  return {
    getColumn: (id: string) => {
      const col = host.getInternalColumns().find(c => (c.id ?? c.field) === id || c.field === id);
      return col ? makeColumnApi(host, col) : undefined;
    },
    getAllColumns: columnApis,
    getAllLeafColumns: columnApis,
    getIsAllPageRowsSelected: () => host.isAllPageSelected(),
    getIsSomePageRowsSelected: () => host.isSomePageSelected(),
    toggleAllPageRowsSelected: (selected?: boolean) =>
      host.toggleAllPageSelected(selected ?? !host.isAllPageSelected()),
    getState: () => {
      const info = host.getPageInfo();
      return { pagination: { pageIndex: info.page - 1, pageSize: info.pageSize } };
    },
    nextPage: () => host.goToPage(host.getPageInfo().page + 1),
    previousPage: () => host.goToPage(host.getPageInfo().page - 1),
    setPageIndex: (index: number) => host.goToPage(index + 1),
    setPageSize: (size: number) => host.setPageSizeValue(size),
    getCanNextPage: () => host.getPageInfo().page < host.getPageInfo().totalPages,
    getCanPreviousPage: () => host.getPageInfo().page > 1,
    getPageCount: () => host.getPageInfo().totalPages,
  };
}

export { makeColumnApi };

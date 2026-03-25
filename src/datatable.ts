/**
 * KatuCharts DataTable module.
 *
 * Standalone usage:
 *   import { DataTable } from 'katucharts/datatable';
 *   const table = new DataTable('#container', { data: [...] });
 *
 * With KatuCharts:
 *   import { DataTableModule } from 'katucharts/datatable';
 *   KatuCharts.use(DataTableModule);
 *   KatuCharts.dataTable('#container', { ... });
 */

import { DataTable } from './datatable/DataTable';
import type { ModuleDefinition } from './core/Registry';
import type { DataTableOptions } from './types/datatable-options';

export const DataTableModule: ModuleDefinition = {
  name: 'datatable',
  init(katucharts: any) {
    katucharts.dataTable = (
      container: string | HTMLElement,
      options: DataTableOptions
    ) => new DataTable(container, options);

    katucharts._DataTable = DataTable;
  },
};

export { DataTable };

export type {
  DataTableOptions,
  ColumnDefinition,
  ColumnType,
  SortDirection,
  FilterType,
  SelectionMode,
  PinDirection,
  DensityMode,
  LayoutStyle,
  DataTableEventsOptions,
  PaginationOptions,
  SearchOptions,
  ToolbarOptions,
  ExportTableOptions,
  ServerSideOptions,
  VirtualScrollOptions,
  GroupingOptions,
  MasterDetailOptions,
  TreeDataOptions,
  ContextMenuOptions,
  ContextMenuItem,
  DataTableStyleOptions,
  DataTableLangOptions,
  SortingOptions,
  FilteringOptions,
  SelectionOptions,
  EditingOptions,
  HeaderGroupDefinition,
  InternalColumnDef,
  ProcessedRow,
  ProcessedResult,
  PageInfo,
  SortState,
  FormatterContext,
  CellStyleContext,
  RowStyleContext,
  CustomEditorFn,
  CustomEditorResult,
} from './types/datatable-options';

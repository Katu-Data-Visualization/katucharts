/**
 * Spanish locale pack. Partial: any key not listed here falls back to the
 * English base. Language-neutral pagination glyphs are intentionally omitted.
 */

import type { DataTableLangOptions } from '../../types/datatable-options';

export const esLocale: Partial<DataTableLangOptions> = {
  search: 'Buscar...',
  noData: 'Sin datos disponibles',
  loading: 'Cargando...',
  pageInfo: 'Mostrando {from}-{to} de {total}',
  pageSizeLabel: 'Filas por página:',
  selectAll: 'Seleccionar todo',
  columns: 'Columnas',
  exportCSV: 'Exportar CSV',
  exportJSON: 'Exportar JSON',
  copyClipboard: 'Copiar al portapapeles',
  resetFilters: 'Restablecer filtros',
  of: 'de',
  rows: 'filas',
  showing: 'Mostrando',
  filterPlaceholder: 'Filtrar…',
  filterAll: 'Todos',
  filterTrue: 'Verdadero',
  filterFalse: 'Falso',
  rangeMin: 'Mín',
  rangeMax: 'Máx',
  selectAllRows: 'Seleccionar todas las filas',
  selectRow: 'Seleccionar fila',
  toggleColumns: 'Alternar columnas',
  exportButton: 'Exportar',
  exportHTML: 'Exportar HTML',
  density: 'Densidad',
  densityCompact: 'Compacto',
  densityNormal: 'Normal',
  densityComfortable: 'Cómodo',
};

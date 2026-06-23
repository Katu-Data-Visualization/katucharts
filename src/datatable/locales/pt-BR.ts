/**
 * Brazilian Portuguese locale pack. Partial: any key not listed here falls back
 * to the English base. Language-neutral pagination glyphs are intentionally omitted.
 */

import type { DataTableLangOptions } from '../../types/datatable-options';

export const ptBRLocale: Partial<DataTableLangOptions> = {
  search: 'Pesquisar...',
  noData: 'Nenhum dado disponível',
  loading: 'Carregando...',
  pageInfo: 'Exibindo {from}-{to} de {total}',
  pageSizeLabel: 'Linhas por página:',
  selectAll: 'Selecionar tudo',
  columns: 'Colunas',
  exportCSV: 'Exportar CSV',
  exportJSON: 'Exportar JSON',
  copyClipboard: 'Copiar para a área de transferência',
  resetFilters: 'Redefinir filtros',
  of: 'de',
  rows: 'linhas',
  showing: 'Exibindo',
  filterPlaceholder: 'Filtrar…',
  filterAll: 'Todos',
  filterTrue: 'Verdadeiro',
  filterFalse: 'Falso',
  rangeMin: 'Mín',
  rangeMax: 'Máx',
  selectAllRows: 'Selecionar todas as linhas',
  selectRow: 'Selecionar linha',
  toggleColumns: 'Alternar colunas',
  exportButton: 'Exportar',
  exportHTML: 'Exportar HTML',
  density: 'Densidade',
  densityCompact: 'Compacto',
  densityNormal: 'Normal',
  densityComfortable: 'Confortável',
};

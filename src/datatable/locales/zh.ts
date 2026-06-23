/**
 * Simplified Chinese locale pack. Partial: any key not listed here falls back to
 * the English base. Language-neutral pagination glyphs are intentionally omitted.
 */

import type { DataTableLangOptions } from '../../types/datatable-options';

export const zhLocale: Partial<DataTableLangOptions> = {
  search: '搜索...',
  noData: '暂无数据',
  loading: '加载中...',
  pageInfo: '显示第 {from}-{to} 项，共 {total} 项',
  pageSizeLabel: '每页行数：',
  selectAll: '全选',
  columns: '列',
  exportCSV: '导出 CSV',
  exportJSON: '导出 JSON',
  copyClipboard: '复制到剪贴板',
  resetFilters: '重置筛选',
  of: '/',
  rows: '行',
  showing: '显示',
  filterPlaceholder: '筛选…',
  filterAll: '全部',
  filterTrue: '是',
  filterFalse: '否',
  rangeMin: '最小',
  rangeMax: '最大',
  selectAllRows: '全选所有行',
  selectRow: '选择行',
  toggleColumns: '切换列',
  exportButton: '导出',
  exportHTML: '导出 HTML',
  density: '密度',
  densityCompact: '紧凑',
  densityNormal: '正常',
  densityComfortable: '宽松',
};

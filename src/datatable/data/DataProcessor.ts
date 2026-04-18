/**
 * Data processing pipeline: search → filter → group → sort → aggregate → paginate → virtual window.
 */

import type {
  InternalColumnDef, ProcessedRow, ProcessedResult, SortDirection,
  SortState, GroupInfo, GroupingOptions, TreeDataOptions,
} from '../../types/datatable-options';

type DirtyStage = 'search' | 'filter' | 'group' | 'sort' | 'aggregate' | 'paginate' | 'window';

const STAGE_ORDER: DirtyStage[] = ['search', 'filter', 'group', 'sort', 'aggregate', 'paginate', 'window'];

export interface ProcessorState {
  search: string;
  searchColumns: string[] | undefined;
  caseSensitive: boolean;
  filters: Record<string, any>;
  sort: SortState[];
  groupBy: string[];
  groupExpanded: Map<string, boolean>;
  page: number;
  pageSize: number;
  paginationEnabled: boolean;
  scrollTop: number;
  viewportHeight: number;
  virtualEnabled: boolean;
  virtualRowHeight: number;
  virtualOverscan: number;
  treeData?: TreeDataOptions;
}

export class DataProcessor {
  private caches = new Map<DirtyStage, any>();
  private dirtyFrom: number = 0;

  invalidate(fromStage: DirtyStage): void {
    const idx = STAGE_ORDER.indexOf(fromStage);
    if (idx >= 0 && idx < this.dirtyFrom) {
      this.dirtyFrom = idx;
    } else if (idx >= 0) {
      this.dirtyFrom = Math.min(this.dirtyFrom, idx);
    }
  }

  invalidateAll(): void {
    this.dirtyFrom = 0;
    this.caches.clear();
  }

  process(
    rawData: any[],
    columns: InternalColumnDef[],
    state: ProcessorState
  ): ProcessedResult {
    let data = rawData;

    if (this.shouldRun('search')) {
      data = this.applySearch(data, columns, state);
      this.caches.set('search', data);
    } else {
      data = this.caches.get('search') ?? data;
    }

    if (this.shouldRun('filter')) {
      data = this.applyFilters(data, columns, state);
      this.caches.set('filter', data);
    } else {
      data = this.caches.get('filter') ?? data;
    }

    const totalFiltered = data.length;

    let rows: ProcessedRow[];

    if (this.shouldRun('group') || this.shouldRun('sort')) {
      if (state.treeData?.enabled) {
        rows = this.flattenTree(data, state.treeData);
      } else if (state.groupBy.length > 0) {
        rows = this.applyGrouping(data, state);
      } else {
        rows = data.map((d, i) => this.makeDataRow(d, i));
      }

      rows = this.applySorting(rows, columns, state);
      this.caches.set('sort', rows);
    } else {
      rows = this.caches.get('sort') ?? data.map((d, i) => this.makeDataRow(d, i));
    }

    const aggregates = this.computeAggregates(data, columns);

    const groups = this.extractGroups(rows);

    let pageRows: ProcessedRow[];
    let page = state.page;
    let totalPages = 1;

    if (state.paginationEnabled && !state.virtualEnabled) {
      totalPages = Math.max(1, Math.ceil(totalFiltered / state.pageSize));
      if (page > totalPages) page = totalPages;
      const start = (page - 1) * state.pageSize;
      pageRows = this.applyPagination(rows, start, state.pageSize);
    } else if (state.virtualEnabled) {
      pageRows = this.applyVirtualWindow(rows, state);
    } else {
      pageRows = rows;
    }

    this.dirtyFrom = STAGE_ORDER.length;

    return {
      rows: pageRows,
      totalFiltered,
      totalAll: rawData.length,
      aggregates,
      groups,
    };
  }

  private shouldRun(stage: DirtyStage): boolean {
    return STAGE_ORDER.indexOf(stage) >= this.dirtyFrom;
  }

  private applySearch(
    data: any[],
    columns: InternalColumnDef[],
    state: ProcessorState
  ): any[] {
    const query = state.search.trim();
    if (!query) return data;

    const searchCols = state.searchColumns
      ? columns.filter(c => state.searchColumns!.includes(c.field))
      : columns.filter(c => c._visible && c.type !== 'html');

    const normalizedQuery = state.caseSensitive ? query : query.toLowerCase();

    return data.filter(row => {
      for (const col of searchCols) {
        const val = row[col.field];
        if (val == null) continue;
        const str = state.caseSensitive ? String(val) : String(val).toLowerCase();
        if (str.includes(normalizedQuery)) return true;
      }
      return false;
    });
  }

  private applyFilters(
    data: any[],
    columns: InternalColumnDef[],
    state: ProcessorState
  ): any[] {
    const activeFilters = Object.entries(state.filters).filter(([_, v]) => v != null && v !== '');
    if (!activeFilters.length) return data;

    return data.filter(row => {
      for (const [field, filterVal] of activeFilters) {
        const col = columns.find(c => c.field === field);
        if (!col) continue;
        const val = row[field];

        if (!this.matchesFilter(val, filterVal, col)) return false;
      }
      return true;
    });
  }

  private matchesFilter(value: any, filterVal: any, col: InternalColumnDef): boolean {
    if (filterVal == null || filterVal === '') return true;

    const filterType = col.filterType ?? this.inferFilterType(col);

    switch (filterType) {
      case 'text': {
        if (value == null) return false;
        const sv = String(value).toLowerCase();
        return sv.includes(String(filterVal).toLowerCase());
      }

      case 'number': {
        const num = Number(value);
        if (isNaN(num)) return false;
        if (typeof filterVal === 'object' && filterVal !== null) {
          const { min, max } = filterVal;
          if (min != null && num < Number(min)) return false;
          if (max != null && num > Number(max)) return false;
          return true;
        }
        return num === Number(filterVal);
      }

      case 'select': {
        if (Array.isArray(filterVal)) {
          return filterVal.length === 0 || filterVal.includes(value);
        }
        return String(value) === String(filterVal);
      }

      case 'date':
      case 'daterange': {
        const d = new Date(value).getTime();
        if (isNaN(d)) return false;
        if (typeof filterVal === 'object' && filterVal !== null) {
          const { from, to } = filterVal;
          if (from && d < new Date(from).getTime()) return false;
          if (to && d > new Date(to).getTime()) return false;
          return true;
        }
        return new Date(value).toDateString() === new Date(filterVal).toDateString();
      }

      case 'numberrange': {
        const n = Number(value);
        if (isNaN(n)) return false;
        const { min, max } = filterVal;
        if (min != null && n < Number(min)) return false;
        if (max != null && n > Number(max)) return false;
        return true;
      }

      default:
        return true;
    }
  }

  private inferFilterType(col: InternalColumnDef): string {
    switch (col.type) {
      case 'number': return 'number';
      case 'date': return 'date';
      case 'boolean': return 'select';
      default: return 'text';
    }
  }

  private applySorting(
    rows: ProcessedRow[],
    columns: InternalColumnDef[],
    state: ProcessorState
  ): ProcessedRow[] {
    if (!state.sort.length) return rows;

    const dataRows = rows.filter(r => r._type === 'data');
    const nonDataRows = rows.filter(r => r._type !== 'data');

    dataRows.sort((a, b) => {
      for (const { column, direction } of state.sort) {
        if (!direction) continue;
        const col = columns.find(c => c.field === column);
        const multiplier = direction === 'asc' ? 1 : -1;
        const valA = a._data[column];
        const valB = b._data[column];

        let cmp: number;
        if (col?.comparator) {
          cmp = col.comparator(valA, valB);
        } else {
          cmp = this.defaultCompare(valA, valB, col?.type);
        }

        if (cmp !== 0) return cmp * multiplier;
      }
      return 0;
    });

    if (nonDataRows.length === 0) return dataRows;
    return this.reinterlaceGrouped(dataRows, nonDataRows, state);
  }

  private defaultCompare(a: any, b: any, type?: string): number {
    if (a == null && b == null) return 0;
    if (a == null) return -1;
    if (b == null) return 1;

    switch (type) {
      case 'number': return Number(a) - Number(b);
      case 'date': return new Date(a).getTime() - new Date(b).getTime();
      case 'boolean': return (a === b) ? 0 : a ? -1 : 1;
      default: return String(a).localeCompare(String(b));
    }
  }

  private reinterlaceGrouped(
    dataRows: ProcessedRow[],
    groupRows: ProcessedRow[],
    _state: ProcessorState
  ): ProcessedRow[] {
    if (groupRows.length === 0) return dataRows;

    const result: ProcessedRow[] = [];
    const groupMap = new Map<string, ProcessedRow>();

    for (const gr of groupRows) {
      if (gr._type === 'group-header') {
        const key = `${gr._groupColumn}:${gr._groupValue}`;
        groupMap.set(key, gr);
      }
    }

    let currentGroup: string | null = null;
    for (const dr of dataRows) {
      for (const [key, gr] of groupMap) {
        const [col] = key.split(':');
        const val = dr._data[col];
        const newKey = `${col}:${val}`;
        if (newKey !== currentGroup && groupMap.has(newKey)) {
          result.push(groupMap.get(newKey)!);
          currentGroup = newKey;
        }
      }
      result.push(dr);
    }

    return result;
  }

  private applyGrouping(data: any[], state: ProcessorState): ProcessedRow[] {
    const groupCol = state.groupBy[0];
    if (!groupCol) return data.map((d, i) => this.makeDataRow(d, i));

    const groups = new Map<any, any[]>();
    for (const row of data) {
      const val = row[groupCol];
      if (!groups.has(val)) groups.set(val, []);
      groups.get(val)!.push(row);
    }

    const rows: ProcessedRow[] = [];
    let idx = 0;

    for (const [value, groupData] of groups) {
      const key = `${groupCol}:${value}`;
      const expanded = state.groupExpanded.has(key)
        ? state.groupExpanded.get(key)!
        : true;

      rows.push({
        _type: 'group-header',
        _index: idx++,
        _originalIndex: -1,
        _data: {},
        _depth: 0,
        _groupValue: value,
        _groupColumn: groupCol,
        _groupCount: groupData.length,
        _expanded: expanded,
        _visible: true,
      });

      if (expanded) {
        for (const row of groupData) {
          rows.push(this.makeDataRow(row, idx++));
        }
      }
    }

    return rows;
  }

  private flattenTree(data: any[], treeOpts: TreeDataOptions): ProcessedRow[] {
    const childrenField = treeOpts.childrenField ?? 'children';
    const rows: ProcessedRow[] = [];
    let idx = 0;

    const flatten = (items: any[], depth: number, parentKey: string) => {
      for (const item of items) {
        const children = item[childrenField];
        const hasChildren = Array.isArray(children) && children.length > 0;
        const expanded = treeOpts.expandAll !== false;

        const row: ProcessedRow = {
          _type: 'data',
          _index: idx++,
          _originalIndex: idx - 1,
          _data: item,
          _depth: depth,
          _expanded: hasChildren ? expanded : undefined,
          _visible: true,
          _parentKey: parentKey,
        };
        rows.push(row);

        if (hasChildren && expanded) {
          flatten(children, depth + 1, `${parentKey}:${idx - 1}`);
        }
      }
    };

    flatten(data, 0, '');
    return rows;
  }

  private applyPagination(rows: ProcessedRow[], start: number, pageSize: number): ProcessedRow[] {
    return rows.slice(start, start + pageSize);
  }

  private applyVirtualWindow(rows: ProcessedRow[], state: ProcessorState): ProcessedRow[] {
    const { scrollTop, viewportHeight, virtualRowHeight, virtualOverscan } = state;
    const startIdx = Math.max(0, Math.floor(scrollTop / virtualRowHeight) - virtualOverscan);
    const visibleCount = Math.ceil(viewportHeight / virtualRowHeight) + virtualOverscan * 2;
    return rows.slice(startIdx, startIdx + visibleCount);
  }

  private computeAggregates(
    data: any[],
    columns: InternalColumnDef[]
  ): Record<string, Record<string, any>> {
    const result: Record<string, Record<string, any>> = {};

    for (const col of columns) {
      if (!col.aggregate) continue;

      const values = data.map(row => row[col.field]).filter(v => v != null);
      const numValues = values.map(Number).filter(n => !isNaN(n));

      let aggResult: any;

      if (typeof col.aggregate === 'function') {
        aggResult = col.aggregate(values);
      } else {
        switch (col.aggregate) {
          case 'sum':
            aggResult = numValues.reduce((s, n) => s + n, 0);
            break;
          case 'avg':
            aggResult = numValues.length ? numValues.reduce((s, n) => s + n, 0) / numValues.length : 0;
            break;
          case 'count':
            aggResult = values.length;
            break;
          case 'min':
            aggResult = numValues.length ? Math.min(...numValues) : null;
            break;
          case 'max':
            aggResult = numValues.length ? Math.max(...numValues) : null;
            break;
        }
      }

      result[col.field] = { value: aggResult, type: col.aggregate };
    }

    return result;
  }

  private extractGroups(rows: ProcessedRow[]): GroupInfo[] {
    const groups: GroupInfo[] = [];
    for (const row of rows) {
      if (row._type === 'group-header') {
        groups.push({
          column: row._groupColumn!,
          value: row._groupValue,
          count: row._groupCount!,
          expanded: row._expanded!,
          rows: [],
          aggregates: {},
        });
      }
    }
    return groups;
  }

  private makeDataRow(data: any, index: number): ProcessedRow {
    return {
      _type: 'data',
      _index: index,
      _originalIndex: index,
      _data: data,
      _depth: 0,
      _visible: true,
    };
  }
}

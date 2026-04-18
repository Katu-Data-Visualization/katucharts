/**
 * Column type detection, normalization, and processing.
 */

import type {
  ColumnDefinition, ColumnType, FilterType, InternalColumnDef, AlignType,
} from '../../types/datatable-options';

export function detectColumnType(values: any[]): ColumnType {
  let numbers = 0;
  let booleans = 0;
  let dates = 0;
  let checked = 0;

  for (const v of values) {
    if (v == null || v === '') continue;
    checked++;
    if (typeof v === 'boolean') { booleans++; continue; }
    if (typeof v === 'number' || (typeof v === 'string' && !isNaN(Number(v)) && v.trim() !== '')) {
      numbers++;
      continue;
    }
    if (v instanceof Date) { dates++; continue; }
    if (typeof v === 'string') {
      const d = Date.parse(v);
      if (!isNaN(d) && v.length >= 8 && /\d/.test(v) && /[-/T]/.test(v)) {
        dates++;
        continue;
      }
    }
  }

  if (checked === 0) return 'string';
  const ratio = 0.7;
  if (booleans / checked >= ratio) return 'boolean';
  if (dates / checked >= ratio) return 'date';
  if (numbers / checked >= ratio) return 'number';
  return 'string';
}

export function inferColumnsFromData(data: any[]): ColumnDefinition[] {
  if (!data.length) return [];

  const firstRow = data[0];
  if (Array.isArray(firstRow)) {
    return firstRow.map((_: any, i: number) => ({
      field: String(i),
      title: `Column ${i + 1}`,
    }));
  }

  const fields = Object.keys(firstRow);
  const sampleSize = Math.min(data.length, 100);
  const sample = data.slice(0, sampleSize);

  const columns: ColumnDefinition[] = [];

  for (const field of fields) {
    const firstVal = firstRow[field];

    // Skip nested objects/arrays — they don't display well in flat tables
    if (firstVal !== null && typeof firstVal === 'object' && !Array.isArray(firstVal) && !(firstVal instanceof Date)) {
      continue;
    }

    const values = sample.map(row => row[field]);
    const type = detectColumnType(values);
    columns.push({
      field,
      title: formatFieldAsTitle(field),
      type,
    });
  }

  return columns;
}

function formatFieldAsTitle(field: string): string {
  return field
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

export function defaultAlignForType(type?: ColumnType): AlignType {
  switch (type) {
    case 'number': return 'right';
    case 'boolean': return 'center';
    default: return 'left';
  }
}

export function defaultFilterTypeForColumn(col: ColumnDefinition): FilterType {
  if (col.filterType) return col.filterType;
  switch (col.type) {
    case 'number': return 'number';
    case 'date': return 'date';
    case 'boolean': return 'select';
    default: return 'text';
  }
}

export function normalizeColumns(
  columns: ColumnDefinition[],
  containerWidth: number
): InternalColumnDef[] {
  const total = columns.length;
  const defaultWidth = containerWidth > 0 ? Math.max(80, Math.floor(containerWidth / Math.max(total, 1))) : 150;

  return columns.map((col, index) => {
    const type = col.type ?? 'string';
    const computedWidth = resolveWidth(col.width, defaultWidth, containerWidth);

    return {
      ...col,
      type,
      align: col.align ?? defaultAlignForType(type),
      visible: col.visible !== false,
      sortable: col.sortable !== false,
      filterable: col.filterable !== false,
      resizable: col.resizable !== false,
      reorderable: col.reorderable !== false,
      pinned: col.pinned ?? null,
      _index: index,
      _computedWidth: computedWidth,
      _visible: col.visible !== false,
      _sortDirection: null,
      _sortPriority: -1,
      _filterValue: null,
      _pinnedOffset: 0,
    };
  });
}

function resolveWidth(width: number | string | undefined, defaultWidth: number, containerWidth: number): number {
  if (width === undefined) return defaultWidth;
  if (typeof width === 'number') return width;
  if (width.endsWith('%')) {
    const pct = parseFloat(width) / 100;
    return Math.floor(containerWidth * pct);
  }
  if (width.endsWith('px')) return parseFloat(width);
  return defaultWidth;
}

export function getVisibleColumns(columns: InternalColumnDef[]): InternalColumnDef[] {
  return columns.filter(c => c._visible);
}

export function computePinnedOffsets(columns: InternalColumnDef[]): void {
  const visible = getVisibleColumns(columns);

  let leftOffset = 0;
  for (const col of visible) {
    if (col.pinned === 'left') {
      col._pinnedOffset = leftOffset;
      leftOffset += col._computedWidth;
    }
  }

  let rightOffset = 0;
  for (let i = visible.length - 1; i >= 0; i--) {
    const col = visible[i];
    if (col.pinned === 'right') {
      col._pinnedOffset = rightOffset;
      rightOffset += col._computedWidth;
    }
  }
}

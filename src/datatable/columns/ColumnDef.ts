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

    /**
     * Skip nested objects/arrays — they don't display well in flat tables.
     */
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

/**
 * Resolve a column's value for a row, honouring an `accessorFn` (TanStack) when
 * present and otherwise reading the flat `field`/`accessorKey`.
 */
export function resolveCellValue(row: any, col: ColumnDefinition): any {
  if (col.accessorFn) return col.accessorFn(row);
  return row?.[col.field];
}

/** Per-type sizing: a floor, a sensible default, and a cap so columns size to
 *  their content instead of being stretched to fill the container. */
const TYPE_WIDTH: Record<string, { min: number; ideal: number; cap: number }> = {
  number:  { min: 80,  ideal: 100, cap: 170 },
  boolean: { min: 64,  ideal: 84,  cap: 120 },
  date:    { min: 100, ideal: 128, cap: 190 },
  string:  { min: 96,  ideal: 140, cap: 320 },
  html:    { min: 96,  ideal: 160, cap: 360 },
};

const CHAR_W = 7.4;
const CELL_PAD = 34;

/** Estimate a column's content width from its header and a sample of values. */
function estimateColumnWidth(col: ColumnDefinition, type: string, sample: any[]): number {
  const rule = TYPE_WIDTH[type] ?? TYPE_WIDTH.string;
  const sortRoom = col.sortable === false ? 0 : 18;
  let maxLen = String(col.title ?? col.field ?? '').length;

  const rows = sample.length > 30 ? sample.slice(0, 30) : sample;
  for (const row of rows) {
    const v = resolveCellValue(row, col);
    if (v == null) continue;
    const len = String(v).length;
    if (len > maxLen) maxLen = len;
  }

  let w = Math.round(maxLen * CHAR_W + CELL_PAD + sortRoom);
  /**
   * Custom cell/formatter output (e.g. currency) is usually wider than the raw value,
   * so don't let such columns fall below the type's sensible default.
   */
  if (col.cell || col.formatter || type === 'number' || type === 'boolean') {
    w = Math.max(w, rule.ideal);
  }
  return Math.min(rule.cap, Math.max(rule.min, w));
}

export function normalizeColumns(
  columns: ColumnDefinition[],
  containerWidth: number,
  sample: any[] = [],
  reservedWidth = 0
): InternalColumnDef[] {
  const normalized = columns.map((col, index) => {
    /**
     * Map TanStack column aliases (accessorKey, header) to internal canonical fields.
     */
    const field = col.field ?? col.accessorKey ?? col.id ?? String(index);
    const id = col.id ?? col.accessorKey ?? col.field ?? String(index);
    const title = col.title ?? (typeof col.header === 'string' ? col.header : undefined)
      ?? formatFieldAsTitle(field);

    const type = col.type ?? 'string';
    const width = col.width ?? (col.size != null ? col.size : undefined);
    const minWidth = col.minWidth ?? col.minSize;
    const maxWidth = col.maxWidth ?? col.maxSize;
    const explicit = width !== undefined;
    const computedWidth = explicit
      ? resolveWidth(width, TYPE_WIDTH[type]?.ideal ?? 140, containerWidth)
      : Math.min(maxWidth ?? Infinity, Math.max(minWidth ?? 0, estimateColumnWidth(col, type, sample)));

    const sortable = col.sortable ?? col.enableSorting ?? true;
    const filterable = col.filterable ?? col.enableColumnFilter ?? true;
    const enableHiding = col.enableHiding ?? true;

    return {
      ...col,
      field,
      id,
      title,
      type,
      width,
      minWidth,
      maxWidth,
      align: col.align ?? defaultAlignForType(type),
      visible: col.visible !== false,
      sortable: sortable !== false,
      filterable: filterable !== false,
      enableHiding,
      resizable: col.resizable !== false,
      reorderable: col.reorderable !== false,
      pinned: col.pinned ?? null,
      _index: index,
      _computedWidth: computedWidth,
      _explicitWidth: explicit,
      _visible: col.visible !== false,
      _sortDirection: null,
      _sortPriority: -1,
      _filterValue: null,
      _pinnedOffset: 0,
    };
  });

  distributeWidth(normalized, containerWidth, reservedWidth);
  return normalized;
}

/**
 * When the columns are narrower than the available width, hand the leftover
 * space to the flexible text columns so the table fills its container without
 * stretching number/date/boolean columns (which keeps them tight rather than
 * leaving big gaps).
 */
function distributeWidth(
  cols: InternalColumnDef[],
  containerWidth: number,
  reservedWidth: number
): void {
  const visible = cols.filter(c => c._visible);
  if (!visible.length || containerWidth <= 0) return;

  const available = containerWidth - reservedWidth - 2;
  const total = visible.reduce((s, c) => s + c._computedWidth, 0);
  let slack = available - total;
  if (slack <= 0) return;

  /**
   * Flexible columns are left-aligned text columns; numeric/right-aligned columns
   * stay at their content width so they don't gain big empty gaps.
   */
  const flex = visible.filter(c =>
    !c._explicitWidth && (c.type === 'string' || c.type === 'html') && c.align !== 'right');
  let targets = flex.length ? flex : visible.filter(c => !c._explicitWidth);
  if (!targets.length) return;

  /**
   * Each flexible column may grow by at most ~its content width again, so a short
   * column never balloons; any leftover is left as harmless trailing space rather
   * than stretched into one giant column.
   */
  const room = new Map(targets.map(c => [c, Math.max(160, c._computedWidth)]));

  while (slack > 1 && targets.length) {
    const weight = targets.reduce((s, c) => s + (room.get(c) || 0), 0);
    if (weight <= 0) break;
    let used = 0;
    const next: InternalColumnDef[] = [];
    targets.forEach(c => {
      const want = Math.round(slack * ((room.get(c) || 0) / weight));
      const give = Math.min(want, room.get(c) || 0);
      c._computedWidth += give;
      room.set(c, (room.get(c) || 0) - give);
      used += give;
      if ((room.get(c) || 0) > 0) next.push(c);
    });
    if (used <= 0) break;
    slack -= used;
    targets = next;
  }
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

/**
 * Cell value formatting and rendering.
 */

import type {
  InternalColumnDef, FormatterContext, CellStyleContext,
  CSSObject, ProcessedRow, CellContext,
} from '../../types/datatable-options';
import type { TableTheme } from '../themes/TableTheme';
import type { TableApi } from '../api/TableApi';
import { makeRowApi } from '../api/TableApi';
import type { TableHost } from '../api/TableApi';
import { resolveCellValue } from '../columns/ColumnDef';

export class CellRenderer {
  private theme: TableTheme;
  private formatters: Record<string, (value: any) => string>;
  private api: TableApi | null = null;
  private host: TableHost | null = null;

  constructor(theme: TableTheme, formatters?: Record<string, (value: any) => string>) {
    this.theme = theme;
    this.formatters = formatters ?? {};
  }

  setApi(api: TableApi | null, host: TableHost | null): void {
    this.api = api;
    this.host = host;
  }

  createCell(
    tr: HTMLTableRowElement,
    value: any,
    row: ProcessedRow,
    col: InternalColumnDef,
    rowIndex: number
  ): HTMLTableCellElement {
    const td = document.createElement('td');
    td.className = 'katucharts-dt-td';
    if (col.align) td.setAttribute('data-align', col.align);

    if (col._computedWidth) td.style.width = `${col._computedWidth}px`;

    if (col.pinned) {
      td.classList.add('is-pinned');
      if (col.pinned === 'left') td.style.left = `${col._pinnedOffset}px`;
      else td.style.right = `${col._pinnedOffset}px`;
    }

    const userCellStyle = this.theme.userCellStyle;
    if (userCellStyle) Object.assign(td.style, userCellStyle);
    if (col.cellStyle) {
      const custom = typeof col.cellStyle === 'function'
        ? col.cellStyle.call({ value, row: row._data, column: col, rowIndex } as CellStyleContext)
        : (col.cellStyle as CSSObject);
      Object.assign(td.style, custom);
    }

    const className = this.computeClass(value, row._data, col);
    if (className) td.className += ` ${className}`;
    const tooltip = this.computeTooltip(value, row._data, col);
    if (tooltip) td.title = tooltip;

    /**
     * A `cell` callback wins and may return markup or a DOM node.
     */
    if (col.cell && this.api) {
      const ctx: CellContext = {
        row: makeRowApi(this.host!, row),
        column: this.api.getColumn(col.id ?? col.field)!,
        table: this.api,
        getValue: () => value,
        renderValue: () => value,
      };
      const out = col.cell(ctx);
      if (out instanceof Node) td.appendChild(out);
      else td.innerHTML = String(out ?? '');
      tr.appendChild(td);
      return td;
    }

    const content = this.formatValue(value, row._data, col, rowIndex);
    if (col.type === 'html') td.innerHTML = content;
    else td.textContent = content;

    tr.appendChild(td);
    return td;
  }

  private formatValue(
    value: any,
    rowData: any,
    col: InternalColumnDef,
    rowIndex: number
  ): string {
    if (value == null) return '';

    if (col.formatter) {
      const ctx: FormatterContext = { value, row: rowData, column: col, rowIndex };
      return col.formatter.call(ctx);
    }

    if (col.type && this.formatters[col.type]) {
      return this.formatters[col.type](value);
    }

    switch (col.type) {
      case 'number':
        return this.defaultNumberFormat(value);
      case 'date':
        return this.defaultDateFormat(value);
      case 'boolean':
        return this.defaultBooleanFormat(value);
      default:
        if (typeof value === 'object' && value !== null) {
          if (Array.isArray(value)) return `[${value.length} items]`;
          return JSON.stringify(value);
        }
        return String(value);
    }
  }

  private defaultNumberFormat(value: any): string {
    const num = Number(value);
    if (isNaN(num)) return String(value);
    if (Number.isInteger(num)) return num.toLocaleString();
    return num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  private defaultDateFormat(value: any): string {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString();
  }

  private defaultBooleanFormat(value: any): string {
    if (this.formatters.boolean) return this.formatters.boolean(value);
    return value ? '✔' : '✘';
  }

  private computeClass(value: any, rowData: any, col: InternalColumnDef): string {
    if (!col.cellClass) return '';
    if (typeof col.cellClass === 'function') {
      return col.cellClass.call({ value, row: rowData });
    }
    return col.cellClass;
  }

  private computeTooltip(value: any, rowData: any, col: InternalColumnDef): string {
    if (!col.cellTooltip) return '';
    if (col.cellTooltip === true) return value != null ? String(value) : '';
    if (typeof col.cellTooltip === 'function') {
      return col.cellTooltip.call({ value, row: rowData });
    }
    return '';
  }

  updateFormatters(formatters: Record<string, (value: any) => string>): void {
    this.formatters = formatters;
  }

  resolveValue(row: any, col: InternalColumnDef): any {
    return resolveCellValue(row, col);
  }
}

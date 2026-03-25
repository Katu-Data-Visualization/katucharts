/**
 * Cell value formatting and rendering.
 */

import type {
  InternalColumnDef, FormatterContext, CellStyleContext,
  CSSObject, ProcessedRow,
} from '../../types/datatable-options';
import type { TableTheme } from '../themes/TableTheme';

export interface CellRenderResult {
  content: string;
  isHtml: boolean;
  style: CSSObject;
  className: string;
  tooltip: string;
}

export class CellRenderer {
  private theme: TableTheme;
  private formatters: Record<string, (value: any) => string>;

  constructor(theme: TableTheme, formatters?: Record<string, (value: any) => string>) {
    this.theme = theme;
    this.formatters = formatters ?? {};
  }

  render(
    value: any,
    row: ProcessedRow,
    col: InternalColumnDef,
    rowIndex: number
  ): CellRenderResult {
    const content = this.formatValue(value, row._data, col, rowIndex);
    const isHtml = col.type === 'html';
    const style = this.computeStyle(value, row._data, col, rowIndex);
    const className = this.computeClass(value, row._data, col);
    const tooltip = this.computeTooltip(value, row._data, col);

    return { content, isHtml, style, className, tooltip };
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
    return value ? '\u2714' : '\u2718';
  }

  private computeStyle(
    value: any,
    rowData: any,
    col: InternalColumnDef,
    rowIndex: number
  ): CSSObject {
    const baseStyle = this.theme.cellStyles(col);

    if (col.cellStyle) {
      if (typeof col.cellStyle === 'function') {
        const ctx: CellStyleContext = { value, row: rowData, column: col, rowIndex };
        const custom = col.cellStyle.call(ctx);
        return { ...baseStyle, ...custom };
      }
      return { ...baseStyle, ...(col.cellStyle as CSSObject) };
    }

    return baseStyle;
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

  createCell(
    tr: HTMLTableRowElement,
    value: any,
    row: ProcessedRow,
    col: InternalColumnDef,
    rowIndex: number
  ): HTMLTableCellElement {
    const td = document.createElement('td');
    const result = this.render(value, row, col, rowIndex);

    Object.assign(td.style, result.style);

    if (col._computedWidth) {
      td.style.width = `${col._computedWidth}px`;
    }

    if (col.pinned) {
      td.style.position = 'sticky';
      td.style.zIndex = '1';
      td.style.backgroundColor = td.style.backgroundColor || '#fff';
      if (col.pinned === 'left') {
        td.style.left = `${col._pinnedOffset}px`;
      } else {
        td.style.right = `${col._pinnedOffset}px`;
      }
    }

    if (result.className) td.className = result.className;
    if (result.tooltip) td.title = result.tooltip;

    if (result.isHtml) {
      td.innerHTML = result.content;
    } else {
      td.textContent = result.content;
    }

    tr.appendChild(td);
    return td;
  }

  updateFormatters(formatters: Record<string, (value: any) => string>): void {
    this.formatters = formatters;
  }
}

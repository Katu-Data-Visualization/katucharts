/**
 * Table data export to CSV, JSON, clipboard, and HTML.
 */

import type { ExportTableOptions, InternalColumnDef } from '../../types/datatable-options';

export class TableExport {
  static exportCSV(
    data: any[],
    columns: InternalColumnDef[],
    options?: ExportTableOptions['csv'],
    filename?: string
  ): void {
    const csv = TableExport.toCSV(data, columns, options);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    TableExport.downloadBlob(blob, (filename ?? 'export') + '.csv');
  }

  static exportJSON(
    data: any[],
    columns: InternalColumnDef[],
    options?: ExportTableOptions['json'],
    filename?: string
  ): void {
    const json = TableExport.toJSON(data, columns, options);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    TableExport.downloadBlob(blob, (filename ?? 'export') + '.json');
  }

  static copyToClipboard(data: any[], columns: InternalColumnDef[]): void {
    const csv = TableExport.toCSV(data, columns, { delimiter: '\t' });
    if (navigator.clipboard) {
      navigator.clipboard.writeText(csv).catch(() => {
        TableExport.fallbackCopy(csv);
      });
    } else {
      TableExport.fallbackCopy(csv);
    }
  }

  static exportHTML(data: any[], columns: InternalColumnDef[], filename?: string): void {
    const html = TableExport.toHTML(data, columns);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
    TableExport.downloadBlob(blob, (filename ?? 'export') + '.html');
  }

  static toCSV(
    data: any[],
    columns: InternalColumnDef[],
    options?: ExportTableOptions['csv']
  ): string {
    const delimiter = options?.delimiter ?? ',';
    const lineDelimiter = options?.lineDelimiter ?? '\n';
    const includeHeaders = options?.includeHeaders !== false;
    const visibleCols = columns.filter(c => c._visible);

    const lines: string[] = [];

    if (includeHeaders) {
      lines.push(visibleCols.map(c => TableExport.escapeCSV(c.title ?? c.field, delimiter)).join(delimiter));
    }

    for (const row of data) {
      const values = visibleCols.map(col => {
        const val = row[col.field];
        return TableExport.escapeCSV(val != null ? String(val) : '', delimiter);
      });
      lines.push(values.join(delimiter));
    }

    return lines.join(lineDelimiter);
  }

  static toJSON(
    data: any[],
    columns: InternalColumnDef[],
    options?: ExportTableOptions['json']
  ): string {
    const indent = options?.indent ?? 2;
    const visibleCols = columns.filter(c => c._visible);

    const rows = data.map(row => {
      const obj: Record<string, any> = {};
      for (const col of visibleCols) {
        obj[col.field] = row[col.field];
      }
      return obj;
    });

    return JSON.stringify(rows, null, indent);
  }

  static toHTML(data: any[], columns: InternalColumnDef[]): string {
    const visibleCols = columns.filter(c => c._visible);
    const lines: string[] = [
      '<!DOCTYPE html><html><head><meta charset="utf-8">',
      '<style>table{border-collapse:collapse;width:100%;font-family:sans-serif;font-size:13px}',
      'th,td{border:1px solid #ddd;padding:6px 10px;text-align:left}',
      'th{background:#f5f5f5;font-weight:600}tr:nth-child(even){background:#fafafa}</style>',
      '</head><body><table>',
      '<thead><tr>',
    ];

    for (const col of visibleCols) {
      lines.push(`<th>${TableExport.escapeHTML(col.title ?? col.field)}</th>`);
    }
    lines.push('</tr></thead><tbody>');

    for (const row of data) {
      lines.push('<tr>');
      for (const col of visibleCols) {
        const val = row[col.field];
        lines.push(`<td>${TableExport.escapeHTML(val != null ? String(val) : '')}</td>`);
      }
      lines.push('</tr>');
    }

    lines.push('</tbody></table></body></html>');
    return lines.join('');
  }

  private static escapeCSV(value: string, delimiter: string): string {
    if (value.includes(delimiter) || value.includes('"') || value.includes('\n') || value.includes('\r')) {
      return '"' + value.replace(/"/g, '""') + '"';
    }
    return value;
  }

  private static escapeHTML(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private static downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  private static fallbackCopy(text: string): void {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}

/**
 * Data loading and normalization from various sources.
 */

import type { DataTableOptions, ServerSideRequestParams, SortDirection } from '../../types/datatable-options';

export interface DataSourceResult {
  data: any[];
  total: number;
}

export class DataSource {
  private rawData: any[] = [];
  private options: DataTableOptions;

  constructor(options: DataTableOptions) {
    this.options = options;
  }

  loadSync(): DataSourceResult {
    if (this.options.chart) {
      this.rawData = this.extractChartData(this.options.chart);
    } else if (Array.isArray(this.options.data)) {
      this.rawData = this.normalizeData(this.options.data);
    }
    return { data: this.rawData, total: this.rawData.length };
  }

  async load(): Promise<DataSourceResult> {
    if (this.options.serverSide?.enabled && this.options.serverSide.url) {
      return this.loadServerSide({
        page: 1,
        pageSize: this.options.pagination?.pageSize ?? 25,
        sort: [],
        filters: {},
        search: '',
      });
    }
    return this.loadSync();
  }

  async loadServerSide(params: ServerSideRequestParams): Promise<DataSourceResult> {
    const ss = this.options.serverSide!;
    const url = ss.url!;
    const method = ss.method ?? 'GET';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(ss.headers ?? {}),
    };

    const mappedParams = ss.requestMapper ? ss.requestMapper(params) : params;

    let response: Response;
    if (method === 'GET') {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(mappedParams as Record<string, any>)) {
        qs.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
      }
      response = await fetch(`${url}?${qs.toString()}`, { method, headers });
    } else {
      response = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(mappedParams),
      });
    }

    if (!response.ok) {
      throw new Error(`DataTable: server request failed with status ${response.status}`);
    }

    const json = await response.json();
    if (ss.responseMapper) {
      return ss.responseMapper(json);
    }
    return {
      data: json.data ?? json,
      total: json.total ?? json.length ?? 0,
    };
  }

  setData(data: any[]): DataSourceResult {
    this.rawData = this.normalizeData(data);
    return { data: this.rawData, total: this.rawData.length };
  }

  getData(): any[] {
    return this.rawData;
  }

  addRow(row: any, index?: number): void {
    const normalized = this.normalizeRow(row);
    if (index !== undefined && index >= 0 && index <= this.rawData.length) {
      this.rawData.splice(index, 0, normalized);
    } else {
      this.rawData.push(normalized);
    }
  }

  removeRow(index: number): any | undefined {
    if (index >= 0 && index < this.rawData.length) {
      return this.rawData.splice(index, 1)[0];
    }
    return undefined;
  }

  updateRow(index: number, data: Partial<any>): void {
    if (index >= 0 && index < this.rawData.length) {
      Object.assign(this.rawData[index], data);
    }
  }

  updateCell(rowIndex: number, field: string, value: any): void {
    if (rowIndex >= 0 && rowIndex < this.rawData.length) {
      this.rawData[rowIndex][field] = value;
    }
  }

  private normalizeData(data: any[]): any[] {
    if (!data.length) return [];
    if (Array.isArray(data[0])) {
      return data.map((row, i) => {
        const obj: Record<string, any> = {};
        (row as any[]).forEach((val, j) => {
          obj[String(j)] = val;
        });
        return obj;
      });
    }
    return data.map(row => ({ ...row }));
  }

  private normalizeRow(row: any): any {
    if (Array.isArray(row)) {
      const obj: Record<string, any> = {};
      row.forEach((val, j) => {
        obj[String(j)] = val;
      });
      return obj;
    }
    return { ...row };
  }

  private extractChartData(chart: any): any[] {
    try {
      if (typeof chart.getDataRows === 'function') {
        const rows = chart.getDataRows();
        if (rows.length < 2) return [];
        const headers = rows[0];
        return rows.slice(1).map((row: any[]) => {
          const obj: Record<string, any> = {};
          headers.forEach((h: string, i: number) => {
            obj[h] = row[i];
          });
          return obj;
        });
      }

      if (chart.series) {
        const series = typeof chart.series === 'function' ? chart.series() : chart.series;
        const rows: any[] = [];
        for (const s of series) {
          const data = s.data ?? s.options?.data ?? [];
          const name = s.name ?? s.options?.name ?? 'Series';
          for (const point of data) {
            if (typeof point === 'object' && point !== null) {
              rows.push({ series: name, ...point });
            } else {
              rows.push({ series: name, value: point });
            }
          }
        }
        return rows;
      }
    } catch {
      // fallback
    }
    return [];
  }

  updateOptions(options: DataTableOptions): void {
    this.options = options;
  }
}

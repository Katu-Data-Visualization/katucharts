/**
 * Export engine: SVG, PNG, JPEG, PDF, CSV, and print support.
 */

import { LicenseManager } from '../license/LicenseManager';
import { escapeHtml, escapeCsvCell } from '../utils/format';

export class ExportModule {
  private static readonly INLINE_PROPS = [
    'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap',
    'stroke-linejoin', 'stroke-opacity', 'fill-opacity', 'opacity',
    'font-family', 'font-size', 'font-weight', 'font-style',
    'text-anchor', 'dominant-baseline', 'text-decoration',
    'visibility', 'display',
  ];

  /**
   * Clone the SVG node, inline computed styles on every element, strip the
   * export button group, and return a self-contained SVG string.
   */
  static inlineStyles(svgNode: SVGSVGElement): string {
    const clone = svgNode.cloneNode(true) as SVGSVGElement;

    /**
     * Inline computed styles while the clone still mirrors the original 1:1.
     * Matching is by index, so any add/remove must happen afterwards.
     */
    const elements = clone.querySelectorAll('*');
    const originals = svgNode.querySelectorAll('*');

    for (let i = 0; i < elements.length && i < originals.length; i++) {
      const el = elements[i] as SVGElement;
      const orig = originals[i] as SVGElement;

      try {
        const computed = window.getComputedStyle(orig);
        for (const prop of ExportModule.INLINE_PROPS) {
          const val = computed.getPropertyValue(prop);
          if (val && val !== '' && val !== 'none' && val !== 'normal' && val !== '0') {
            el.style.setProperty(prop, val);
          }
        }
      } catch {
        /* skip elements that can't be styled */
      }
    }

    const exportBtn = clone.querySelector('.katucharts-export-button-group');
    if (exportBtn) exportBtn.remove();

    /**
     * Always stamp a render-safe "Powered by" watermark on unlicensed exports, for every chart type
     * and every format. The chart's own credits node may be absent, themed with fonts/colors that
     * don't rasterize, or positioned off the exported canvas — so drop it and append a fresh one
     * with explicit, web-safe styling that survives SVG→PNG/JPEG/PDF.
     */
    if (!LicenseManager.isLicensed()) {
      ExportModule.stampWatermark(clone);
    }

    const serializer = new XMLSerializer();
    return serializer.serializeToString(clone);
  }

  /** Append a guaranteed, render-safe attribution watermark to an export clone. */
  private static stampWatermark(clone: SVGSVGElement): void {
    clone.querySelectorAll('.katucharts-credits, .katucharts-export-watermark')
      .forEach((el) => el.remove());

    const viewBox = (clone.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
    const width = parseFloat(clone.getAttribute('width') || '') || viewBox[2] || 600;
    const height = parseFloat(clone.getAttribute('height') || '') || viewBox[3] || 400;

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('class', 'katucharts-export-watermark');
    text.setAttribute('x', String(width - 8));
    text.setAttribute('y', String(height - 8));
    text.setAttribute('text-anchor', 'end');
    text.setAttribute('font-family', 'Arial, Helvetica, sans-serif');
    text.setAttribute('font-size', '11px');
    text.setAttribute('font-weight', 'normal');
    /**
     * Set fill via attribute and inline style so neither the rasterizer nor a stylesheet can drop it;
     * mid-grey reads on both light and dark exports.
     */
    text.setAttribute('fill', '#8a8a8a');
    text.style.setProperty('fill', '#8a8a8a');
    text.textContent = 'Powered by: KatuCharts';
    clone.appendChild(text);
  }

  /**
   * Shared helper: render an SVG string to a canvas at a given scale with
   * an optional background colour fill.
   */
  static svgToCanvas(svgString: string, scale: number, bgColor?: string): Promise<HTMLCanvasElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas context unavailable')); return; }

        ctx.scale(scale, scale);

        if (bgColor) {
          ctx.fillStyle = bgColor;
          ctx.fillRect(0, 0, img.width, img.height);
        }

        ctx.drawImage(img, 0, 0);
        resolve(canvas);
      };

      img.onerror = () => reject(new Error('Failed to load SVG into image'));
      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgString)));
    });
  }

  static exportSVG(svgString: string, filename: string = 'chart'): void {
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    ExportModule.downloadBlob(blob, `${filename}.svg`);
  }

  static async exportPNG(svgString: string, filename: string = 'chart', scale: number = 2): Promise<void> {
    const canvas = await ExportModule.svgToCanvas(svgString, scale);

    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob) {
          ExportModule.downloadBlob(blob, `${filename}.png`);
          resolve();
        } else {
          reject(new Error('Failed to generate PNG'));
        }
      }, 'image/png');
    });
  }

  static async exportJPEG(svgString: string, filename: string = 'chart', scale: number = 2, quality: number = 0.95): Promise<void> {
    const canvas = await ExportModule.svgToCanvas(svgString, scale, '#ffffff');

    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob) {
          ExportModule.downloadBlob(blob, `${filename}.jpeg`);
          resolve();
        } else {
          reject(new Error('Failed to generate JPEG'));
        }
      }, 'image/jpeg', quality);
    });
  }

  private static readonly JSPDF_CDN_URL = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js';
  private static jsPDFLoader: Promise<any> | null = null;

  /**
   * Resolve the `jsPDF` constructor across every runtime the library ships to.
   * Tries, in order: a `jspdf` global already on the page (UMD consumers who
   * loaded it themselves), the bundler-resolved module (consumers who ran
   * `npm install jspdf`), and finally the UMD build from a CDN. The CDN fallback
   * is what makes PDF export work in the plain-browser UMD build and in setups
   * where `jspdf` was never installed — a bare `import('jspdf')` can't resolve
   * without a bundler, so it always failed there before.
   */
  private static loadJsPDF(): Promise<any> {
    if (ExportModule.jsPDFLoader) return ExportModule.jsPDFLoader;

    ExportModule.jsPDFLoader = (async () => {
      const fromGlobal = () => {
        const g = (globalThis as any).jspdf?.jsPDF ?? (globalThis as any).jsPDF;
        return typeof g === 'function' ? g : null;
      };

      const existing = fromGlobal();
      if (existing) return existing;

      try {
        // @ts-expect-error optional peer dependency
        const mod = await import(/* @vite-ignore */ 'jspdf');
        const ctor = mod.jsPDF ?? mod.default?.jsPDF ?? mod.default;
        if (typeof ctor === 'function') return ctor;
      } catch {
        /* not installed or unresolvable at runtime (e.g. UMD/CDN) — try the CDN */
      }

      await ExportModule.injectScript(ExportModule.JSPDF_CDN_URL);
      const fromCdn = fromGlobal();
      if (fromCdn) return fromCdn;

      throw new Error('jsPDF unavailable');
    })().catch((err) => {
      ExportModule.jsPDFLoader = null;
      throw err;
    });

    return ExportModule.jsPDFLoader;
  }

  /** Inject a `<script>` once and resolve when it loads. */
  private static injectScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => { script.remove(); reject(new Error(`Failed to load ${src}`)); };
      document.head.appendChild(script);
    });
  }

  static async exportPDF(svgString: string, filename: string = 'chart', scale: number = 2): Promise<void> {
    let jsPDF: any;
    try {
      jsPDF = await ExportModule.loadJsPDF();
    } catch {
      console.warn('KatuCharts: jspdf could not be loaded. Install it with `npm install jspdf`, expose it as a global, or allow the CDN fallback to enable PDF export.');
      return;
    }

    const canvas = await ExportModule.svgToCanvas(svgString, scale, '#ffffff');
    const imgData = canvas.toDataURL('image/jpeg', 0.95);

    const pxW = canvas.width / scale;
    const pxH = canvas.height / scale;
    const orientation = pxW > pxH ? 'landscape' : 'portrait';
    const pdf = new jsPDF({ orientation, unit: 'px', format: [pxW, pxH] });

    pdf.addImage(imgData, 'JPEG', 0, 0, pxW, pxH);
    pdf.save(`${filename}.pdf`);
  }

  static print(svgString: string, maxWidth?: number): void {
    const iframe = document.createElement('iframe');
    Object.assign(iframe.style, {
      position: 'fixed', left: '-9999px', top: '-9999px',
      width: '0', height: '0', border: 'none',
    });
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) { iframe.remove(); return; }

    const mw = maxWidth ?? 780;
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><style>
      body { margin: 0; padding: 20px; display: flex; justify-content: center; }
      svg { max-width: ${mw}px; height: auto; }
    </style></head><body>${svgString}</body></html>`);
    doc.close();

    const cleanup = () => {
      try { iframe.remove(); } catch {}
    };

    const win = iframe.contentWindow;
    if (!win) { cleanup(); return; }

    win.onafterprint = cleanup;
    setTimeout(() => {
      win.focus();
      win.print();
      setTimeout(cleanup, 3000);
    }, 250);
  }

  static exportCSV(
    seriesData: { name: string; data: { x?: any; y?: any; name?: string }[] }[],
    filename: string = 'chart',
    csvOptions?: {
      columnHeaderFormatter?: (item: any, key?: string, keyLength?: number) => string | false;
      dateFormat?: string;
      itemDelimiter?: string;
      lineDelimiter?: string;
      decimalPoint?: string;
    }
  ): void {
    const delimiter = csvOptions?.itemDelimiter ?? ',';
    const lineDelimiter = csvOptions?.lineDelimiter ?? '\n';
    const decimalPoint = csvOptions?.decimalPoint ?? '.';

    const headers = ['Category'];
    seriesData.forEach(s => {
      if (csvOptions?.columnHeaderFormatter) {
        const result = csvOptions.columnHeaderFormatter(s, 'y', 1);
        headers.push(result === false ? (s.name || 'Series') : result);
      } else {
        headers.push(s.name || 'Series');
      }
    });

    const allX = new Set<any>();
    for (const s of seriesData) {
      for (const d of s.data) {
        allX.add(d.name ?? d.x ?? '');
      }
    }

    const formatVal = (val: any): string => {
      if (val === undefined || val === null) return '';
      const str = String(val);
      if (decimalPoint !== '.' && typeof val === 'number') {
        return str.replace('.', decimalPoint);
      }
      return str;
    };

    const rows: string[][] = [];
    for (const x of allX) {
      const row = [String(x)];
      for (const s of seriesData) {
        const point = s.data.find(d => (d.name ?? d.x) === x);
        row.push(point?.y !== undefined && point.y !== null ? formatVal(point.y) : '');
      }
      rows.push(row);
    }

    const csv = [
      headers.map(h => escapeCsvCell(h, delimiter)).join(delimiter),
      ...rows.map(r => r.map(c => escapeCsvCell(c, delimiter)).join(delimiter)),
    ].join(lineDelimiter);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    ExportModule.downloadBlob(blob, `${filename}.csv`);
  }

  static getCSV(
    seriesData: { name: string; data: { x?: any; y?: any; name?: string }[] }[],
    csvOptions?: {
      columnHeaderFormatter?: (item: any, key?: string, keyLength?: number) => string | false;
      dateFormat?: string;
      itemDelimiter?: string;
      lineDelimiter?: string;
      decimalPoint?: string;
    }
  ): string {
    const delimiter = csvOptions?.itemDelimiter ?? ',';
    const lineDelimiter = csvOptions?.lineDelimiter ?? '\n';
    const decimalPoint = csvOptions?.decimalPoint ?? '.';

    const headers = ['Category'];
    seriesData.forEach(s => {
      if (csvOptions?.columnHeaderFormatter) {
        const result = csvOptions.columnHeaderFormatter(s, 'y', 1);
        headers.push(result === false ? (s.name || 'Series') : result);
      } else {
        headers.push(s.name || 'Series');
      }
    });

    const allX = new Set<any>();
    for (const s of seriesData) {
      for (const d of s.data) {
        allX.add(d.name ?? d.x ?? '');
      }
    }

    const formatVal = (val: any): string => {
      if (val === undefined || val === null) return '';
      const str = String(val);
      if (decimalPoint !== '.' && typeof val === 'number') {
        return str.replace('.', decimalPoint);
      }
      return str;
    };

    const rows: string[][] = [];
    for (const x of allX) {
      const row = [String(x)];
      for (const s of seriesData) {
        const point = s.data.find(d => (d.name ?? d.x) === x);
        row.push(point?.y !== undefined && point.y !== null ? formatVal(point.y) : '');
      }
      rows.push(row);
    }

    return [
      headers.map(h => escapeCsvCell(h, delimiter)).join(delimiter),
      ...rows.map(r => r.map(c => escapeCsvCell(c, delimiter)).join(delimiter)),
    ].join(lineDelimiter);
  }

  static getDataRows(
    seriesData: { name: string; data: { x?: any; y?: any; name?: string }[] }[]
  ): (string | number | null)[][] {
    const headers: (string | number | null)[] = ['Category'];
    seriesData.forEach(s => headers.push(s.name || 'Series'));

    const allX = new Set<any>();
    for (const s of seriesData) {
      for (const d of s.data) {
        allX.add(d.name ?? d.x ?? '');
      }
    }

    const rows: (string | number | null)[][] = [headers];
    for (const x of allX) {
      const row: (string | number | null)[] = [x != null ? String(x) : ''];
      for (const s of seriesData) {
        const point = s.data.find(d => (d.name ?? d.x) === x);
        row.push(point?.y ?? null);
      }
      rows.push(row);
    }

    return rows;
  }

  static getTable(
    seriesData: { name: string; data: { x?: any; y?: any; name?: string }[] }[],
    tableCaption?: string | boolean
  ): string {
    const rows = ExportModule.getDataRows(seriesData);
    if (rows.length === 0) return '<table></table>';

    const headers = rows[0];
    const dataRows = rows.slice(1);

    let html = '<table class="katucharts-data-table">';
    if (tableCaption && typeof tableCaption === 'string') {
      html += `<caption>${escapeHtml(tableCaption)}</caption>`;
    }
    html += '<thead><tr>';
    for (const h of headers) {
      html += `<th>${escapeHtml(h ?? '')}</th>`;
    }
    html += '</tr></thead><tbody>';

    for (const row of dataRows) {
      html += '<tr>';
      for (const cell of row) {
        html += `<td>${escapeHtml(cell ?? '')}</td>`;
      }
      html += '</tr>';
    }

    html += '</tbody></table>';
    return html;
  }

  static viewDataTable(
    seriesData: { name: string; data: { x?: any; y?: any; name?: string }[] }[],
    container: HTMLElement,
    tableCaption?: string | boolean
  ): HTMLDivElement {
    let tableDiv = container.querySelector('.katucharts-data-table-container') as HTMLDivElement;
    if (tableDiv) {
      tableDiv.remove();
      return null as any;
    }

    tableDiv = document.createElement('div');
    tableDiv.className = 'katucharts-data-table-container';
    Object.assign(tableDiv.style, {
      position: 'relative',
      maxHeight: '300px',
      overflow: 'auto',
      border: '1px solid #ccc',
      marginTop: '10px',
      fontSize: '11px',
    });

    const tableHtml = ExportModule.getTable(seriesData, tableCaption);
    tableDiv.innerHTML = tableHtml;

    const tableEl = tableDiv.querySelector('table');
    if (tableEl) {
      Object.assign(tableEl.style, {
        width: '100%',
        borderCollapse: 'collapse',
      });
      tableEl.querySelectorAll('th, td').forEach(cell => {
        Object.assign((cell as HTMLElement).style, {
          padding: '4px 8px',
          borderBottom: '1px solid #e6e6e6',
          textAlign: 'left',
        });
      });
      tableEl.querySelectorAll('th').forEach(th => {
        Object.assign((th as HTMLElement).style, {
          backgroundColor: '#f7f7f7',
          fontWeight: 'bold',
        });
      });
    }

    container.appendChild(tableDiv);
    return tableDiv;
  }

  static downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

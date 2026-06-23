/**
 * Owns the chart's export/output concern: image/SVG/PDF/CSV/XLS downloads, the
 * data-table view, print, the external-options snapshot, and full-screen
 * toggling. Extracted from `Chart` so the orchestrator no longer carries this
 * ~250-line subsystem. The exporter reaches back into the chart through a narrow
 * host interface (live getters + a few bound callbacks) so it always sees the
 * chart's current options/series and never captures stale references.
 */

import type { SVGRenderer } from '../core/SVGRenderer';
import type { InternalConfig, KatuChartsOptions, ExportingOptions } from '../types/options';
import type { BaseSeries } from '../series/BaseSeries';
import { ExportModule } from './Export';

export interface ExporterHost {
  getRenderer(): SVGRenderer;
  getOptions(): InternalConfig;
  getContainer(): HTMLElement;
  getSeriesInstances(): BaseSeries[];
  setSize(width: number, height: number): void;
  fireEvent(name: string, ...args: any[]): void;
  getDefaultHeightAspectRatio(): number;
  disconnectResizeObserver(): void;
  observeResizeObserver(): void;
  getViewportSize(): { width: number; height: number };
  fitToViewport(width: number, height: number): void;
}

export class ChartExporter {
  constructor(private host: ExporterHost) {}

  getSVG(): string {
    return this.host.getRenderer().getSerializedSVG();
  }

  getInlinedSVG(): string {
    const renderer = this.host.getRenderer();
    const node = renderer.getSVGNode();
    if (!node) return renderer.getSerializedSVG();
    return ExportModule.inlineStyles(node);
  }

  handleExportAction(type: string): void {
    const options = this.host.getOptions();
    const svg = this.getInlinedSVG();
    const filename = options.exporting.filename ?? 'chart';
    const scale = options.exporting.scale ?? 2;

    switch (type) {
      case 'downloadPNG':
        ExportModule.exportPNG(svg, filename, scale).catch(e =>
          console.warn('KatuCharts: PNG export failed.', e));
        break;
      case 'downloadJPEG':
        ExportModule.exportJPEG(svg, filename, scale).catch(e =>
          console.warn('KatuCharts: JPEG export failed.', e));
        break;
      case 'downloadSVG':
        ExportModule.exportSVG(svg, filename);
        break;
      case 'downloadPDF':
        ExportModule.exportPDF(svg, filename, scale).catch(e =>
          console.warn('KatuCharts: PDF export failed.', e));
        break;
      case 'downloadCSV':
        ExportModule.exportCSV(this.getSeriesDataForExport(), filename, options.exporting.csv);
        break;
      case 'downloadXLS':
        this.exportXLS(filename);
        break;
      case 'viewDataTable':
        ExportModule.viewDataTable(
          this.getSeriesDataForExport(),
          this.host.getContainer(),
          options.exporting.tableCaption
        );
        break;
      case 'viewFullScreen':
        this.toggleFullScreen();
        break;
      case 'printChart':
        this.host.fireEvent('beforePrint');
        ExportModule.print(svg, options.exporting.printMaxWidth);
        this.host.fireEvent('afterPrint');
        break;
    }
  }

  toggleFullScreen(): void {
    const container = this.host.getContainer();
    if (!container) return;

    const doc = container.ownerDocument;
    const win = doc.defaultView || window;
    const isFullScreen = doc.fullscreenElement === container
      || (doc as any).webkitFullscreenElement === container;

    if (isFullScreen) {
      if (doc.exitFullscreen) {
        doc.exitFullscreen();
      } else if ((doc as any).webkitExitFullscreen) {
        (doc as any).webkitExitFullscreen();
      }
      return;
    }

    const style = container.style;
    const savedCSS = {
      width: style.width,
      height: style.height,
      maxWidth: style.maxWidth,
      maxHeight: style.maxHeight,
      background: style.background,
    };

    const bgColor = this.host.getOptions().chart.backgroundColor || '#fff';
    style.background = bgColor as string;
    style.width = '100vw';
    style.height = '100vh';
    style.maxWidth = 'none';
    style.maxHeight = 'none';

    this.host.disconnectResizeObserver();

    /**
     * Snapshot the outer viewport so we can restore it on exit.
     */
    const savedViewport = this.host.getViewportSize();

    /**
     * Restore saved CSS properties when exiting fullscreen.
     */
    const restoreCSS = () => {
      style.width = savedCSS.width;
      style.height = savedCSS.height;
      style.maxWidth = savedCSS.maxWidth;
      style.maxHeight = savedCSS.maxHeight;
      style.background = savedCSS.background;
    };

    const restoreSize = () => {
      this.host.fitToViewport(savedViewport.width, savedViewport.height);
    };

    let closeBtn: HTMLButtonElement | null = null;
    /**
     * Fullscreen: the container IS the viewport, so size off window dimensions (reliable immediately,
     * unlike getBoundingClientRect). The resize listener catches any viewport settle (e.g. browser
     * chrome animating away). fitToViewport grows the scrollable viewport + overlay so the chart
     * fills the screen instead of being clipped to its original box.
     */
    const syncFullScreenSize = () => {
      const w = win.innerWidth;
      const h = win.innerHeight;
      if (!w || !h) return;
      this.host.fitToViewport(w, h);
    };

    const exitFullScreen = () => {
      if (doc.exitFullscreen) {
        doc.exitFullscreen();
      } else if ((doc as any).webkitExitFullscreen) {
        (doc as any).webkitExitFullscreen();
      }
    };

    const cleanup = () => {
      win.removeEventListener('resize', syncFullScreenSize);
      doc.removeEventListener('fullscreenchange', onFullScreenChange);
      doc.removeEventListener('webkitfullscreenchange', onFullScreenChange);
    };

    const onFullScreenChange = () => {
      const stillFullScreen = doc.fullscreenElement === container
        || (doc as any).webkitFullscreenElement === container;

      if (stillFullScreen) {
        closeBtn = doc.createElement('button');
        closeBtn.textContent = '✕';
        Object.assign(closeBtn.style, {
          position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)', zIndex: '10000',
          width: '32px', height: '32px', border: 'none', borderRadius: '50%',
          background: 'rgba(0,0,0,0.4)', color: '#fff', fontSize: '18px',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          lineHeight: '1', padding: '0',
        });
        closeBtn.addEventListener('mouseenter', () => { if (closeBtn) closeBtn.style.background = 'rgba(0,0,0,0.7)'; });
        closeBtn.addEventListener('mouseleave', () => { if (closeBtn) closeBtn.style.background = 'rgba(0,0,0,0.4)'; });
        closeBtn.addEventListener('click', exitFullScreen);
        container.appendChild(closeBtn);

        /**
         * Size immediately, then again next frame (viewport may not report fullscreen dimensions on the
         * exact tick fullscreenchange fires), and on every later resize while fullscreen is active.
         */
        syncFullScreenSize();
        requestAnimationFrame(syncFullScreenSize);
        win.addEventListener('resize', syncFullScreenSize);
      } else {
        cleanup();
        if (closeBtn) { closeBtn.remove(); closeBtn = null; }
        restoreCSS();
        restoreSize();
        requestAnimationFrame(() => {
          this.host.observeResizeObserver();
          this.host.fireEvent('exitFullScreen');
        });
      }
    };

    doc.addEventListener('fullscreenchange', onFullScreenChange);
    doc.addEventListener('webkitfullscreenchange', onFullScreenChange);

    /**
     * Reset everything if entering fullscreen fails. requestFullscreen rejects ASYNCHRONOUSLY (e.g.
     * permission denied / no user gesture), so a plain try/catch misses it and would leave the
     * container stuck at 100vw/100vh.
     */
    const abort = () => {
      cleanup();
      restoreCSS();
      this.host.getRenderer().svg.style('width', null).style('height', null);
      restoreSize();
      this.host.observeResizeObserver();
    };

    try {
      const req = container.requestFullscreen
        ? container.requestFullscreen()
        : (container as any).webkitRequestFullscreen?.();
      if (req && typeof (req as Promise<void>).catch === 'function') {
        (req as Promise<void>).catch(abort);
      }
      this.host.fireEvent('enterFullScreen');
    } catch {
      abort();
    }
  }

  getSeriesDataForExport(): { name: string; data: { x?: any; y?: any; name?: string }[] }[] {
    return this.host.getSeriesInstances().map(s => ({
      name: s.config.name || `Series ${s.config.index + 1}`,
      data: s.data.map(d => ({ x: d.x, y: d.y, name: d.name })),
    }));
  }

  exportXLS(filename: string): void {
    const rows = ExportModule.getDataRows(this.getSeriesDataForExport());
    let html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:spreadsheet" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"/></head><body><table>';
    for (const row of rows) {
      html += '<tr>';
      for (const cell of row) {
        html += `<td>${cell ?? ''}</td>`;
      }
      html += '</tr>';
    }
    html += '</table></body></html>';
    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    ExportModule.downloadBlob(blob, `${filename}.xls`);
  }

  getCSV(): string {
    return ExportModule.getCSV(this.getSeriesDataForExport(), this.host.getOptions().exporting.csv);
  }

  getTable(): string {
    return ExportModule.getTable(this.getSeriesDataForExport(), this.host.getOptions().exporting.tableCaption);
  }

  getDataRows(): (string | number | null)[][] {
    return ExportModule.getDataRows(this.getSeriesDataForExport());
  }

  exportChart(exportingOptions?: Partial<ExportingOptions>): void {
    const merged = { ...this.host.getOptions().exporting, ...exportingOptions };
    const svg = this.getInlinedSVG();
    const filename = merged.filename ?? 'chart';
    const scale = merged.scale ?? 2;

    switch (merged.type) {
      case 'image/jpeg':
        ExportModule.exportJPEG(svg, filename, scale);
        break;
      case 'image/svg+xml':
        ExportModule.exportSVG(svg, filename);
        break;
      case 'application/pdf':
        ExportModule.exportPDF(svg, filename, scale);
        break;
      case 'image/png':
      default:
        ExportModule.exportPNG(svg, filename, scale);
        break;
    }
  }

  print(): void {
    this.host.fireEvent('beforePrint');
    const svg = this.getInlinedSVG();
    ExportModule.print(svg, this.host.getOptions().exporting.printMaxWidth);
    this.host.fireEvent('afterPrint');
  }

  optionsToExternal(): KatuChartsOptions {
    const o = this.host.getOptions();
    return {
      chart: o.chart,
      title: o.title,
      subtitle: o.subtitle,
      xAxis: o.xAxis,
      yAxis: o.yAxis,
      colorAxis: o.colorAxis,
      series: o.series,
      tooltip: o.tooltip,
      legend: o.legend,
      plotOptions: o.plotOptions,
      credits: o.credits,
      colors: o.colors,
    };
  }
}

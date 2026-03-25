/**
 * KatuCharts — D3.js charting library.
 */

import { Chart } from './core/Chart';
import { setGlobalOptions, getGlobalOptions } from './core/OptionsParser';
import { SeriesRegistry, ModuleRegistry, type ModuleDefinition } from './core/Registry';
import { ExportModule } from './export/Export';
import { LicenseManager } from './license/LicenseManager';
import { dateFormat, numberFormat, templateFormat, stripHtmlTags } from './utils/format';
import { parseColor, PALETTES, getPalette, THEMES } from './utils/color';
import type { KatuChartsOptions } from './types/options';
import { registerCoreSeriesTypes } from './core/registerCore';
import { registerGeneralSeriesTypes } from './core/registerGeneral';
import { registerFinancialSeriesTypes } from './core/registerFinancial';
import { registerFlowSeriesTypes } from './core/registerFlow';

registerCoreSeriesTypes();
registerGeneralSeriesTypes();
registerFinancialSeriesTypes();
registerFlowSeriesTypes();

export const KatuCharts = {
  chart(containerOrId: string | HTMLElement, options: KatuChartsOptions): Chart {
    return new Chart(containerOrId, options);
  },

  setOptions(options: Partial<KatuChartsOptions>): void {
    setGlobalOptions(options);
  },

  getOptions(): Partial<KatuChartsOptions> {
    return getGlobalOptions();
  },

  dateFormat,
  numberFormat,
  templateFormat,
  stripHtmlTags,

  color(input: string) {
    return parseColor(input);
  },

  palettes: PALETTES,

  getPalette(name: string): string[] {
    return getPalette(name);
  },

  setTheme(name: string): void {
    const theme = THEMES[name];
    if (theme) setGlobalOptions(theme);
  },

  use(module: ModuleDefinition): void {
    ModuleRegistry.register(module);
    module.init(KatuCharts);
  },

  setLicenseKey(key: string): boolean {
    return LicenseManager.setKey(key);
  },

  isLicensed(): boolean {
    return LicenseManager.isLicensed();
  },

  SeriesRegistry,
};

export default KatuCharts;

export { Chart } from './core/Chart';
export { EventBus } from './core/EventBus';
export { SVGRenderer } from './core/SVGRenderer';
export { OptionsParser, setGlobalOptions, getGlobalOptions } from './core/OptionsParser';
export { SeriesRegistry, ModuleRegistry } from './core/Registry';
export { BaseSeries } from './series/BaseSeries';
export { ExportModule } from './export/Export';
export { ResponsiveEngine } from './responsive/ResponsiveEngine';
export { A11yModule } from './accessibility/A11yModule';
export { Drilldown } from './interaction/Drilldown';
export { Zoom } from './interaction/Zoom';
export { Tooltip } from './components/Tooltip';
export { Legend } from './components/Legend';
export { DataLabels } from './components/DataLabels';
export { Crosshair } from './components/Crosshair';
export { ExportButton } from './components/ExportButton';
export { LicenseManager } from './license/LicenseManager';
export { Navigator } from './stock/Navigator';
export { RangeSelector } from './stock/RangeSelector';
export { DataGrouping } from './stock/DataGrouping';
export { registerCoreSeriesTypes } from './core/registerCore';
export { registerGeneralSeriesTypes } from './core/registerGeneral';
export { registerFinancialSeriesTypes } from './core/registerFinancial';
export { registerFlowSeriesTypes } from './core/registerFlow';
export { lttbDecimate, minMaxDecimate } from './utils/decimation';
export { CircularBuffer } from './utils/CircularBuffer';
export { UpdateScheduler, UpdateBatch } from './core/UpdateScheduler';
export { StreamAdapter } from './streaming/StreamAdapter';
export type { StreamSubscription } from './streaming/StreamAdapter';
export type { UpdateType, UpdateEntry } from './core/UpdateScheduler';

export type {
  KatuChartsOptions, ChartOptions, SeriesOptions, AxisOptions, TooltipOptions,
  LegendOptions, PlotOptions, PointOptions, MarkerOptions, DataLabelOptions,
  SeriesType, PlotArea, InternalConfig, ExportingOptions, StreamingOptions,
} from './types/options';

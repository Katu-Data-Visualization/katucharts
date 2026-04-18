/**
 * KatuCharts Stock Chart entrypoint — adds navigator, range selector, data grouping.
 */

import { KatuCharts, Chart } from './index';
import type { KatuChartsOptions } from './types/options';
import { deepMerge } from './utils/deepMerge';

const stockDefaults: Partial<KatuChartsOptions> = {
  navigator: { enabled: true },
  rangeSelector: { enabled: true },
  tooltip: { shared: true },
  xAxis: { type: 'datetime' as const },
};

export function stockChart(containerOrId: string | HTMLElement, options: KatuChartsOptions): Chart {
  const merged = deepMerge({} as any, stockDefaults, options) as KatuChartsOptions;
  return new Chart(containerOrId, merged);
}

(KatuCharts as any).stockChart = stockChart;

export default KatuCharts;
export { KatuCharts, Chart };

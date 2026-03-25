/**
 * Registers flow/network series types as a plugin.
 */

import { SeriesRegistry } from './Registry';
import { SankeySeries } from '../series/flow/SankeySeries';
import { NetworkGraphSeries } from '../series/flow/NetworkGraphSeries';
import { DependencyWheelSeries } from '../series/flow/DependencyWheelSeries';

export function registerFlowSeriesTypes(): void {
  SeriesRegistry.registerType('sankey', SankeySeries);
  SeriesRegistry.registerType('networkgraph', NetworkGraphSeries);
  SeriesRegistry.registerType('dependencywheel', DependencyWheelSeries);
}

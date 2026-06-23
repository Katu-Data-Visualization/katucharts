/**
 * Registers flow/network series types as a plugin.
 */

import { ChartRegistry } from './Registry';
import { SankeyChart } from '../series/flow/SankeyChart';
import { NetworkGraphChart } from '../series/flow/NetworkGraphChart';
import { DependencyWheelChart } from '../series/flow/DependencyWheelChart';

export function registerFlowSeriesTypes(): void {
  ChartRegistry.registerType('sankey', SankeyChart);
  ChartRegistry.registerType('networkgraph', NetworkGraphChart);
  ChartRegistry.registerType('dependencywheel', DependencyWheelChart);
}

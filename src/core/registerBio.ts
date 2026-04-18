/**
 * Registers bioinformatics series types as a plugin.
 */

import { ChartRegistry } from './Registry';
import { VolcanoChart } from '../series/bioinformatics/VolcanoChart';
import { ManhattanChart } from '../series/bioinformatics/ManhattanChart';
import { ViolinChart } from '../series/bioinformatics/ViolinChart';
import { KaplanMeierChart } from '../series/bioinformatics/KaplanMeierChart';
import { ForestPlotChart } from '../series/bioinformatics/ForestPlotChart';
import { SequenceLogoChart } from '../series/bioinformatics/SequenceLogoChart';
import { ClusteredHeatmapChart } from '../series/bioinformatics/ClusteredHeatmapChart';
import { PhyloTreeChart } from '../series/bioinformatics/PhyloTreeChart';
import { CircosChart } from '../series/bioinformatics/CircosChart';
import { CircosChordChart } from '../series/bioinformatics/circos/CircosChordChart';
import { CircosHeatmapChart } from '../series/bioinformatics/circos/CircosHeatmapChart';
import { CircosComparativeChart } from '../series/bioinformatics/circos/CircosComparativeChart';
import { CircosSpiralChart } from '../series/bioinformatics/circos/CircosSpiralChart';

export function registerBioSeriesTypes(): void {
  ChartRegistry.registerType('volcano', VolcanoChart);
  ChartRegistry.registerType('manhattan', ManhattanChart);
  ChartRegistry.registerType('violin', ViolinChart);
  ChartRegistry.registerType('kaplanmeier', KaplanMeierChart);
  ChartRegistry.registerType('forestplot', ForestPlotChart);
  ChartRegistry.registerType('sequencelogo', SequenceLogoChart);
  ChartRegistry.registerType('clusteredheatmap', ClusteredHeatmapChart);
  ChartRegistry.registerType('phylotree', PhyloTreeChart);
  ChartRegistry.registerType('circos', CircosChart);
  ChartRegistry.registerType('circosChord', CircosChordChart);
  ChartRegistry.registerType('circosHeatmap', CircosHeatmapChart);
  ChartRegistry.registerType('circosComparative', CircosComparativeChart);
  ChartRegistry.registerType('circosSpiral', CircosSpiralChart);
}

/**
 * Registers bioinformatics series types as a plugin.
 */

import { SeriesRegistry } from './Registry';
import { VolcanoSeries } from '../series/bioinformatics/VolcanoSeries';
import { ManhattanSeries } from '../series/bioinformatics/ManhattanSeries';
import { ViolinSeries } from '../series/bioinformatics/ViolinSeries';
import { KaplanMeierSeries } from '../series/bioinformatics/KaplanMeierSeries';
import { ForestPlotSeries } from '../series/bioinformatics/ForestPlotSeries';
import { SequenceLogoSeries } from '../series/bioinformatics/SequenceLogoSeries';
import { ClusteredHeatmapSeries } from '../series/bioinformatics/ClusteredHeatmapSeries';
import { PhyloTreeSeries } from '../series/bioinformatics/PhyloTreeSeries';
import { CircosSeries } from '../series/bioinformatics/CircosSeries';
import { CircosChordSeries } from '../series/bioinformatics/circos/CircosChordSeries';
import { CircosHeatmapSeries } from '../series/bioinformatics/circos/CircosHeatmapSeries';
import { CircosComparativeSeries } from '../series/bioinformatics/circos/CircosComparativeSeries';
import { CircosSpiralSeries } from '../series/bioinformatics/circos/CircosSpiralSeries';

export function registerBioSeriesTypes(): void {
  SeriesRegistry.registerType('volcano', VolcanoSeries);
  SeriesRegistry.registerType('manhattan', ManhattanSeries);
  SeriesRegistry.registerType('violin', ViolinSeries);
  SeriesRegistry.registerType('kaplanmeier', KaplanMeierSeries);
  SeriesRegistry.registerType('forestplot', ForestPlotSeries);
  SeriesRegistry.registerType('sequencelogo', SequenceLogoSeries);
  SeriesRegistry.registerType('clusteredheatmap', ClusteredHeatmapSeries);
  SeriesRegistry.registerType('phylotree', PhyloTreeSeries);
  SeriesRegistry.registerType('circos', CircosSeries);
  SeriesRegistry.registerType('circosChord', CircosChordSeries);
  SeriesRegistry.registerType('circosHeatmap', CircosHeatmapSeries);
  SeriesRegistry.registerType('circosComparative', CircosComparativeSeries);
  SeriesRegistry.registerType('circosSpiral', CircosSpiralSeries);
}

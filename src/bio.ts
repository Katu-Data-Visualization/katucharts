/**
 * KatuCharts — Bioinformatics charts plugin.
 *
 * Import this module to register all bioinformatics series types:
 *   import 'katucharts/bio';
 *
 * Or import named exports for manual control:
 *   import { registerBioSeriesTypes, VolcanoSeries } from 'katucharts/bio';
 */

import { registerBioSeriesTypes } from './core/registerBio';

registerBioSeriesTypes();

export { registerBioSeriesTypes } from './core/registerBio';

export { VolcanoSeries } from './series/bioinformatics/VolcanoSeries';
export { ManhattanSeries } from './series/bioinformatics/ManhattanSeries';
export { ViolinSeries } from './series/bioinformatics/ViolinSeries';
export { KaplanMeierSeries } from './series/bioinformatics/KaplanMeierSeries';
export { ForestPlotSeries } from './series/bioinformatics/ForestPlotSeries';
export { SequenceLogoSeries } from './series/bioinformatics/SequenceLogoSeries';
export { ClusteredHeatmapSeries } from './series/bioinformatics/ClusteredHeatmapSeries';
export { PhyloTreeSeries } from './series/bioinformatics/PhyloTreeSeries';
export { CircosSeries } from './series/bioinformatics/CircosSeries';
export { CircosChordSeries } from './series/bioinformatics/circos/CircosChordSeries';
export { CircosHeatmapSeries } from './series/bioinformatics/circos/CircosHeatmapSeries';
export { CircosComparativeSeries } from './series/bioinformatics/circos/CircosComparativeSeries';
export { CircosSpiralSeries } from './series/bioinformatics/circos/CircosSpiralSeries';

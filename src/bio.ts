/**
 * KatuCharts — Bioinformatics charts plugin.
 *
 * Import this module to register all bioinformatics series types:
 *   import 'katucharts/bio';
 *
 * Or import named exports for manual control:
 *   import { registerBioSeriesTypes, VolcanoChart } from 'katucharts/bio';
 */

import { registerBioSeriesTypes } from './core/registerBio';

registerBioSeriesTypes();

export { registerBioSeriesTypes } from './core/registerBio';

export { VolcanoChart } from './series/bioinformatics/VolcanoChart';
export { ManhattanChart } from './series/bioinformatics/ManhattanChart';
export { ViolinChart } from './series/bioinformatics/ViolinChart';
export { KaplanMeierChart } from './series/bioinformatics/KaplanMeierChart';
export { ForestPlotChart } from './series/bioinformatics/ForestPlotChart';
export { SequenceLogoChart } from './series/bioinformatics/SequenceLogoChart';
export { ClusteredHeatmapChart } from './series/bioinformatics/ClusteredHeatmapChart';
export { PhyloTreeChart } from './series/bioinformatics/PhyloTreeChart';
export { CircosChart } from './series/bioinformatics/CircosChart';
export { CircosChordChart } from './series/bioinformatics/circos/CircosChordChart';
export { CircosHeatmapChart } from './series/bioinformatics/circos/CircosHeatmapChart';
export { CircosComparativeChart } from './series/bioinformatics/circos/CircosComparativeChart';
export { CircosSpiralChart } from './series/bioinformatics/circos/CircosSpiralChart';

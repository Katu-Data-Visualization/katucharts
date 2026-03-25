/**
 * Registers all built-in series types with the SeriesRegistry.
 */

import { registerCoreSeriesTypes } from './registerCore';
import { registerGeneralSeriesTypes } from './registerGeneral';
import { registerFinancialSeriesTypes } from './registerFinancial';
import { registerFlowSeriesTypes } from './registerFlow';
import { registerBioSeriesTypes } from './registerBio';

export function registerAllSeriesTypes(): void {
  registerCoreSeriesTypes();
  registerGeneralSeriesTypes();
  registerFinancialSeriesTypes();
  registerFlowSeriesTypes();
  registerBioSeriesTypes();
}

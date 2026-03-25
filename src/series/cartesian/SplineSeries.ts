/**
 * Spline series: smooth catmull-rom curve variant of LineSeries.
 */

import { curveCatmullRom } from 'd3-shape';
import { LineSeries } from './LineSeries';
import type { InternalSeriesConfig } from '../../types/options';

export class SplineSeries extends LineSeries {
  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  protected getCurve() {
    return curveCatmullRom.alpha(0.5);
  }
}

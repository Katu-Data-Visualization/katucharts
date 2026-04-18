/**
 * Spline series: smooth catmull-rom curve variant of LineChart.
 */

import { curveCatmullRom } from 'd3-shape';
import { LineChart } from './LineChart';
import type { InternalSeriesConfig } from '../../types/options';

export class SplineChart extends LineChart {
  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  protected getCurve() {
    return curveCatmullRom.alpha(0.5);
  }
}

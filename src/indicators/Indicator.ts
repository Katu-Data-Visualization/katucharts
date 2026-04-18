import type { PointOptions } from '../types/options';

export interface OHLCVPoint {
  x: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface IndicatorResult {
  values: PointOptions[];
  bands?: {
    upper: PointOptions[];
    lower: PointOptions[];
    middle?: PointOptions[];
  };
  histogram?: PointOptions[];
  signal?: PointOptions[];
}

export abstract class Indicator {
  abstract readonly name: string;
  abstract calculate(data: OHLCVPoint[], params: Record<string, number>): IndicatorResult;
}

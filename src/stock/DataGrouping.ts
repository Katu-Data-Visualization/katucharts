import type { PointOptions } from '../types/options';

export type GroupingApproximation = 'average' | 'sum' | 'open' | 'high' | 'low' | 'close' | 'ohlc' | 'range';

export interface DataGroupingOptions {
  enabled?: boolean;
  approximation?: GroupingApproximation;
  groupPixelWidth?: number;
  forced?: boolean;
  smoothed?: boolean;
  anchor?: 'start' | 'middle' | 'end';
  units?: [string, number[] | null][];
  groupAll?: boolean;
}

export class DataGrouping {
  static group(
    data: PointOptions[],
    interval: number,
    approximation: GroupingApproximation = 'average',
    options?: DataGroupingOptions,
    visibleRange?: { min: number; max: number }
  ): PointOptions[] {
    if (!data.length || interval <= 0) return data;

    const sorted = [...data].sort((a, b) => (a.x ?? 0) - (b.x ?? 0));

    const filtered = (!options?.groupAll && visibleRange)
      ? sorted.filter(p => {
          const x = p.x ?? 0;
          return x >= visibleRange.min && x <= visibleRange.max;
        })
      : sorted;

    const groups = new Map<number, PointOptions[]>();

    for (const point of filtered) {
      const x = point.x ?? 0;
      const bucket = Math.floor(x / interval) * interval;
      if (!groups.has(bucket)) groups.set(bucket, []);
      groups.get(bucket)!.push(point);
    }

    const anchor = options?.anchor ?? 'start';
    const result: PointOptions[] = [];
    for (const [bucket, points] of groups) {
      const anchoredX = DataGrouping.applyAnchor(bucket, interval, anchor);
      const grouped = DataGrouping.approximate(anchoredX, points, approximation);
      result.push(grouped);
    }

    if (options?.smoothed && result.length >= 3) {
      return DataGrouping.smooth(result);
    }

    return result;
  }

  private static applyAnchor(bucketStart: number, interval: number, anchor: string): number {
    switch (anchor) {
      case 'middle': return bucketStart + interval / 2;
      case 'end': return bucketStart + interval;
      default: return bucketStart;
    }
  }

  private static smooth(data: PointOptions[]): PointOptions[] {
    const result: PointOptions[] = [data[0]];
    for (let i = 1; i < data.length - 1; i++) {
      const prev = data[i - 1].y ?? 0;
      const curr = data[i].y ?? 0;
      const next = data[i + 1].y ?? 0;
      result.push({ ...data[i], y: (prev + curr + next) / 3 });
    }
    result.push(data[data.length - 1]);
    return result;
  }

  private static approximate(
    x: number,
    points: PointOptions[],
    method: GroupingApproximation
  ): PointOptions {
    const values = points.map(p => p.y ?? 0);

    switch (method) {
      case 'sum':
        return { x, y: values.reduce((a, b) => a + b, 0) };
      case 'open':
        return { x, y: values[0] };
      case 'high':
        return { x, y: Math.max(...values) };
      case 'low':
        return { x, y: Math.min(...values) };
      case 'close':
        return { x, y: values[values.length - 1] };
      case 'range':
        return { x, y: Math.max(...values) - Math.min(...values) };
      case 'ohlc':
        return {
          x,
          y: values[values.length - 1],
          open: values[0],
          high: Math.max(...values),
          low: Math.min(...values),
          close: values[values.length - 1],
        } as any;
      case 'average':
      default:
        return { x, y: values.reduce((a, b) => a + b, 0) / values.length };
    }
  }
}

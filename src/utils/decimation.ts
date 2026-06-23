/**
 * Point decimation algorithms for rendering large datasets efficiently.
 * Original data is never modified — these return reduced copies for rendering only.
 */

import type { PointOptions } from '../types/options';

/**
 * Largest-Triangle-Three-Buckets (LTTB) decimation.
 * Preserves visual shape better than simple sampling by selecting
 * the point in each bucket that forms the largest triangle with
 * the previously selected point and the average of the next bucket.
 * O(n) time complexity.
 */
export function lttbDecimate(data: PointOptions[], targetPoints: number): PointOptions[] {
  const len = data.length;
  if (targetPoints >= len || targetPoints < 3) return data;

  const result: PointOptions[] = new Array(targetPoints);
  result[0] = data[0];
  result[targetPoints - 1] = data[len - 1];

  const bucketSize = (len - 2) / (targetPoints - 2);

  let prevSelectedIdx = 0;

  for (let i = 1; i < targetPoints - 1; i++) {
    const bucketStart = Math.floor((i - 1) * bucketSize) + 1;
    const bucketEnd = Math.min(Math.floor(i * bucketSize) + 1, len - 1);

    const nextBucketStart = Math.floor(i * bucketSize) + 1;
    const nextBucketEnd = Math.min(Math.floor((i + 1) * bucketSize) + 1, len - 1);

    let avgX = 0;
    let avgY = 0;
    const nextCount = nextBucketEnd - nextBucketStart;
    for (let j = nextBucketStart; j < nextBucketEnd; j++) {
      avgX += data[j].x ?? j;
      avgY += data[j].y ?? 0;
    }
    if (nextCount > 0) {
      avgX /= nextCount;
      avgY /= nextCount;
    }

    const prevX = data[prevSelectedIdx].x ?? prevSelectedIdx;
    const prevY = data[prevSelectedIdx].y ?? 0;

    let maxArea = -1;
    let selectedIdx = bucketStart;

    for (let j = bucketStart; j < bucketEnd; j++) {
      const px = data[j].x ?? j;
      const py = data[j].y ?? 0;
      const area = Math.abs((prevX - avgX) * (py - prevY) - (prevX - px) * (avgY - prevY));
      if (area > maxArea) {
        maxArea = area;
        selectedIdx = j;
      }
    }

    result[i] = data[selectedIdx];
    prevSelectedIdx = selectedIdx;
  }

  return result;
}

/**
 * Min-max decimation: for each bucket, keeps the min and max y-value points.
 * Faster than LTTB but less visually accurate. Good for column/bar charts.
 * O(n) time complexity.
 */
export function minMaxDecimate(data: PointOptions[], targetPoints: number): PointOptions[] {
  const len = data.length;
  if (targetPoints >= len || targetPoints < 2) return data;

  const bucketsCount = Math.ceil(targetPoints / 2);
  const bucketSize = len / bucketsCount;
  const result: PointOptions[] = [];

  result.push(data[0]);

  for (let i = 0; i < bucketsCount; i++) {
    const start = Math.floor(i * bucketSize);
    const end = Math.min(Math.floor((i + 1) * bucketSize), len);

    let minIdx = start;
    let maxIdx = start;
    let minY = data[start].y ?? 0;
    let maxY = minY;

    for (let j = start + 1; j < end; j++) {
      const y = data[j].y ?? 0;
      if (y < minY) { minY = y; minIdx = j; }
      if (y > maxY) { maxY = y; maxIdx = j; }
    }

    if (minIdx < maxIdx) {
      result.push(data[minIdx]);
      if (minIdx !== maxIdx) result.push(data[maxIdx]);
    } else {
      result.push(data[maxIdx]);
      if (minIdx !== maxIdx) result.push(data[minIdx]);
    }
  }

  if (result[result.length - 1] !== data[len - 1]) {
    result.push(data[len - 1]);
  }

  return result;
}

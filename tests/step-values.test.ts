import { describe, it, expect } from 'vitest';
import { stepValues, arrayMin, arrayMax } from '../src/utils/math';

describe('stepValues', () => {
  it('steps from start to end inclusive', () => {
    expect(stepValues(0, 10, 2.5)).toEqual([0, 2.5, 5, 7.5, 10]);
  });

  it('honours a tolerance past the end', () => {
    expect(stepValues(0, 9.95, 5, 1000, 0.1)).toEqual([0, 5, 10]);
  });

  it.each([0, -1, NaN, Infinity])('returns nothing for step %s', step => {
    expect(stepValues(0, 10, step)).toEqual([]);
  });

  it('returns nothing for non-finite or reversed bounds', () => {
    expect(stepValues(NaN, 10, 1)).toEqual([]);
    expect(stepValues(0, Infinity, 1)).toEqual([]);
    expect(stepValues(10, 0, 1)).toEqual([]);
  });

  it('widens a step that would produce too many values', () => {
    const v = stepValues(0, 1e9, 0.001, 1000);
    expect(v.length).toBeLessThanOrEqual(1001);
    expect(v[0]).toBe(0);
    expect(v[v.length - 1]).toBeCloseTo(1e9);
  });

  it('terminates when the step is negligible next to huge values', () => {
    expect(stepValues(1e300, 2e300, 1).length).toBeLessThanOrEqual(1001);
  });
});

describe('stepValues widening', () => {
  it('keeps widened steps on the requested grid', () => {
    const v = stepValues(0, 1234, 1, 1000);
    expect(v.every(t => Number.isInteger(t))).toBe(true);
    expect(v[1]).toBe(2);
  });
});

describe('arrayMin / arrayMax', () => {
  it('handles arrays far beyond the spread-argument limit', () => {
    const big = Array.from({ length: 300000 }, (_, i) => i - 5);
    expect(arrayMin(big)).toBe(-5);
    expect(arrayMax(big)).toBe(299994);
  });

  it('skips null and NaN, and falls back when nothing is left', () => {
    expect(arrayMin([3, null, NaN, 1, undefined])).toBe(1);
    expect(arrayMax([null, NaN], -Infinity)).toBe(-Infinity);
    expect(Number.isNaN(arrayMin([]))).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { OptionsParser } from '../src/core/OptionsParser';

const parse = (options: any) => new OptionsParser().parse(options);

describe('OptionsParser.normalizeSeriesList', () => {
  it('keeps a series array, dropping entries that are not series objects', () => {
    const list = OptionsParser.normalizeSeriesList([{ data: [1] }, null, undefined, 'x', 3, [1, 2], { name: 'b' }]);
    expect(list).toEqual([{ data: [1] }, { name: 'b' }]);
  });

  it('wraps a single series object', () => {
    expect(OptionsParser.normalizeSeriesList({ name: 'a', data: [1] })).toEqual([{ name: 'a', data: [1] }]);
  });

  it.each([
    ['an empty object', {}],
    ['null', null],
    ['undefined', undefined],
    ['a string', 'abc'],
    ['a number', 5],
    ['a boolean', true],
  ])('turns %s into an empty list', (_label, value) => {
    expect(OptionsParser.normalizeSeriesList(value)).toEqual([]);
  });
});

describe('OptionsParser.parse with malformed input', () => {
  it('accepts missing options', () => {
    expect(() => parse(undefined)).not.toThrow();
    expect(parse(undefined).series).toEqual([]);
  });

  it.each([{}, null, 'x', 7, [null], [{}].slice(1)])('always yields a series array (%j)', series => {
    const cfg = parse({ chart: { type: 'column' }, series });
    expect(Array.isArray(cfg.series)).toBe(true);
    expect(cfg.series).toHaveLength(0);
  });

  it('turns non-array data into an empty list', () => {
    for (const data of [{}, 'abc', 5]) {
      const cfg = parse({ series: [{ data }] });
      expect(cfg.series[0].data).toEqual([]);
    }
  });

  it('turns undefined, NaN and Infinity points into null gaps', () => {
    const cfg = parse({ series: [{ data: [1, undefined, NaN, Infinity, -Infinity, null, 2] }] });
    const ys = (cfg.series[0].data as any[]).map(p => p.y);
    expect(ys).toEqual([1, null, null, null, null, null, 2]);
    const xs = (cfg.series[0].data as any[]).map(p => p.x);
    expect(xs).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('reads numbers sent as strings and leaves other strings as gaps', () => {
    const cfg = parse({ series: [{ data: ['1', ' 2.5 ', '', 'abc', '1e3', true] }] });
    expect((cfg.series[0].data as any[]).map(p => p.y)).toEqual([1, 2.5, null, null, 1000, null]);
    expect((cfg.series[0].data as any[]).map(p => p.x)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('drops categories that are not an array', () => {
    for (const categories of [{}, 'abc', 4]) {
      const cfg = parse({ xAxis: { categories }, series: [{ data: [1, 2] }] });
      expect((cfg.xAxis[0] as any).categories).toBeUndefined();
    }
  });

  it('keeps valid categories and series untouched', () => {
    const cfg = parse({
      chart: { type: 'column' },
      xAxis: { categories: ['A', 'B'] },
      series: [{ name: 'S', data: [1, 2] }],
    });
    expect((cfg.xAxis[0] as any).categories).toEqual(['A', 'B']);
    expect(cfg.series[0].name).toBe('S');
    expect((cfg.series[0].data as any[]).map(p => p.y)).toEqual([1, 2]);
  });
});

describe('OptionsParser.parse with values too large to plot', () => {
  it('treats magnitudes beyond 1e300 as gaps and keeps large but sane values', () => {
    const cfg = parse({ series: [{ data: [1e308, -1e308, 1e20, 5] }] });
    expect((cfg.series[0].data as any[]).map(p => p.y)).toEqual([null, null, 1e20, 5]);
  });

  it('cleans value fields inside point objects and arrays', () => {
    const cfg = parse({ series: [{ type: 'arearange', data: [[0, -1e308, 2], { x: 1, low: '1', high: 'x' }] }] });
    const [a, b] = cfg.series[0].data as any[];
    expect([a.low, a.high]).toEqual([null, 2]);
    expect([b.low, b.high]).toEqual([1, null]);
  });

  it('reads numeric strings in point objects', () => {
    const cfg = parse({ series: [{ data: [{ y: '3' }, { y: 'x' }, { y: Infinity }] }] });
    expect((cfg.series[0].data as any[]).map(p => p.y)).toEqual([3, null, null]);
  });
});

describe('OptionsParser.parse above turboThreshold (bulk path)', () => {
  it('keeps numeric data fast and turns junk into gaps', () => {
    const data: any[] = Array.from({ length: 1500 }, (_, i) => i);
    data[10] = null;
    data[20] = 'abc';
    data[30] = NaN;
    const out = parse({ series: [{ data }] }).series[0].data as any[];
    expect(out).toHaveLength(1500);
    expect([out[10].y, out[20].y, out[30].y, out[40].y]).toEqual([null, null, null, 40]);
    expect(out[20].x).toBe(20);
  });

  it('does not crash on null entries mixed into [x, y] pairs', () => {
    const data: any[] = Array.from({ length: 1500 }, (_, i) => [i, i * 2]);
    data[5] = null;
    data[6] = [6, NaN];
    const out = parse({ series: [{ data }] }).series[0].data as any[];
    expect(out).toHaveLength(1500);
    expect(out[5].y).toBeNull();
    expect(out[6]).toMatchObject({ x: 6, y: null });
    expect(out[7]).toMatchObject({ x: 7, y: 14 });
  });
});

describe('OptionsParser.parse placeholder points', () => {
  const day = (d: number) => Date.UTC(2024, 0, d);

  it('drops junk entries from data laid out by explicit x, instead of placing them near x=0', () => {
    const cfg = parse({ series: [{ data: [[day(1), 1], undefined, [NaN, 2], 'x', null, [day(3), 3]] }] });
    expect((cfg.series[0].data as any[]).map(p => p.x)).toEqual([day(1), day(3)]);
  });

  it('keeps junk as index-positioned gaps when x comes from the index', () => {
    const cfg = parse({ series: [{ data: [1, undefined, 'x', null, 5] }] });
    expect((cfg.series[0].data as any[]).map(p => [p.x, p.y])).toEqual([[0, 1], [1, null], [2, null], [3, null], [4, 5]]);
  });

  it('visits holes in sparse arrays', () => {
    const data: any[] = [1, 2];
    data[4] = 5;
    const out = parse({ series: [{ data }] }).series[0].data as any[];
    expect(out).toHaveLength(5);
    expect(out.map(p => p.y)).toEqual([1, 2, null, null, 5]);
  });
});

describe('OptionsParser.parse bulk path per row', () => {
  it('keeps a [t, null] gap without changing how the other rows are read', () => {
    const data: any[] = Array.from({ length: 1500 }, (_, i) => [1000 + i, i]);
    data[3] = [1003, null];
    const out = parse({ series: [{ data }] }).series[0].data as any[];
    expect(out[3]).toMatchObject({ x: 1003, y: null });
    expect(out[4]).toMatchObject({ x: 1004, y: 4 });
    expect(out).toHaveLength(1500);
  });

  it('honours series.keys even above turboThreshold', () => {
    const data = Array.from({ length: 1500 }, (_, i) => [i * 2, i]);
    const out = parse({ series: [{ keys: ['y', 'x'], data }] }).series[0].data as any[];
    expect(out[10]).toMatchObject({ y: 20, x: 10 });
  });
});

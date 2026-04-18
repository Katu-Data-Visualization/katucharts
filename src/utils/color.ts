import { color as d3Color, rgb, hsl } from 'd3-color';

const COLOR_CACHE = new Map<string, KatuChartsColor>();
const COLOR_CACHE_MAX = 256;

export interface KatuChartsColor {
  r: number;
  g: number;
  b: number;
  a: number;
  get(prop: 'rgba'): string;
  brighten(amount: number): KatuChartsColor;
  setOpacity(opacity: number): KatuChartsColor;
  toString(): string;
}

export function parseColor(input: string | undefined | null): KatuChartsColor {
  const key = input || 'rgba(0,0,0,0)';
  const cached = COLOR_CACHE.get(key);
  if (cached) return cached;

  const fallback = 'rgba(0,0,0,0)';
  const parsed = d3Color(input || fallback);
  const c = parsed ? rgb(parsed) : rgb(fallback);

  const colorObj: KatuChartsColor = {
    r: Math.round(c.r),
    g: Math.round(c.g),
    b: Math.round(c.b),
    a: c.opacity,
    get(prop: 'rgba') {
      if (prop === 'rgba') return this.toString();
      return this.toString();
    },
    brighten(amount: number) {
      const hslC = hsl(rgb(this.r, this.g, this.b, this.a));
      hslC.l += amount * 0.1;
      hslC.l = Math.max(0, Math.min(1, hslC.l));
      const result = rgb(hslC);
      return parseColor(result.formatRgb());
    },
    setOpacity(opacity: number) {
      return parseColor(`rgba(${this.r},${this.g},${this.b},${opacity})`);
    },
    toString() {
      if (this.a < 1) {
        return `rgba(${this.r},${this.g},${this.b},${this.a})`;
      }
      return rgb(this.r, this.g, this.b).formatHex();
    },
  };

  if (COLOR_CACHE.size >= COLOR_CACHE_MAX) COLOR_CACHE.clear();
  COLOR_CACHE.set(key, colorObj);
  return colorObj;
}

export const PALETTES: Record<string, string[]> = {
  default:    ['#4e79a7','#f28e2b','#e15759','#76b7b2','#59a14f','#edc948','#b07aa1','#ff9da7','#9c755f','#bab0ac'],
  tableau10:  ['#4e79a7','#f28e2b','#e15759','#76b7b2','#59a14f','#edc948','#b07aa1','#ff9da7','#9c755f','#bab0ac'],
  d3classic:  ['#1f77b4','#ff7f0e','#2ca02c','#d62728','#9467bd','#8c564b','#e377c2','#7f7f7f','#bcbd22','#17becf'],
  brewer:     ['#66c2a5','#fc8d62','#8da0cb','#e78ac3','#a6d854','#ffd92f','#e5c494','#b3b3b3'],
  google:     ['#3366cc','#dc3912','#ff9900','#109618','#990099','#0099c6','#dd4477','#66aa00','#b82e2e','#316395'],
  ocean:      ['#003f5c','#2f4b7c','#665191','#a05195','#d45087','#f95d6a','#ff7c43','#ffa600','#58508d','#bc5090'],
  sunset:     ['#f94144','#f3722c','#f8961e','#f9844a','#f9c74f','#90be6d','#43aa8b','#4d908e','#577590','#277da1'],
  earth:      ['#8c510a','#bf812d','#dfc27d','#c7eae5','#80cdc1','#35978f','#01665e','#543005','#003c30','#f6e8c3'],
  forest:     ['#2d6a4f','#40916c','#52b788','#74c69d','#95d5b2','#1b4332','#081c15','#b7e4c7','#d8f3dc','#344e41'],
  berry:      ['#7b2cbf','#9d4edd','#c77dff','#e0aaff','#5a189a','#3c096c','#240046','#10002b','#e2afff','#deaaff'],
  corporate:  ['#2c3e50','#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#34495e','#16a085'],
  minimal:    ['#264653','#2a9d8f','#e9c46a','#f4a261','#e76f51','#606c38','#283618','#dda15e','#bc6c25','#fefae0'],
  nordic:     ['#5e81ac','#81a1c1','#88c0d0','#8fbcbb','#bf616a','#d08770','#ebcb8b','#a3be8c','#b48ead','#4c566a'],
  darkMode:   ['#2ecc71','#3498db','#e74c3c','#f1c40f','#9b59b6','#1abc9c','#e67e22','#ecf0f1','#e91e63','#00bcd4'],
  neon:       ['#ff006e','#fb5607','#ffbe0b','#8338ec','#3a86ff','#06d6a0','#118ab2','#ef476f','#ffd166','#073b4c'],
  pastel:     ['#a8e6cf','#dcedc1','#ffd3b6','#ffaaa5','#ff8b94','#b5ead7','#c7ceea','#e2f0cb','#fceaea','#d4a5a5'],
  soft:       ['#6c9bd2','#e6a756','#d46a6a','#7cc5a8','#b28fce','#e8937f','#6bb8a0','#d4b56a','#8e9cc2','#c2847a'],
  classic: ['#7cb5ec','#434348','#90ed7d','#f7a35c','#8085e9','#f15c80','#e4d354','#2b908f','#f45b5b','#91e8e1'],
};

export function getPalette(name: string): string[] {
  return PALETTES[name] || PALETTES.default;
}

export const DEFAULT_COLORS = PALETTES.default;

export const THEMES: Record<string, any> = {
  dark: {
    colors: PALETTES.darkMode,
    chart: { backgroundColor: '#2a2a2b' },
    title: { style: { color: '#e0e0e3' } },
    subtitle: { style: { color: '#a0a0a3' } },
  },
  light: {
    colors: PALETTES.default,
    chart: { backgroundColor: '#ffffff' },
  },
  nordic: {
    colors: PALETTES.nordic,
    chart: { backgroundColor: '#eceff4' },
  },
};

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
  default:    ['#2caffe','#544fc5','#00e272','#fe6a35','#6b8abc','#d568fb','#2ee0ca','#fa4b42','#feb56a','#91e8e1'],
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
  tupi:       ['#b43417','#1b1a15','#a85429','#ce9a3a','#33503a','#8c2810','#6b6a45','#d97b3f','#5b5240','#7a3b2e'],
  monochrome: ['#1f2933','#3e4c59','#52606d','#7b8794','#9aa5b1','#616e7c','#cbd2d9','#323f4b','#7b8794','#b8c0c9'],
};

export function getPalette(name: string): string[] {
  return PALETTES[name] || PALETTES.default;
}

export const DEFAULT_COLORS = PALETTES.default;

/**
 * Color surfaces shared by every theme of a given mode (background tint and
 * series colors aside): axis lines/grid/ticks, label and title text, tooltip
 * and legend. A theme is just one of these surfaces plus its own palette and
 * background, so the whole registry stays consistent across families.
 */
interface ThemeSurface {
  textStrong: string;
  textSoft: string;
  axis: string;
  line: string;
  grid: string;
  tooltipBg: string;
  tooltipBorder: string;
  legend: string;
}

const LIGHT_SURFACE: ThemeSurface = {
  textStrong: '#1f2933',
  textSoft: '#52606d',
  axis: '#6b7280',
  line: '#c8ccd2',
  grid: '#e6e8eb',
  tooltipBg: 'rgba(255,255,255,0.96)',
  tooltipBorder: '#d8dce0',
  legend: '#52606d',
};

const DARK_SURFACE: ThemeSurface = {
  textStrong: '#f3f4f6',
  textSoft: '#b8bfc7',
  axis: '#9aa3ad',
  line: '#3a414a',
  grid: 'rgba(255,255,255,0.08)',
  tooltipBg: '#20262e',
  tooltipBorder: '#39414b',
  legend: '#c2c9d1',
};

function makeTheme(colors: string[], backgroundColor: string, s: ThemeSurface): any {
  const axisStyle = {
    gridLineColor: s.grid,
    lineColor: s.line,
    tickColor: s.line,
    labels: { style: { color: s.axis } },
    title: { style: { color: s.axis } },
  };
  return {
    colors,
    chart: { backgroundColor },
    title: { style: { color: s.textStrong } },
    subtitle: { style: { color: s.textSoft } },
    xAxis: axisStyle,
    yAxis: axisStyle,
    tooltip: {
      backgroundColor: s.tooltipBg,
      borderColor: s.tooltipBorder,
      style: { color: s.textStrong },
    },
    legend: {
      itemStyle: { color: s.legend },
      itemHoverStyle: { color: s.textStrong },
    },
  };
}

/**
 * Series palettes for each predefined theme family. The light and dark variants
 * carry their own colors so series stay legible against either background.
 */
const THEME_COLORS: Record<string, { light: string[]; dark: string[] }> = {
  tupi: {
    light: ['#b43417','#1b1a15','#a85429','#ce9a3a','#33503a','#8c2810','#6b6a45','#d97b3f','#5b5240','#7a3b2e'],
    dark:  ['#e0673f','#e7dbc0','#d08a4e','#e8c45f','#6fa37a','#c84c2c','#c9b27a','#f0a06a','#a9a07e','#d98b6a'],
  },
  ocean: {
    light: ['#0466c8','#0353a4','#3a86ff','#00b4d8','#0096c7','#48cae4','#023e8a','#5e60ce','#0077b6','#90e0ef'],
    dark:  ['#48cae4','#4895ef','#56cfe1','#64dfdf','#80ffdb','#5390d9','#7400b8','#4cc9f0','#56cfe1','#72efdd'],
  },
  sunset: {
    light: ['#ff6b35','#f7522f','#ff9e00','#ffbf69','#e85d75','#d1495b','#ffd166','#9e2a2b','#f3722c','#bc4749'],
    dark:  ['#ff7b54','#ffb26b','#ffd56b','#ff9e7d','#ff6b6b','#feca57','#ff9ff3','#f368e0','#ffa07a','#ffd56b'],
  },
  forest: {
    light: ['#2d6a4f','#40916c','#52b788','#74c69d','#1b4332','#95d5b2','#b7e4c7','#344e41','#588157','#a3b18a'],
    dark:  ['#74c69d','#52b788','#95d5b2','#40916c','#b7e4c7','#2d6a4f','#d8f3dc','#588157','#a3b18a','#80ed99'],
  },
  corporate: {
    light: ['#2c3e50','#3498db','#16a085','#f39c12','#8e44ad','#e74c3c','#34495e','#27ae60','#2980b9','#d35400'],
    dark:  ['#5dade2','#48c9b0','#f5b041','#bb8fce','#ec7063','#58d68d','#85c1e9','#76d7c4','#f8c471','#aed6f1'],
  },
  vivid: {
    light: ['#ff006e','#fb5607','#ffbe0b','#8338ec','#3a86ff','#06d6a0','#ef476f','#118ab2','#ff70a6','#9b5de5'],
    dark:  ['#ff5d8f','#ff7b00','#ffd60a','#9d4edd','#4cc9f0','#06d6a0','#ff70a6','#48cae4','#fb5607','#b5179e'],
  },
  monochrome: {
    light: ['#1f2933','#3e4c59','#52606d','#7b8794','#9aa5b1','#616e7c','#cbd2d9','#323f4b','#46545f','#a7b0b8'],
    dark:  ['#e4e7eb','#cbd2d9','#9aa5b1','#7b8794','#616e7c','#b8c0c9','#52606d','#d3d9de','#8a949e','#3e4c59'],
  },
  nordic: {
    light: ['#5e81ac','#81a1c1','#88c0d0','#8fbcbb','#bf616a','#d08770','#ebcb8b','#a3be8c','#b48ead','#4c566a'],
    dark:  ['#88c0d0','#81a1c1','#8fbcbb','#a3be8c','#ebcb8b','#d08770','#bf616a','#b48ead','#5e81ac','#d8dee9'],
  },
  pastel: {
    light: ['#a8e6cf','#ffd3b6','#ffaaa5','#c7ceea','#b5ead7','#ff8b94','#dcedc1','#e2afff','#ffdac1','#b5c7ed'],
    dark:  ['#a8e6cf','#ffd3b6','#ffaaa5','#c7ceea','#b5ead7','#ff8b94','#dcedc1','#e2afff','#ffdac1','#b5c7ed'],
  },
};

/** Per-family background tints (light / dark). */
const THEME_BG: Record<string, { light: string; dark: string }> = {
  tupi:       { light: '#ecdfc4', dark: '#1c1814' },
  ocean:      { light: '#ffffff', dark: '#0b1622' },
  sunset:     { light: '#ffffff', dark: '#1f1410' },
  forest:     { light: '#ffffff', dark: '#0f1f17' },
  corporate:  { light: '#ffffff', dark: '#1a1f26' },
  vivid:      { light: '#ffffff', dark: '#14101c' },
  monochrome: { light: '#ffffff', dark: '#1a1f24' },
  nordic:     { light: '#eceff4', dark: '#2e3440' },
  pastel:     { light: '#ffffff', dark: '#232026' },
};

/**
 * Predefined themes — one light and one dark variant per family. The light
 * variant uses the bare family name; the dark variant adds a `-dark` suffix.
 * Each entry is a full options fragment that overrides every color surface, so
 * passing it overwrites the chart's whole color identity.
 */
export const THEMES: Record<string, any> = (() => {
  const out: Record<string, any> = {};
  for (const family of Object.keys(THEME_COLORS)) {
    out[family] = makeTheme(THEME_COLORS[family].light, THEME_BG[family].light, LIGHT_SURFACE);
    out[`${family}-dark`] = makeTheme(THEME_COLORS[family].dark, THEME_BG[family].dark, DARK_SURFACE);
  }
  out.light = out.monochrome;
  out.dark = out['monochrome-dark'];
  return out;
})();

export const THEME_NAMES: string[] = Object.keys(THEMES);

export function getTheme(name: string): any {
  return THEMES[name];
}

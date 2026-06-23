import { color as d3Color } from 'd3-color';

export const DEFAULT_CHART_TEXT_SIZE = '12px';
export const DEFAULT_CHART_TEXT_COLOR = '#000000';

const AUTO_DARK_TEXT_COLOR = '#1a1a1a';
const AUTO_LIGHT_TEXT_COLOR = '#ffffff';

/**
 * WCAG 2 contrast ratio for large / bold text and graphical objects. Chart data
 * labels are bold, so dark ink is kept until it drops below this, and only then
 * swapped for white — this avoids needless light-on-mid-tone flips (e.g. dark
 * text stays on terracotta/ochre, while near-black and deep-red fills go white).
 */
const MIN_LABEL_CONTRAST = 3;

function linearizeChannel(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * linearizeChannel(r) + 0.7152 * linearizeChannel(g) + 0.0722 * linearizeChannel(b);
}

function contrastRatio(lumA: number, lumB: number): number {
  return (Math.max(lumA, lumB) + 0.05) / (Math.min(lumA, lumB) + 0.05);
}

const AUTO_DARK_LUMINANCE = relativeLuminance(26, 26, 26);

/**
 * Picks a readable label color for text drawn on top of the given background
 * fill. Dark ink is preferred and kept whenever its contrast against the fill
 * meets the WCAG large-text threshold; only backgrounds dark enough to make
 * dark text illegible (deep reds, near-blacks) are switched to white. An
 * explicit `override` always wins, so caller-configured colors are never
 * second-guessed, and unparseable fills (gradients, urls, transparent) fall
 * back to the standard dark text color.
 */
export function readableTextColor(background: string | undefined, override?: string): string {
  if (override) return override;
  const c = background ? d3Color(background)?.rgb() : null;
  if (!c || isNaN(c.r) || c.opacity === 0) return DEFAULT_CHART_TEXT_COLOR;
  const bgLuminance = relativeLuminance(c.r, c.g, c.b);
  const darkContrast = contrastRatio(bgLuminance, AUTO_DARK_LUMINANCE);
  if (darkContrast >= MIN_LABEL_CONTRAST) return AUTO_DARK_TEXT_COLOR;
  const lightContrast = contrastRatio(bgLuminance, 1);
  return lightContrast >= darkContrast ? AUTO_LIGHT_TEXT_COLOR : AUTO_DARK_TEXT_COLOR;
}

function getRootFontSize(): number {
  if (typeof document === 'undefined') return 16;
  const size = parseFloat(getComputedStyle(document.documentElement).fontSize);
  return size > 0 ? size : 16;
}

export function parseFontSizePx(fontSize: string | undefined): number {
  if (!fontSize) return 12;
  const fs = fontSize.trim();
  /**
   * CSS math functions (clamp/min/max) can't be parsed by parseFloat. Resolve them to the
   * largest length token they contain so layout reserves enough vertical/horizontal space —
   * under-reserving here makes titles and labels overlap the plot, while over-reserving only
   * adds a little harmless padding.
   */
  if (/^(clamp|min|max)\s*\(/i.test(fs)) {
    const inner = fs.slice(fs.indexOf('(') + 1, fs.lastIndexOf(')'));
    const tokens = inner.match(/-?\d*\.?\d+\s*(px|rem|em)/gi) || [];
    let maxPx = 0;
    for (const tok of tokens) {
      const px = parseFontSizePx(tok.trim());
      if (px > maxPx) maxPx = px;
    }
    return maxPx > 0 ? maxPx : 12;
  }
  if (fs.endsWith('px')) return parseFloat(fs) || 12;
  if (fs.endsWith('rem')) return (parseFloat(fs) || 1) * getRootFontSize();
  if (fs.endsWith('em')) return (parseFloat(fs) || 1) * getRootFontSize();
  const n = parseFloat(fs);
  return isNaN(n) ? 12 : n;
}

let _measureCtx: CanvasRenderingContext2D | null = null;
function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (_measureCtx) return _measureCtx;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  _measureCtx = canvas.getContext('2d');
  return _measureCtx;
}

/**
 * Measure the rendered width of a text string using canvas 2d measureText.
 * Falls back to `length * fontPx * 0.62` when running in a non-DOM env.
 */
export function measureTextWidth(text: string, fontPx: number, fontWeight: string = 'normal', fontFamily: string = 'sans-serif'): number {
  const ctx = getMeasureCtx();
  if (!ctx) return text.length * fontPx * 0.62;
  ctx.font = `${fontWeight} ${fontPx}px ${fontFamily}`;
  return ctx.measureText(text).width;
}

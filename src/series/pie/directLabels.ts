/**
 * Label helpers shared by the pie/donut renderer and the funnel/pyramid one.
 *
 * Only the pieces both renderers genuinely need live here. The radial machinery
 * — vertical distribution, the polar re-projection, the arc-centroid declutter —
 * stays in `PieChart`, because a funnel's evenly-spaced rows have nothing to
 * declutter and its connector is a horizontal run rather than an elbow off a
 * mid-angle. The only geometry the two share is turning a point list into a path
 * string, which is `connectorPath` below.
 */

import type { DataLabelOptions } from '../../types/options';
import { templateFormat, stripHtmlTags, sanitizeColor } from '../../utils/format';
import { DEFAULT_CHART_TEXT_SIZE, parseFontSizePx, measureTextWidth } from '../../utils/chartText';

/**
 * The enabled data-label configs in array form. The API lets a point carry
 * several label sets (e.g. the name outside the slice plus the percentage
 * inside it), passed as an array; this normalises the single-object and array
 * forms to one list so the renderers can treat them uniformly.
 */
export function normalizeDataLabelConfigs(
  dl: DataLabelOptions | DataLabelOptions[] | undefined
): DataLabelOptions[] {
  if (!dl) return [];
  const arr = Array.isArray(dl) ? dl : [dl];
  return arr.filter(d => d && d.enabled !== false);
}

export interface LabelFontMetrics {
  fontSize: string;
  fontPx: number;
  fontWeight: string;
  fontFamily?: string;
  /** Baseline-to-baseline step used when a label wraps onto several lines. */
  lineHeight: number;
  /** Vertical box a single-line label occupies, used when reserving space. */
  labelHeight: number;
}

/**
 * Resolves the font a label will actually be painted with — including the bold
 * default applied at render time. Every measurement goes through this, so the
 * measured width can no longer disagree with the glyphs on screen: measuring a
 * bold label as regular under-reports by a few percent, which is enough to make
 * the wrapped-line estimate off by one and let stacked labels touch.
 */
export function labelFontMetrics(dlCfg: DataLabelOptions): LabelFontMetrics {
  const fontSize = (dlCfg.style?.fontSize as string) || DEFAULT_CHART_TEXT_SIZE;
  const fontPx = parseFontSizePx(fontSize);
  const fontWeight = String(dlCfg.style?.fontWeight ?? 'bold');
  const fontFamily = dlCfg.style?.fontFamily as string | undefined;
  return {
    fontSize,
    fontPx,
    fontWeight,
    fontFamily,
    lineHeight: fontPx * 1.15,
    labelHeight: fontPx * 1.4,
  };
}

/** Rendered width of `text` in the font `m` describes. */
export function measureLabel(text: string, m: LabelFontMetrics): number {
  return measureTextWidth(text, m.fontPx, m.fontWeight, m.fontFamily);
}

/**
 * Resolves a point's label to its rendered text (formatter/format/fallback,
 * HTML stripped) plus any inline `color:` declared in the markup. Shared by the
 * sizing pre-pass and the renderer so the measured width can't drift from what
 * is actually drawn.
 */
export function resolveLabelText(
  dlCfg: DataLabelOptions,
  point: any,
  seriesName: string | undefined,
  accentColor: string
): { text: string; inlineColor?: string } {
  const pointCtx = { ...point, color: accentColor };
  let text: string;
  if (dlCfg.formatter) {
    text = dlCfg.formatter.call({
      point: pointCtx, series: { name: seriesName },
      x: point.x, y: point.y, percentage: point.percentage,
    });
  } else if (dlCfg.format) {
    text = templateFormat(dlCfg.format, {
      point: pointCtx, series: { name: seriesName },
    });
  } else {
    text = point.name || String(point.y);
  }
  let inlineColor: string | undefined;
  const colorMatch = /(?:^|[\s;"'])color\s*:\s*([^;"'>]+)/i.exec(text);
  if (colorMatch) inlineColor = sanitizeColor(colorMatch[1], accentColor);
  return { text: stripHtmlTags(text), inlineColor };
}

/** Estimated wrapped line count for a label, from its width vs available space. */
export function estimateLabelLines(
  text: string, maxWidth: number, m: LabelFontMetrics, maxLines = 3
): number {
  if (!(maxWidth > m.fontPx)) return 1;
  const w = measureLabel(text, m);
  if (w <= maxWidth) return 1;
  return Math.min(maxLines, Math.ceil(w / maxWidth));
}

/**
 * Renders a label on one line, or word-wraps it onto several when it exceeds the
 * horizontal space available — so long category names break instead of being
 * ellipsis-truncated. Lines are vertically centred on the anchor; an over-long
 * run is capped at `maxLines` and the last is ellipsized.
 */
export function wrapLabelLines(
  textEl: any, text: string, maxWidth: number, m: LabelFontMetrics, x: number, maxLines = 3
): void {
  if (!(maxWidth > m.fontPx) || measureLabel(text, m) <= maxWidth) {
    textEl.text(text);
    return;
  }
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const trial = cur ? `${cur} ${w}` : w;
    if (cur && measureLabel(trial, m) > maxWidth) { lines.push(cur); cur = w; }
    else cur = trial;
  }
  if (cur) lines.push(cur);

  if (lines.length > maxLines) {
    let last = lines.slice(maxLines - 1).join(' ');
    while (last.length > 1 && measureLabel(`${last}…`, m) > maxWidth) last = last.slice(0, -1);
    lines.length = maxLines - 1;
    lines.push(`${last.trimEnd()}…`);
  }

  textEl.text(null);
  const startDy = -((lines.length - 1) / 2) * m.lineHeight;
  lines.forEach((ln, i) => {
    textEl.append('tspan').attr('x', x).attr('dy', i === 0 ? startDy : m.lineHeight).text(ln);
  });
}

/**
 * Path `d` for a leader line through `points`. A three-point run can be softened
 * into a quadratic curve through its middle vertex (`softConnector`), which
 * rounds off the elbow; every other run is drawn as straight segments.
 */
export function connectorPath(points: [number, number][], soft = false): string {
  if (points.length < 2) return '';
  if (soft && points.length === 3) {
    const [a, k, b] = points;
    return `M${a[0]},${a[1]}Q${k[0]},${k[1]} ${b[0]},${b[1]}`;
  }
  return 'M' + points.map(p => `${p[0]},${p[1]}`).join('L');
}

/** Applies the shared font-weight / family / outline styling to a label node. */
export function applyLabelStyle(textEl: any, dlCfg: DataLabelOptions, m: LabelFontMetrics): void {
  textEl.attr('font-weight', m.fontWeight);
  if (m.fontFamily) textEl.attr('font-family', m.fontFamily);
  const outline = dlCfg.style?.textOutline;
  if (outline) textEl.style('text-shadow', outline as string);
}

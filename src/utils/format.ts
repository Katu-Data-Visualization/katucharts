import { timeFormat as d3TimeFormat, utcFormat as d3UtcFormat } from 'd3-time-format';
import { format as d3Format } from 'd3-format';

/**
 * Whether dates are interpreted/formatted in UTC. Defaults to true to match
 * the `time.useUTC` option. Set per-chart via `setUseUTC`.
 */
let useUTC = true;

export function setUseUTC(value: boolean): void {
  useUTC = value;
}

export function getUseUTC(): boolean {
  return useUTC;
}

/**
 * Map of format specifiers for date formatting translation to D3 format strings.
 */
const HC_TO_D3_MAP: Record<string, string> = {
  '%A': '%A', '%a': '%a', '%d': '%d', '%e': '%-d',
  '%b': '%b', '%B': '%B', '%m': '%m', '%y': '%y', '%Y': '%Y',
  '%H': '%H', '%I': '%I', '%k': '%-H', '%l': '%-I',
  '%M': '%M', '%p': '%p', '%P': '%p', '%S': '%S', '%L': '%L',
};

const HC_REGEX_ENTRIES: [RegExp, string][] = Object.entries(HC_TO_D3_MAP).map(
  ([hc, d3]) => [new RegExp(hc.replace('%', '\\%'), 'g'), d3]
);

const dateFormatCache = new Map<string, string>();

export function dateFormat(formatStr: string, timestamp: number): string {
  let d3Fmt = dateFormatCache.get(formatStr);
  if (!d3Fmt) {
    d3Fmt = formatStr;
    for (const [regex, replacement] of HC_REGEX_ENTRIES) {
      d3Fmt = d3Fmt.replace(regex, replacement);
    }
    dateFormatCache.set(formatStr, d3Fmt);
  }

  const formatter = useUTC ? d3UtcFormat(d3Fmt) : d3TimeFormat(d3Fmt);
  return formatter(new Date(timestamp));
}

export function numberFormat(
  value: number,
  decimals: number = -1,
  decPoint: string = '.',
  thousandsSep: string = ','
): string {
  if (!Number.isFinite(value)) return '0';

  if (decimals === -1) {
    const str = value.toString();
    const decIndex = str.indexOf('.');
    decimals = decIndex === -1 ? 0 : str.length - decIndex - 1;
  }

  const fixed = value.toFixed(decimals);
  const [intPart, decPart] = fixed.split('.');

  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSep);

  return decPart ? `${withThousands}${decPoint}${decPart}` : withThousands;
}

const SI_SUFFIXES: [number, string][] = [
  [1e12, 'T'],
  [1e9, 'G'],
  [1e6, 'M'],
  [1e3, 'k'],
];

/**
 * Formats a numeric value with SI suffixes (k, M, G, T) when the absolute
 * value is >= 1,000, for standard axis label formatting.
 * Values below 1,000 are shown as-is.
 */
export function siFormat(value: number): string {
  const abs = Math.abs(value);
  if (abs < 1e3) {
    if (abs === Math.floor(abs)) {
      return numberFormat(value, 0, '.', ',');
    }
    return value.toPrecision(4).replace(/\.?0+$/, '');
  }
  for (const [threshold, suffix] of SI_SUFFIXES) {
    if (abs >= threshold) {
      const scaled = value / threshold;
      const str = scaled === Math.floor(scaled)
        ? String(scaled)
        : scaled.toPrecision(4).replace(/\.?0+$/, '');
      return str + suffix;
    }
  }
  return String(value);
}

const TEMPLATE_RE = /\{([^}]+)\}/g;

/**
 * Substitutes `{path}` / `{path:format}` placeholders in a template string with
 * values resolved from `context`. When `escapeValues` is true the substituted
 * data values are HTML-escaped while the surrounding template markup is left
 * intact — use this whenever the result is injected as `innerHTML` so that
 * user-supplied data (series/point names, categories) cannot inject markup.
 */
export function templateFormat(
  template: string,
  context: Record<string, any>,
  escapeValues = false
): string {
  return template.replace(TEMPLATE_RE, (_, key: string) => {
    const formatSep = key.indexOf(':');
    let path = key;
    let fmt: string | null = null;
    if (formatSep !== -1) {
      path = key.slice(0, formatSep);
      fmt = key.slice(formatSep + 1);
    }
    const keys = path.trim().split('.');
    let val: any = context;
    for (const k of keys) {
      if (val === undefined || val === null) return '';
      val = val[k];
    }
    if (val === undefined || val === null) return '';
    let out: string;
    if (fmt) {
      const numVal = typeof val === 'number' ? val : parseFloat(String(val));
      if (!isNaN(numVal)) {
        try {
          out = d3Format(fmt)(numVal);
        } catch {
          out = String(val);
        }
      } else {
        out = String(val);
      }
    } else {
      out = String(val);
    }
    return escapeValues ? escapeHtml(out) : out;
  });
}

const HTML_ESCAPE_RE = /[&<>"']/g;
const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
};

/**
 * Escapes HTML-significant characters so untrusted data can be safely placed in
 * an `innerHTML` string.
 */
export function escapeHtml(value: unknown): string {
  return String(value).replace(HTML_ESCAPE_RE, ch => HTML_ESCAPE_MAP[ch]);
}

const CSV_FORMULA_LEAD_RE = /^[=+\-@\t\r]/;
const CSV_PLAIN_NUMBER_RE = /^-?\d+(?:[.,]\d+)?$/;

/**
 * Prepares a value for a CSV field. Cells whose text begins with a spreadsheet
 * formula trigger (=, +, -, @, tab, CR) are prefixed with a single quote so
 * Excel/Sheets treat them as text instead of executing them — plain numeric
 * literals are exempt so negative numbers survive. The field is then quoted per
 * RFC 4180 when it contains the delimiter, a double quote, or a line break.
 */
export function escapeCsvCell(value: unknown, delimiter = ','): string {
  let str = value === undefined || value === null ? '' : String(value);
  if (CSV_FORMULA_LEAD_RE.test(str) && !CSV_PLAIN_NUMBER_RE.test(str)) {
    str = "'" + str;
  }
  if (str.includes(delimiter) || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    str = '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

const SAFE_COLOR_RE = /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla)\([\d.,%\s/]+\)|[a-z]+)$/i;

/**
 * Returns `color` when it matches a safe CSS color token (hex, rgb/rgba,
 * hsl/hsla, or a bare keyword), otherwise `fallback`. Prevents attribute
 * injection when a user-supplied color is interpolated into an inline style.
 */
export function sanitizeColor(color: unknown, fallback = '#333'): string {
  const str = String(color).trim();
  return SAFE_COLOR_RE.test(str) ? str : fallback;
}

const HTML_TAG_RE = /<\/?[^>]+(>|$)/g;
const BR_TAG_RE = /<br\s*\/?>/gi;

/**
 * Strips HTML tags from a string, suitable for rendering text in SVG context
 * where innerHTML is not available. <br/> tags are replaced with spaces.
 */
export function stripHtmlTags(text: string): string {
  return text.replace(BR_TAG_RE, ' ').replace(HTML_TAG_RE, '').trim();
}

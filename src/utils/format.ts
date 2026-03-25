import { timeFormat as d3TimeFormat } from 'd3-time-format';
import { format as d3Format } from 'd3-format';

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

  return d3TimeFormat(d3Fmt)(new Date(timestamp));
}

export function numberFormat(
  value: number,
  decimals: number = -1,
  decPoint: string = '.',
  thousandsSep: string = ','
): string {
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

const TEMPLATE_RE = /\{([^}]+)\}/g;

export function templateFormat(template: string, context: Record<string, any>): string {
  return template.replace(TEMPLATE_RE, (_, key: string) => {
    const formatSep = key.indexOf(':');
    let path = key;
    let fmt: string | null = null;
    if (formatSep !== -1) {
      path = key.slice(0, formatSep);
      fmt = key.slice(formatSep + 1);
    }
    const keys = path.split('.');
    let val: any = context;
    for (const k of keys) {
      val = val?.[k];
    }
    if (val === undefined || val === null) return '';
    if (fmt && typeof val === 'number') {
      try {
        return d3Format(fmt)(val);
      } catch {
        return String(val);
      }
    }
    return String(val);
  });
}

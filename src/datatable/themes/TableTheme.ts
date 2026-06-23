/**
 * Theme resolution for the DataTable.
 *
 * Visuals live in the injected stylesheet (see styleSheet.ts). This class only
 * translates `DataTableStyleOptions` into the two override channels CSS reads:
 *  - `cssVariables()` — `--kdt-*` custom properties set on the root element.
 *  - `rootDataset()`  — `data-*` flags (theme, density, borders, striping).
 * Explicit per-part style objects the user supplies (headerCellStyle,
 * cellStyle, rowStyle, …) are surfaced verbatim so renderers can apply them
 * inline as the highest-priority override.
 */

import type {
  CSSObject, DataTableStyleOptions, DensityMode, LayoutStyle,
  InternalColumnDef, RowStyleContext,
} from '../../types/datatable-options';
import { DENSITY_ROW_HEIGHTS, DENSITY_HEADER_HEIGHTS } from '../DataTableDefaults';

interface LayoutPreset {
  dataset?: Record<string, string>;
  vars?: Record<string, string>;
}

const LAYOUT_PRESETS: Record<LayoutStyle, LayoutPreset> = {
  default: {},
  bordered: { dataset: { 'data-borders': 'both' } },
  minimal: { dataset: { 'data-borders': 'none' }, vars: { '--kdt-header-bg': 'transparent' } },
  'striped-dark': { dataset: { 'data-theme': 'dark', 'data-striped': 'true' } },
};

export class TableTheme {
  private style: DataTableStyleOptions;
  private layout: LayoutStyle;

  constructor(style: DataTableStyleOptions = {}) {
    this.style = { ...style };
    this.layout = style.layout ?? 'default';
  }

  get density(): DensityMode {
    return this.style.density ?? 'normal';
  }

  get rowHeight(): number {
    return this.style.rowHeight ?? DENSITY_ROW_HEIGHTS[this.density];
  }

  get headerHeight(): number {
    return this.style.headerHeight ?? DENSITY_HEADER_HEIGHTS[this.density];
  }

  getLayout(): LayoutStyle {
    return this.layout;
  }

  /**
   * CSS custom properties applied to the root element, derived from style
   * options. Anything left unset falls back to the stylesheet defaults.
   */
  cssVariables(width?: number | string, height?: number | string): Record<string, string> {
    const s = this.style;
    const vars: Record<string, string> = {};
    const set = (name: string, value: string | number | undefined | false) => {
      if (value != null && value !== false && value !== '') vars[name] = String(value);
    };

    set('--kdt-font-family', s.fontFamily);
    set('--kdt-font-size', s.fontSize);
    set('--kdt-header-font-size', s.headerFontSize);
    set('--kdt-header-font-weight', s.headerFontWeight);
    if (s.borderColor) { set('--kdt-border', s.borderColor); set('--kdt-input', s.borderColor); }
    set('--kdt-bg', s.background);
    set('--kdt-fg', s.foreground);
    set('--kdt-muted', s.mutedColor);
    set('--kdt-muted-fg', s.mutedForeground);
    set('--kdt-accent', s.accentColor);
    set('--kdt-primary', s.primaryColor);
    set('--kdt-radius', typeof s.radius === 'number' ? `${s.radius}px` : s.radius);
    if (s.stripedRows && s.alternateRowColor) set('--kdt-stripe-bg', s.alternateRowColor as string);
    if (s.hoverRowColor) set('--kdt-hover-bg', s.hoverRowColor as string);
    if (s.selectedRowColor) set('--kdt-selected-bg', s.selectedRowColor as string);
    if (s.rowHeight) set('--kdt-row-height', `${s.rowHeight}px`);
    if (s.headerHeight) set('--kdt-header-height', `${s.headerHeight}px`);

    const preset = LAYOUT_PRESETS[this.layout]?.vars;
    if (preset) Object.assign(vars, preset);
    if (s.cssVars) Object.assign(vars, s.cssVars);

    if (typeof width === 'number') vars['width'] = `${width}px`;
    else if (typeof width === 'string') vars['width'] = width;
    if (typeof height === 'number') vars['height'] = `${height}px`;
    else if (typeof height === 'string') vars['height'] = height;

    return vars;
  }

  /** `data-*` flags applied to the root element. */
  rootDataset(): Record<string, string> {
    const ds: Record<string, string> = { 'data-density': this.density };

    const borders = this.style.showBorders;
    if (borders === false || borders === 'none' as any) ds['data-borders'] = 'none';
    else if (borders === 'vertical') ds['data-borders'] = 'vertical';
    else if (borders === 'both') ds['data-borders'] = 'both';
    else ds['data-borders'] = 'horizontal';

    if (this.style.stripedRows) ds['data-striped'] = 'true';
    if (this.style.theme) ds['data-theme'] = this.style.theme;

    const preset = LAYOUT_PRESETS[this.layout]?.dataset;
    if (preset) Object.assign(ds, preset);

    return ds;
  }

  get userContainerStyle(): CSSObject | undefined { return this.style.containerStyle; }
  get userTableStyle(): CSSObject | undefined { return this.style.tableStyle; }
  get userHeaderRowStyle(): CSSObject | undefined { return this.style.headerStyle; }
  get userHeaderCellStyle(): CSSObject | undefined { return this.style.headerCellStyle; }
  get userBodyStyle(): CSSObject | undefined { return this.style.bodyStyle; }
  get userCellStyle(): CSSObject | undefined { return this.style.cellStyle; }

  rowStyle(ctx: RowStyleContext): CSSObject | undefined {
    const rs = this.style.rowStyle;
    if (!rs) return undefined;
    return typeof rs === 'function' ? rs.call(ctx) : rs;
  }

  update(style: DataTableStyleOptions): void {
    if (style.layout) this.layout = style.layout;
    Object.assign(this.style, style);
  }
}

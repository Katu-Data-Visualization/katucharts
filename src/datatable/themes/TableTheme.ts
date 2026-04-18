/**
 * Default theme and style computation for DataTable.
 */

import type { CSSObject, DataTableStyleOptions, DensityMode, LayoutStyle, InternalColumnDef } from '../../types/datatable-options';
import { DENSITY_ROW_HEIGHTS, DENSITY_HEADER_HEIGHTS, DENSITY_CELL_PADDING } from '../DataTableDefaults';

const LAYOUT_PRESETS: Record<LayoutStyle, Partial<DataTableStyleOptions>> = {
  default: {},
  bordered: {
    borderColor: '#cbd5e1',
    showBorders: 'both',
    stripedRows: false,
    alternateRowColor: false,
    headerFontWeight: '700',
  },
  minimal: {
    borderColor: 'transparent',
    showBorders: false,
    stripedRows: false,
    alternateRowColor: false,
    hoverRowColor: '#f1f5f9',
    headerFontWeight: '500',
  },
  'striped-dark': {
    borderColor: '#374151',
    alternateRowColor: '#1e293b',
    hoverRowColor: '#334155',
    selectedRowColor: '#1e40af',
    stripedRows: true,
    showBorders: 'horizontal',
    headerFontWeight: '600',
  },
};

export class TableTheme {
  private style: Required<Pick<DataTableStyleOptions,
    'borderColor' | 'fontSize' | 'fontFamily' | 'headerFontSize' | 'headerFontWeight' | 'density'
  >> & DataTableStyleOptions;
  private layout: LayoutStyle;

  constructor(style: DataTableStyleOptions = {}) {
    this.layout = style.layout ?? 'default';
    const preset = LAYOUT_PRESETS[this.layout] ?? {};
    this.style = {
      borderColor: '#e0e0e0',
      fontSize: '13px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      headerFontSize: '13px',
      headerFontWeight: '600',
      density: 'normal',
      ...preset,
      ...style,
    };
  }

  get density(): DensityMode {
    return this.style.density;
  }

  get rowHeight(): number {
    return this.style.rowHeight ?? DENSITY_ROW_HEIGHTS[this.density];
  }

  get headerHeight(): number {
    return this.style.headerHeight ?? DENSITY_HEADER_HEIGHTS[this.density];
  }

  get cellPadding(): string {
    return DENSITY_CELL_PADDING[this.density];
  }

  containerStyles(width?: number | string, height?: number | string): CSSObject {
    const isDark = this.layout === 'striped-dark';
    const isBordered = this.layout === 'bordered';
    return {
      position: 'relative',
      width: typeof width === 'number' ? `${width}px` : width ?? '100%',
      fontFamily: this.style.fontFamily,
      fontSize: this.style.fontSize,
      color: isDark ? '#e2e8f0' : '#1f2937',
      backgroundColor: isDark ? '#0f172a' : '#fff',
      boxSizing: 'border-box',
      overflow: 'hidden',
      border: isBordered ? `1px solid ${this.style.borderColor}` : 'none',
      borderRadius: isBordered ? '6px' : '0',
      ...(this.style.containerStyle || {}),
    };
  }

  tableStyles(): CSSObject {
    return {
      width: '100%',
      borderCollapse: 'collapse',
      tableLayout: 'fixed',
      ...(this.style.tableStyle || {}),
    };
  }

  headerRowStyles(): CSSObject {
    const isDark = this.layout === 'striped-dark';
    const isBordered = this.layout === 'bordered';
    const isMinimal = this.layout === 'minimal';
    return {
      backgroundColor: isDark ? '#1e293b' : isBordered ? '#f1f5f9' : isMinimal ? 'transparent' : '#f8fafc',
      borderBottom: isMinimal ? '1px solid #e2e8f0' : `2px solid ${this.style.borderColor}`,
      ...(this.style.headerStyle || {}),
    };
  }

  headerCellStyles(col?: InternalColumnDef): CSSObject {
    const isDark = this.layout === 'striped-dark';
    const isBordered = this.layout === 'bordered';
    const base: CSSObject = {
      padding: this.cellPadding,
      fontWeight: this.style.headerFontWeight,
      fontSize: this.style.headerFontSize,
      textAlign: col?.headerAlign ?? col?.align ?? 'left',
      userSelect: 'none',
      position: 'relative',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      borderBottom: `2px solid ${this.style.borderColor}`,
      height: `${this.headerHeight}px`,
      boxSizing: 'border-box',
      color: isDark ? '#94a3b8' : undefined,
      textTransform: isDark ? 'uppercase' : undefined,
      letterSpacing: isDark ? '0.05em' : undefined,
      ...(this.style.headerCellStyle || {}),
    };
    if (isBordered) {
      base.borderRight = `1px solid ${this.style.borderColor}`;
    }
    if (col?.headerStyle) Object.assign(base, col.headerStyle);
    return base;
  }

  bodyStyles(height?: number | string): CSSObject {
    const styles: CSSObject = {
      overflow: 'auto',
      position: 'relative',
      ...(this.style.bodyStyle || {}),
    };
    if (height) {
      styles.maxHeight = typeof height === 'number' ? `${height}px` : height;
    }
    return styles;
  }

  rowStyles(rowIndex: number, selected: boolean): CSSObject {
    const isDark = this.layout === 'striped-dark';
    const base: CSSObject = {
      height: `${this.rowHeight}px`,
      transition: 'background-color 0.15s ease',
      cursor: 'default',
      color: isDark ? '#cbd5e1' : undefined,
    };

    if (selected && this.style.selectedRowColor !== false) {
      base.backgroundColor = this.style.selectedRowColor ?? (isDark ? '#1e40af' : '#d2e3fc');
    } else if (isDark) {
      base.backgroundColor = rowIndex % 2 === 1 ? '#1e293b' : '#0f172a';
    } else if (this.style.stripedRows && rowIndex % 2 === 1 && this.style.alternateRowColor !== false) {
      base.backgroundColor = this.style.alternateRowColor ?? '#f9fafb';
    }

    const borders = this.style.showBorders;
    if (borders === true || borders === 'horizontal' || borders === 'both') {
      base.borderBottom = `1px solid ${this.style.borderColor}`;
    }

    return base;
  }

  cellStyles(col?: InternalColumnDef): CSSObject {
    const base: CSSObject = {
      padding: this.cellPadding,
      textAlign: col?.align ?? 'left',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      boxSizing: 'border-box',
      ...(this.style.cellStyle || {}),
    };

    const borders = this.style.showBorders;
    if (borders === 'vertical' || borders === 'both') {
      base.borderRight = `1px solid ${this.style.borderColor}`;
    }

    return base;
  }

  hoverRowColor(): string | false {
    if (this.layout === 'striped-dark') return this.style.hoverRowColor ?? '#334155';
    return this.style.hoverRowColor ?? '#e8f0fe';
  }

  selectedRowColor(): string | false {
    if (this.layout === 'striped-dark') return this.style.selectedRowColor ?? '#1e40af';
    return this.style.selectedRowColor ?? '#d2e3fc';
  }

  toolbarStyles(): CSSObject {
    const isDark = this.layout === 'striped-dark';
    return {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 12px',
      borderBottom: `1px solid ${this.style.borderColor}`,
      backgroundColor: isDark ? '#1e293b' : '#fff',
      color: isDark ? '#cbd5e1' : undefined,
      gap: '8px',
      flexWrap: 'wrap',
    };
  }

  searchInputStyles(): CSSObject {
    const isDark = this.layout === 'striped-dark';
    return {
      padding: '6px 10px',
      border: `1px solid ${isDark ? '#475569' : this.style.borderColor}`,
      borderRadius: '4px',
      fontSize: this.style.fontSize,
      fontFamily: this.style.fontFamily,
      outline: 'none',
      minWidth: '200px',
      boxSizing: 'border-box',
      backgroundColor: isDark ? '#0f172a' : '#fff',
      color: isDark ? '#e2e8f0' : '#1f2937',
    };
  }

  paginationStyles(): CSSObject {
    const isDark = this.layout === 'striped-dark';
    return {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 12px',
      borderTop: `1px solid ${this.style.borderColor}`,
      backgroundColor: isDark ? '#1e293b' : '#fff',
      fontSize: '12px',
      color: isDark ? '#94a3b8' : '#6b7280',
      flexWrap: 'wrap',
      gap: '8px',
    };
  }

  paginationButtonStyles(active: boolean, disabled: boolean): CSSObject {
    const isDark = this.layout === 'striped-dark';
    return {
      padding: '4px 10px',
      border: `1px solid ${active ? '#3b82f6' : isDark ? '#475569' : this.style.borderColor}`,
      borderRadius: '4px',
      backgroundColor: active ? '#3b82f6' : isDark ? '#0f172a' : '#fff',
      color: active ? '#fff' : disabled ? (isDark ? '#475569' : '#d1d5db') : (isDark ? '#cbd5e1' : '#374151'),
      cursor: disabled ? 'default' : 'pointer',
      fontSize: '12px',
      lineHeight: '1.5',
      minWidth: '32px',
      textAlign: 'center',
      userSelect: 'none',
      opacity: disabled ? '0.5' : '1',
    };
  }

  filterInputStyles(): CSSObject {
    const isDark = this.layout === 'striped-dark';
    return {
      width: '100%',
      padding: '3px 6px',
      border: `1px solid ${isDark ? '#475569' : this.style.borderColor}`,
      borderRadius: '3px',
      fontSize: '12px',
      fontFamily: this.style.fontFamily,
      boxSizing: 'border-box',
      outline: 'none',
      backgroundColor: isDark ? '#0f172a' : '#fff',
      color: isDark ? '#e2e8f0' : '#1f2937',
    };
  }

  sortIconStyles(active: boolean): CSSObject {
    return {
      display: 'inline-block',
      marginLeft: '4px',
      fontSize: '10px',
      color: active ? '#3b82f6' : '#9ca3af',
      verticalAlign: 'middle',
    };
  }

  noDataStyles(): CSSObject {
    return {
      textAlign: 'center',
      padding: '40px 20px',
      color: '#9ca3af',
      fontSize: '14px',
    };
  }

  loadingOverlayStyles(): CSSObject {
    return {
      position: 'absolute',
      top: '0',
      left: '0',
      right: '0',
      bottom: '0',
      backgroundColor: 'rgba(255, 255, 255, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: '10',
      fontSize: '14px',
      color: '#6b7280',
    };
  }

  groupHeaderStyles(): CSSObject {
    return {
      backgroundColor: '#f1f5f9',
      fontWeight: '600',
      padding: this.cellPadding,
      cursor: 'pointer',
      userSelect: 'none',
      borderBottom: `1px solid ${this.style.borderColor}`,
    };
  }

  resizeHandleStyles(): CSSObject {
    return {
      position: 'absolute',
      right: '0',
      top: '0',
      bottom: '0',
      width: '4px',
      cursor: 'col-resize',
      userSelect: 'none',
      zIndex: '1',
    };
  }

  dropdownStyles(): CSSObject {
    return {
      position: 'absolute',
      top: '100%',
      right: '0',
      backgroundColor: '#fff',
      border: `1px solid ${this.style.borderColor}`,
      borderRadius: '6px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      zIndex: '100',
      minWidth: '160px',
      padding: '4px 0',
      maxHeight: '300px',
      overflow: 'auto',
    };
  }

  dropdownItemStyles(active?: boolean): CSSObject {
    return {
      padding: '6px 12px',
      cursor: 'pointer',
      fontSize: '13px',
      backgroundColor: active ? '#f3f4f6' : 'transparent',
      whiteSpace: 'nowrap',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    };
  }

  toolbarButtonStyles(): CSSObject {
    const isDark = this.layout === 'striped-dark';
    return {
      padding: '5px 10px',
      border: `1px solid ${isDark ? '#475569' : this.style.borderColor}`,
      borderRadius: '4px',
      backgroundColor: isDark ? '#0f172a' : '#fff',
      cursor: 'pointer',
      fontSize: '12px',
      color: isDark ? '#cbd5e1' : '#374151',
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      whiteSpace: 'nowrap',
      position: 'relative',
    };
  }

  selectStyles(): CSSObject {
    const isDark = this.layout === 'striped-dark';
    return {
      padding: '4px 6px',
      border: `1px solid ${this.style.borderColor}`,
      borderRadius: '4px',
      fontSize: '12px',
      fontFamily: this.style.fontFamily,
      outline: 'none',
      backgroundColor: '#fff',
    };
  }

  contextMenuStyles(): CSSObject {
    return {
      position: 'fixed',
      backgroundColor: '#fff',
      border: `1px solid ${this.style.borderColor}`,
      borderRadius: '6px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      zIndex: '1000',
      minWidth: '160px',
      padding: '4px 0',
    };
  }

  contextMenuItemStyles(disabled?: boolean): CSSObject {
    return {
      padding: '6px 12px',
      cursor: disabled ? 'default' : 'pointer',
      fontSize: '13px',
      color: disabled ? '#9ca3af' : '#374151',
      opacity: disabled ? '0.6' : '1',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    };
  }

  update(style: DataTableStyleOptions): void {
    if (style.layout && style.layout !== this.layout) {
      this.layout = style.layout;
      const preset = LAYOUT_PRESETS[this.layout] ?? {};
      Object.assign(this.style, preset, style);
    } else {
      Object.assign(this.style, style);
    }
  }

  getLayout(): LayoutStyle {
    return this.layout;
  }
}

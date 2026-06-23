/**
 * Injected default stylesheet for the DataTable.
 *
 * The whole visual layer is expressed through low-specificity class selectors
 * driven by `--kdt-*` custom properties. This is what makes the table both
 * good-looking out of the box (a modern, neutral theme) and
 * trivially overridable: consumers can re-theme by setting a single CSS
 * variable, or restyle any part by targeting its stable class name — no
 * `!important` required, because the renderers no longer hard-code visuals
 * as inline styles.
 */

export const DATATABLE_STYLE_ID = 'katucharts-datatable-styles';

const STYLE_SHEET = `
.katucharts-datatable {
  --kdt-font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --kdt-font-size: 14px;
  --kdt-radius: 8px;

  --kdt-bg: #ffffff;
  --kdt-popover-bg: #ffffff;
  --kdt-fg: #09090b;
  --kdt-muted: #f4f4f5;
  --kdt-muted-fg: #71717a;
  --kdt-border: #e4e4e7;
  --kdt-input: #e4e4e7;
  --kdt-accent: #f4f4f5;
  --kdt-accent-fg: #18181b;
  --kdt-primary: #18181b;
  --kdt-primary-fg: #fafafa;
  --kdt-ring: #a1a1aa;

  --kdt-header-bg: transparent;
  --kdt-header-fg: var(--kdt-muted-fg);
  --kdt-header-font-size: 13px;
  --kdt-header-font-weight: 500;
  --kdt-hover-bg: var(--kdt-muted);
  --kdt-selected-bg: var(--kdt-muted);
  --kdt-stripe-bg: transparent;

  --kdt-row-height: 44px;
  --kdt-header-height: 44px;
  --kdt-cell-px: 16px;
  --kdt-cell-py: 10px;

  position: relative;
  box-sizing: border-box;
  width: 100%;
  font-family: var(--kdt-font-family);
  font-size: var(--kdt-font-size);
  color: var(--kdt-fg);
  background: var(--kdt-bg);
  border: 1px solid var(--kdt-border);
  border-radius: var(--kdt-radius);
  overflow: hidden;
}
.katucharts-datatable *,
.katucharts-datatable *::before,
.katucharts-datatable *::after { box-sizing: border-box; }

/* ── density ───────────────────────────────────────────────── */
.katucharts-datatable[data-density="compact"] {
  --kdt-row-height: 34px; --kdt-header-height: 36px; --kdt-cell-px: 12px; --kdt-cell-py: 4px;
}
.katucharts-datatable[data-density="comfortable"] {
  --kdt-row-height: 56px; --kdt-header-height: 52px; --kdt-cell-px: 20px; --kdt-cell-py: 14px;
}

/* ── dark theme ────────────────────────────────────────────── */
.katucharts-datatable[data-theme="dark"] {
  --kdt-bg: #09090b;
  --kdt-popover-bg: #18181b;
  --kdt-fg: #fafafa;
  --kdt-muted: #27272a;
  --kdt-muted-fg: #a1a1aa;
  --kdt-border: #27272a;
  --kdt-input: #27272a;
  --kdt-accent: #27272a;
  --kdt-accent-fg: #fafafa;
  --kdt-primary: #fafafa;
  --kdt-primary-fg: #18181b;
  --kdt-ring: #52525b;
}

/* ── toolbar ───────────────────────────────────────────────── */
.katucharts-dt-toolbar {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; flex-wrap: wrap;
  padding: 12px;
  background: var(--kdt-bg);
  border-bottom: 1px solid var(--kdt-border);
}
.katucharts-dt-toolbar-group { display: flex; align-items: center; gap: 8px; }
.katucharts-dt-toolbar-group--left { flex: 1 1 auto; }

/* ── title ─────────────────────────────────────────────────── */
.katucharts-dt-title {
  padding: 16px 16px 4px; font-size: 16px; font-weight: 600; color: var(--kdt-fg);
}

/* ── search ────────────────────────────────────────────────── */
.katucharts-dt-search { position: relative; display: flex; align-items: center; }
.katucharts-dt-search-icon {
  position: absolute; left: 10px; display: flex; pointer-events: none; color: var(--kdt-muted-fg);
}
.katucharts-dt-search-icon svg { width: 15px; height: 15px; }
.katucharts-dt-search .katucharts-dt-input { padding-left: 32px; min-width: 220px; }

/* ── inputs / selects ──────────────────────────────────────── */
.katucharts-dt-input,
.katucharts-dt-select {
  height: 36px;
  padding: 0 10px;
  font-family: inherit;
  font-size: 13px;
  color: var(--kdt-fg);
  background: var(--kdt-bg);
  border: 1px solid var(--kdt-input);
  border-radius: calc(var(--kdt-radius) - 2px);
  outline: none;
  transition: border-color .15s ease, box-shadow .15s ease;
}
.katucharts-dt-input::placeholder { color: var(--kdt-muted-fg); }
.katucharts-dt-input:focus,
.katucharts-dt-select:focus { border-color: var(--kdt-ring); box-shadow: 0 0 0 2px color-mix(in srgb, var(--kdt-ring) 35%, transparent); }
.katucharts-dt-select { cursor: pointer; padding-right: 24px; }

/* ── buttons ───────────────────────────────────────────────── */
.katucharts-dt-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  height: 36px; min-width: 36px; padding: 0 12px;
  font-family: inherit; font-size: 13px; font-weight: 500; line-height: 1;
  color: var(--kdt-fg); background: var(--kdt-bg);
  border: 1px solid var(--kdt-border); border-radius: calc(var(--kdt-radius) - 2px);
  cursor: pointer; user-select: none; white-space: nowrap;
  transition: background-color .15s ease, color .15s ease, border-color .15s ease, opacity .15s ease;
}
.katucharts-dt-btn:hover:not(:disabled) { background: var(--kdt-accent); color: var(--kdt-accent-fg); }
.katucharts-dt-btn:disabled { opacity: .45; cursor: default; }
.katucharts-dt-btn.is-active { background: var(--kdt-primary); color: var(--kdt-primary-fg); border-color: var(--kdt-primary); }
.katucharts-dt-btn svg { width: 15px; height: 15px; }

/* ── dropdown menus ────────────────────────────────────────── */
.katucharts-dt-menu {
  position: absolute; top: calc(100% + 4px); right: 0; z-index: 100;
  min-width: 180px; max-height: 320px; overflow: auto; padding: 4px;
  background: var(--kdt-popover-bg, #fff); color: var(--kdt-fg);
  border: 1px solid var(--kdt-border); border-radius: var(--kdt-radius);
  box-shadow: 0 10px 24px -8px rgba(0,0,0,.25), 0 2px 6px -2px rgba(0,0,0,.12);
}
.katucharts-dt-menu-label { padding: 6px 8px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--kdt-muted-fg); }
.katucharts-dt-menu-sep { height: 1px; margin: 4px 0; background: var(--kdt-border); border: 0; }
.katucharts-dt-menu-item {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 8px; font-size: 13px; border-radius: calc(var(--kdt-radius) - 4px);
  cursor: pointer; white-space: nowrap; color: var(--kdt-fg);
}
.katucharts-dt-menu-item:hover,
.katucharts-dt-menu-item.is-active { background: var(--kdt-accent); color: var(--kdt-accent-fg); }
.katucharts-dt-menu-item input { cursor: pointer; }

/* ── table scaffold ────────────────────────────────────────── */
.katucharts-dt-table-area { position: relative; }
.katucharts-dt-table-container { position: relative; }
.katucharts-dt-header-scroll { overflow: hidden; }
.katucharts-dt-body-scroll { overflow: auto; position: relative; }
.katucharts-datatable table { width: 100%; border-collapse: separate; border-spacing: 0; table-layout: fixed; }

/* ── header ────────────────────────────────────────────────── */
.katucharts-dt-header-row { background: var(--kdt-header-bg); }
.katucharts-dt-th {
  position: relative;
  height: var(--kdt-header-height);
  padding: 0 var(--kdt-cell-px);
  font-size: var(--kdt-header-font-size);
  font-weight: var(--kdt-header-font-weight);
  color: var(--kdt-header-fg);
  text-align: left; vertical-align: middle;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  user-select: none;
  border-bottom: 1px solid var(--kdt-border);
}
.katucharts-dt-th.is-sortable { cursor: pointer; }
.katucharts-dt-th.is-sortable:hover { color: var(--kdt-fg); }
.katucharts-dt-th-inner { display: inline-flex; align-items: center; gap: 4px; max-width: 100%; }
.katucharts-dt-th-custom { display: block; width: 100%; }
.katucharts-dt-th[data-align="right"] { text-align: right; }
.katucharts-dt-th[data-align="right"] .katucharts-dt-th-inner { flex-direction: row-reverse; }
.katucharts-dt-th[data-align="center"] { text-align: center; }
.katucharts-dt-th[data-align="center"] .katucharts-dt-th-inner { justify-content: center; }

.katucharts-dt-sort-icon { display: inline-flex; flex: none; color: var(--kdt-muted-fg); opacity: .55; transition: opacity .15s ease, color .15s ease; }
.katucharts-dt-sort-icon svg { width: 14px; height: 14px; }
.katucharts-dt-th.is-sorted .katucharts-dt-sort-icon { opacity: 1; color: var(--kdt-fg); }
.katucharts-dt-sort-badge { font-size: 9px; line-height: 1; padding: 1px 3px; border-radius: 6px; background: var(--kdt-muted); color: var(--kdt-muted-fg); }

/* ── filter row ────────────────────────────────────────────── */
.katucharts-dt-filter-row > td { padding: 6px var(--kdt-cell-px) 10px; border-bottom: 1px solid var(--kdt-border); }
.katucharts-dt-filter-input { height: 32px; width: 100%; font-size: 12px; }
.katucharts-dt-filter-range { display: flex; gap: 6px; }
.katucharts-dt-filter-range .katucharts-dt-input { width: 50%; }

/* ── body rows / cells ─────────────────────────────────────── */
.katucharts-dt-row { height: var(--kdt-row-height); transition: background-color .12s ease; }
.katucharts-dt-row > td { border-bottom: 1px solid var(--kdt-border); }
.katucharts-datatable[data-borders="none"] .katucharts-dt-row > td,
.katucharts-datatable[data-borders="none"] .katucharts-dt-th { border-bottom-color: transparent; }
.katucharts-datatable[data-borders="vertical"] .katucharts-dt-td:not(:last-child),
.katucharts-datatable[data-borders="vertical"] .katucharts-dt-th:not(:last-child),
.katucharts-datatable[data-borders="both"] .katucharts-dt-td:not(:last-child),
.katucharts-datatable[data-borders="both"] .katucharts-dt-th:not(:last-child) { border-right: 1px solid var(--kdt-border); }
.katucharts-datatable[data-striped="true"] .katucharts-dt-row:nth-child(even) { background: var(--kdt-stripe-bg); }
.katucharts-dt-row:hover { background: var(--kdt-hover-bg); }
.katucharts-dt-row.is-selected,
.katucharts-dt-row.is-selected:hover { background: var(--kdt-selected-bg); }
.katucharts-dt-td {
  padding: var(--kdt-cell-py) var(--kdt-cell-px);
  vertical-align: middle;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.katucharts-dt-td[data-align="right"] { text-align: right; }
.katucharts-dt-td[data-align="center"] { text-align: center; }

/* ── selection checkbox cells ──────────────────────────────── */
.katucharts-dt-checkbox-cell { width: 44px; padding: 0; text-align: center; }
.katucharts-dt-checkbox { width: 16px; height: 16px; cursor: pointer; accent-color: var(--kdt-primary); }

/* ── group header rows ─────────────────────────────────────── */
.katucharts-dt-group-header > td {
  padding: var(--kdt-cell-py) var(--kdt-cell-px);
  font-weight: 600; cursor: pointer; user-select: none;
  background: var(--kdt-muted); border-bottom: 1px solid var(--kdt-border);
}

/* ── detail rows ───────────────────────────────────────────── */
.katucharts-dt-detail > td { padding: 12px var(--kdt-cell-px); background: var(--kdt-muted); }

/* ── empty / loading ───────────────────────────────────────── */
.katucharts-dt-nodata { padding: 48px 20px; text-align: center; color: var(--kdt-muted-fg); font-size: 14px; }
.katucharts-dt-loading {
  position: absolute; inset: 0; z-index: 10;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  background: color-mix(in srgb, var(--kdt-bg) 75%, transparent);
  color: var(--kdt-muted-fg); font-size: 14px;
}
.katucharts-dt-spinner {
  width: 16px; height: 16px; border-radius: 50%;
  border: 2px solid var(--kdt-border); border-top-color: var(--kdt-fg);
  animation: katucharts-dt-spin .7s linear infinite;
}
@keyframes katucharts-dt-spin { to { transform: rotate(360deg); } }

/* ── resize handle ─────────────────────────────────────────── */
.katucharts-dt-resize-handle {
  position: absolute; top: 0; right: 0; bottom: 0; width: 6px;
  cursor: col-resize; user-select: none; touch-action: none; z-index: 1;
}
.katucharts-dt-resize-handle::after {
  content: ""; position: absolute; top: 25%; bottom: 25%; right: 2px; width: 2px;
  background: var(--kdt-border); border-radius: 2px; opacity: 0; transition: opacity .15s ease;
}
.katucharts-dt-resize-handle:hover::after { opacity: 1; background: var(--kdt-ring); }

/* ── pinned columns ────────────────────────────────────────── */
.katucharts-dt-th.is-pinned,
.katucharts-dt-td.is-pinned { position: sticky; z-index: 2; background: var(--kdt-bg); }
.katucharts-dt-th.is-pinned { z-index: 3; }

/* ── pagination / footer ───────────────────────────────────── */
.katucharts-dt-footer {
  display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
  padding: 12px; border-top: 1px solid var(--kdt-border);
  font-size: 13px; color: var(--kdt-muted-fg); background: var(--kdt-bg);
}
.katucharts-dt-footer-section { display: flex; align-items: center; gap: 8px; }
.katucharts-dt-page-size { display: flex; align-items: center; gap: 8px; }
.katucharts-dt-page-size-btn { height: 32px; padding: 0 8px; gap: 4px; font-weight: 500; }
.katucharts-dt-page-size-btn svg { width: 14px; height: 14px; color: var(--kdt-muted-fg); }
.katucharts-dt-pagination { display: flex; align-items: center; gap: 4px; }
.katucharts-dt-ellipsis { padding: 0 4px; color: var(--kdt-muted-fg); }
.katucharts-dt-pagination .katucharts-dt-btn { height: 32px; min-width: 32px; padding: 0 8px; }

/* ── faceted filter badges ─────────────────────────────────── */
.katucharts-dt-facet-count {
  display: inline-flex; align-items: center; height: 18px; padding: 0 6px; margin-left: 2px;
  font-size: 11px; font-weight: 600; border-radius: 6px;
  background: var(--kdt-muted); color: var(--kdt-accent-fg);
}

/* ── floating layers (rendered at <body>, so unscoped) ─────── */
.katucharts-dt-context-menu {
  position: fixed; z-index: 1000; min-width: 180px; padding: 4px;
  font-family: ui-sans-serif, system-ui, sans-serif; font-size: 13px;
  background: #fff; color: #18181b;
  border: 1px solid #e4e4e7; border-radius: 8px;
  box-shadow: 0 10px 24px -8px rgba(0,0,0,.25), 0 2px 6px -2px rgba(0,0,0,.12);
}
.katucharts-dt-context-menu-item {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 8px; border-radius: 4px; cursor: pointer;
}
.katucharts-dt-context-menu-item:hover { background: #f4f4f5; }
.katucharts-dt-context-menu-item.is-disabled { color: #a1a1aa; opacity: .6; cursor: default; }
.katucharts-dt-context-menu-item.is-disabled:hover { background: transparent; }
.katucharts-dt-context-menu-sep { height: 1px; margin: 4px 0; background: #e4e4e7; border: 0; }
`;

/**
 * Injects the shared stylesheet into <head> exactly once per document.
 */
export function injectDataTableStyles(doc: Document = document): void {
  if (doc.getElementById(DATATABLE_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = DATATABLE_STYLE_ID;
  style.textContent = STYLE_SHEET;
  doc.head.appendChild(style);
}

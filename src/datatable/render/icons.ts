/**
 * Inline SVG icons (Lucide-style) used across the DataTable chrome.
 * Returned as markup strings so they can be dropped into `innerHTML`.
 */

const wrap = (paths: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ` +
  `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const ICONS = {
  sortAsc: wrap('<path d="m18 15-6-6-6 6"/>'),
  sortDesc: wrap('<path d="m6 9 6 6 6-6"/>'),
  sortNone: wrap('<path d="m8 9 4-4 4 4"/><path d="m16 15-4 4-4-4"/>'),
  search: wrap('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>'),
  columns: wrap('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/>'),
  download: wrap('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>'),
  sliders: wrap('<line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="2" x2="6" y1="14" y2="14"/><line x1="10" x2="14" y1="8" y2="8"/><line x1="18" x2="22" y1="16" y2="16"/>'),
  expand: wrap('<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>'),
  check: wrap('<path d="M20 6 9 17l-5-5"/>'),
  x: wrap('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  chevronLeft: wrap('<path d="m15 18-6-6 6-6"/>'),
  chevronRight: wrap('<path d="m9 18 6-6-6-6"/>'),
  chevronDown: wrap('<path d="m6 9 6 6 6-6"/>'),
  chevronsUpDown: wrap('<path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>'),
  chevronsLeft: wrap('<path d="m11 17-5-5 5-5"/><path d="m18 17-5-5 5-5"/>'),
  chevronsRight: wrap('<path d="m6 17 5-5-5-5"/><path d="m13 17 5-5-5-5"/>'),
  plusCircle: wrap('<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/>'),
} as const;

export type IconName = keyof typeof ICONS;

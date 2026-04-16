/**
 * Centralized animation timings and easings used across every series.
 * Entry duration is unified to match the heatmap reference; hover transitions
 * are smoothed to a clearly perceivable ~300 ms with cubic-out easing.
 */

import { easeCubicOut, easeCubicInOut } from 'd3-ease';

export const ENTRY_DURATION = 600;
export const ENTRY_STAGGER_PER_ITEM = 8;
export const ENTRY_DELAY_BASE = 0;
export const ENTRY_DATALABEL_DELAY = ENTRY_DURATION + 100;

/** Base animation duration for flow charts (Sankey, DependencyWheel). */
export const ENTRY_FLOW_DURATION = 6600;
/** Base animation duration for circos plot families. */
export const ENTRY_CIRCOS_DURATION = 8400;
/** Gap inserted between hierarchical animation stages. */
export const ENTRY_STAGE_GAP = 480;
/** Per-ribbon stagger delay inside a ribbon reveal stage. */
export const ENTRY_RIBBON_STAGGER = 84;

export const HOVER_DURATION = 300;
export const HOVER_INACTIVE_DURATION = 250;

export const EASE_ENTRY = easeCubicOut;
export const EASE_HOVER = easeCubicOut;
export const EASE_UPDATE = easeCubicInOut;

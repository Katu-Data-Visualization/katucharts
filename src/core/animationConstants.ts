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

export const HOVER_DURATION = 300;
export const HOVER_INACTIVE_DURATION = 250;

export const EASE_ENTRY = easeCubicOut;
export const EASE_HOVER = easeCubicOut;
export const EASE_UPDATE = easeCubicInOut;

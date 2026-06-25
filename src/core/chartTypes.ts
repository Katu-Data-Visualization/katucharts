/**
 * Canonical series-type classification sets shared across the chart, layout and
 * axis subsystems. Previously each consumer maintained its own inline `Set`,
 * which drifted out of sync (e.g. `treegraph`/`wordcloud` were missing from the
 * layout engine's copy, causing it to reserve cartesian-axis space for them).
 */

/**
 * Series types that do not use cartesian x/y axes. When every series in a chart
 * is one of these, the chart skips axis construction and cartesian layout.
 */
export const NO_AXES_TYPES: ReadonlySet<string> = new Set([
  'pie', 'donut', 'sunburst', 'treemap', 'treegraph', 'wordcloud', 'sankey', 'dependencywheel',
  'networkgraph', 'gauge', 'solidgauge', 'polar', 'radar', 'funnel',
  'pyramid', 'timeline', 'map', 'mappoint', 'flowmap', 'barchartrace', 'venn',
  'clusteredheatmap', 'phylotree', 'circos',
  'circosHeatmap', 'circosComparative', 'circosSpiral',
  'item', 'classroom',
]);

/**
 * Series types that render their own data labels (or have no cartesian point
 * geometry), and therefore must not receive the generic cartesian
 * `DataLabels.render` pass.
 */
export const NON_CARTESIAN_TYPES: ReadonlySet<string> = new Set([
  'pie', 'donut', 'funnel', 'pyramid', 'sankey', 'dependencywheel',
  'networkgraph', 'treemap', 'sunburst', 'gauge', 'solidgauge',
  'timeline', 'gantt', 'map', 'mappoint', 'flowmap', 'heatmap', 'polar', 'radar', 'barchartrace', 'venn',
  'clusteredheatmap', 'phylotree', 'circos',
  'item', 'classroom',
]);

/**
 * Cartesian series types that draw their own data labels internally, so the
 * generic `DataLabels.render` pass should skip them to avoid duplicate labels.
 */
export const SELF_RENDERED_DATALABEL_TYPES: ReadonlySet<string> = new Set([
  'line', 'spline', 'column', 'bar', 'scatter', 'bubble',
  'area', 'areaspline', 'boxplot', 'waterfall', 'volume',
]);

/**
 * Series types whose geometry overflows the plot area and must not be clipped.
 */
export const NO_CLIP_TYPES: ReadonlySet<string> = new Set(['pie', 'venn', 'forestplot', 'pcoa', 'item', 'classroom']);

/**
 * Series types whose markers extend beyond data extents and need the plot clip
 * region expanded by a margin.
 */
export const EXPAND_TYPES: ReadonlySet<string> = new Set(['scatter', 'bubble']);

/**
 * Cartesian series types that should anchor their value axis at zero by default.
 */
export const ZERO_BASE_TYPES: ReadonlySet<string> = new Set(['column', 'bar', 'area', 'areaspline', 'waterfall']);

/**
 * Returns true when the given series type uses cartesian x/y axes.
 */
export function hasAxes(internalType: string): boolean {
  return !NO_AXES_TYPES.has(internalType);
}

/**
 * Returns true when a chart has series and every one of them is a non-cartesian
 * type — i.e. the chart should skip axis construction and cartesian layout.
 */
export function isNonCartesianChart(series: ReadonlyArray<{ _internalType: string }>): boolean {
  return series.length > 0 && series.every(s => NO_AXES_TYPES.has(s._internalType));
}

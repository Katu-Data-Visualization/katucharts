/**
 * Option types for KatuCharts.
 */

export type SeriesType =
  | 'line' | 'spline' | 'area' | 'areaspline' | 'arearange'
  | 'column' | 'bar' | 'barchartrace' | 'scatter' | 'bubble'
  | 'pie' | 'donut'
  | 'heatmap'
  | 'treemap' | 'sunburst'
  | 'sankey' | 'dependencywheel' | 'networkgraph'
  | 'gauge' | 'solidgauge'
  | 'polar' | 'radar'
  | 'candlestick' | 'ohlc' | 'heikinashi' | 'hollowcandlestick'
  | 'volume' | 'arearange' | 'baseline' | 'flags'
  | 'renko' | 'kagi' | 'pointandfigure' | 'linebreak'
  | 'waterfall' | 'boxplot'
  | 'funnel' | 'pyramid'
  | 'timeline' | 'gantt'
  | 'map'
  | 'venn'
  | 'volcano' | 'manhattan' | 'violin' | 'kaplanmeier' | 'forestplot'
  | 'sequencelogo' | 'clusteredheatmap' | 'phylotree' | 'circos'
  | 'circosChord' | 'circosHeatmap' | 'circosComparative' | 'circosSpiral'
  | 'pcoa';

export type CursorType = 'pointer' | 'default' | 'crosshair' | 'move' | 'help' | 'text' | 'not-allowed';

export type DashStyleType = 'Solid' | 'ShortDash' | 'ShortDot' | 'ShortDashDot' | 'ShortDashDotDot'
  | 'Dot' | 'Dash' | 'LongDash' | 'DashDot' | 'LongDashDot' | 'LongDashDotDot';

export type AlignType = 'left' | 'center' | 'right';
export type VerticalAlignType = 'top' | 'middle' | 'bottom';

export interface CSSObject {
  [key: string]: string | number | undefined;
}

export interface StreamingOptions {
  enabled?: boolean;
  maxFps?: number;
  bufferSize?: number;
  batchInterval?: number;
  shiftOnOverflow?: boolean;
}

export interface ChartEventsOptions {
  load?: (this: any, event: Event) => void;
  redraw?: (this: any, event: Event) => void;
  render?: (this: any, event: Event) => void;
  selection?: (this: any, event: any) => boolean | void;
  click?: (this: any, event: MouseEvent) => void;
  addSeries?: (this: any, event: any) => boolean | void;
  drilldown?: (this: any, event: any) => void;
  drillup?: (this: any, event: any) => void;
  beforePrint?: (this: any, event: Event) => void;
  afterPrint?: (this: any, event: Event) => void;
}

export interface ChartOptions {
  type?: SeriesType;
  width?: number | null;
  height?: number | string | null;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  className?: string;
  margin?: number | number[];
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;
  spacing?: number[];
  spacingTop?: number;
  spacingRight?: number;
  spacingBottom?: number;
  spacingLeft?: number;
  style?: CSSObject;
  animation?: boolean | { duration?: number; easing?: string };
  zoomType?: 'x' | 'y' | 'xy';
  panning?: boolean | { enabled?: boolean; type?: 'x' | 'y' | 'xy' };
  panKey?: 'ctrl' | 'alt' | 'shift' | 'meta';
  inverted?: boolean;
  polar?: boolean;
  reflow?: boolean;
  palette?: string;
  events?: ChartEventsOptions;
  styledMode?: boolean;
  renderTo?: string | HTMLElement;
  plotBackgroundColor?: string;
  plotBackgroundImage?: string;
  plotBorderColor?: string;
  plotBorderWidth?: number;
  plotShadow?: boolean;
  shadow?: boolean;
  selectionMarkerFill?: string;
  ignoreHiddenSeries?: boolean;
  colorCount?: number;
  streaming?: StreamingOptions;
  numberFormatter?: (value: number) => string;
  zooming?: {
    type?: 'x' | 'y' | 'xy';
    key?: 'ctrl' | 'alt' | 'shift' | 'meta';
    mouseWheel?: boolean | { enabled?: boolean; sensitivity?: number };
    pinchType?: 'x' | 'y' | 'xy';
    resetButton?: {
      position?: { align?: AlignType; verticalAlign?: VerticalAlignType; x?: number; y?: number };
      theme?: Record<string, any>;
      relativeTo?: 'plot' | 'chart';
    };
    singleTouch?: boolean;
  };
}

export interface TitleOptions {
  text?: string | null;
  align?: AlignType;
  verticalAlign?: VerticalAlignType;
  floating?: boolean;
  margin?: number;
  style?: CSSObject;
  x?: number;
  y?: number;
  useHTML?: boolean;
  widthAdjust?: number;
}

export interface SubtitleOptions extends TitleOptions {}

export interface AxisLabelOptions {
  enabled?: boolean;
  format?: string;
  formatter?: (this: { value: any; axis: any }) => string;
  style?: CSSObject;
  rotation?: number;
  autoRotation?: number[];
  autoRotationLimit?: number;
  align?: AlignType;
  x?: number;
  y?: number;
  overflow?: 'allow' | 'justify';
  staggerLines?: number;
  step?: number;
  useHTML?: boolean;
  padding?: number;
}

export interface AxisTitleOptions {
  text?: string | null;
  align?: 'low' | 'middle' | 'high';
  style?: CSSObject;
  rotation?: number;
  offset?: number;
  margin?: number;
  x?: number;
  y?: number;
}

export interface PlotBandOptions {
  from?: number;
  to?: number;
  color?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  label?: {
    text?: string;
    align?: AlignType;
    verticalAlign?: VerticalAlignType;
    style?: CSSObject;
    x?: number;
    y?: number;
  };
  id?: string;
  zIndex?: number;
  className?: string;
  events?: {
    click?: (this: any, event: MouseEvent) => void;
    mouseover?: (this: any, event: MouseEvent) => void;
    mouseout?: (this: any, event: MouseEvent) => void;
    mousemove?: (this: any, event: MouseEvent) => void;
  };
}

export interface PlotLineOptions {
  value?: number;
  color?: string;
  width?: number;
  dashStyle?: DashStyleType;
  label?: {
    text?: string;
    align?: AlignType;
    verticalAlign?: VerticalAlignType;
    style?: CSSObject;
    rotation?: number;
    x?: number;
    y?: number;
  };
  id?: string;
  zIndex?: number;
  className?: string;
  events?: {
    click?: (this: any, event: MouseEvent) => void;
    mouseover?: (this: any, event: MouseEvent) => void;
    mouseout?: (this: any, event: MouseEvent) => void;
    mousemove?: (this: any, event: MouseEvent) => void;
  };
}

export interface CrosshairOptions {
  enabled?: boolean;
  color?: string;
  width?: number;
  dashStyle?: DashStyleType;
  snap?: boolean;
  zIndex?: number;
  className?: string;
  label?: {
    enabled?: boolean;
    format?: string;
    formatter?: (this: { value: any }) => string;
    backgroundColor?: string;
    borderColor?: string;
    borderRadius?: number;
    borderWidth?: number;
    padding?: number;
    style?: CSSObject;
    align?: AlignType;
  };
}

export interface AxisOptions {
  type?: 'linear' | 'logarithmic' | 'datetime' | 'category';
  title?: AxisTitleOptions;
  labels?: AxisLabelOptions;
  min?: number | null;
  max?: number | null;
  softMin?: number;
  softMax?: number;
  floor?: number;
  ceiling?: number;
  tickInterval?: number;
  minTickInterval?: number;
  tickAmount?: number;
  tickPixelInterval?: number;
  tickLength?: number;
  tickWidth?: number;
  tickColor?: string;
  tickPosition?: 'inside' | 'outside';
  minorTickInterval?: number | 'auto' | null;
  minorTickLength?: number;
  minorTickWidth?: number;
  minorTickColor?: string;
  gridLineWidth?: number;
  gridLineColor?: string;
  gridLineDashStyle?: DashStyleType;
  minorGridLineWidth?: number;
  minorGridLineColor?: string;
  lineWidth?: number;
  lineColor?: string;
  offset?: number;
  opposite?: boolean;
  reversed?: boolean;
  visible?: boolean;
  showEmpty?: boolean;
  categories?: string[];
  crosshair?: boolean | CrosshairOptions;
  plotBands?: PlotBandOptions[];
  plotLines?: PlotLineOptions[];
  startOnTick?: boolean;
  endOnTick?: boolean;
  showFirstLabel?: boolean;
  showLastLabel?: boolean;
  allowDecimals?: boolean;
  alternateGridColor?: string;
  id?: string;
  linkedTo?: number;
  maxPadding?: number;
  minPadding?: number;
  dateTimeLabelFormats?: Record<string, string>;
  tickPositions?: number[];
  stackLabels?: {
    enabled?: boolean;
    format?: string;
    formatter?: (this: { total: number }) => string;
    style?: CSSObject;
    align?: AlignType;
    verticalAlign?: VerticalAlignType;
    rotation?: number;
    x?: number;
    y?: number;
  };
  breaks?: { from?: number; to?: number; breakSize?: number; repeat?: number }[];
  scrollbar?: { enabled?: boolean; barBackgroundColor?: string; barBorderColor?: string; barBorderWidth?: number; buttonBackgroundColor?: string; buttonBorderColor?: string; buttonBorderWidth?: number; rifleColor?: string; trackBackgroundColor?: string; trackBorderColor?: string; trackBorderWidth?: number };
  ordinal?: boolean;
  overscroll?: number;
  range?: number;
  minRange?: number;
  maxRange?: number;
  alignTicks?: boolean;
  uniqueNames?: boolean;
  events?: {
    afterSetExtremes?: (this: any, event: any) => void;
    setExtremes?: (this: any, event: any) => void;
    afterBreaks?: (this: any, event: any) => void;
    pointBreak?: (this: any, event: any) => void;
  };
}

export interface PointOptions {
  x?: number;
  y?: number | null;
  z?: number;
  name?: string;
  color?: string;
  colorIndex?: number;
  id?: string;
  visible?: boolean;
  custom?: Record<string, any>;
  description?: string;
  labelrank?: number;
  selected?: boolean;
  sliced?: boolean;
  drilldown?: string;
  marker?: MarkerOptions;
  dataLabels?: DataLabelOptions;
  events?: {
    click?: (this: any, event: MouseEvent) => void;
    mouseOver?: (this: any, event: MouseEvent) => void;
    mouseOut?: (this: any, event: MouseEvent) => void;
    select?: (this: any, event: MouseEvent) => boolean | void;
    unselect?: (this: any, event: MouseEvent) => boolean | void;
    update?: (this: any, event: any) => boolean | void;
    remove?: (this: any, event: any) => boolean | void;
  };
  accessibility?: {
    description?: string;
    enabled?: boolean;
  };
  [key: string]: any;
}

export interface MarkerOptions {
  enabled?: boolean | null;
  enabledThreshold?: number;
  symbol?: 'circle' | 'square' | 'diamond' | 'triangle' | 'triangle-down' | string;
  radius?: number;
  fillColor?: string;
  lineColor?: string;
  lineWidth?: number;
  width?: number;
  height?: number;
  states?: {
    hover?: { enabled?: boolean; radius?: number; radiusPlus?: number; lineWidth?: number; lineWidthPlus?: number; fillColor?: string; lineColor?: string };
    select?: { enabled?: boolean; radius?: number; lineWidth?: number; fillColor?: string; lineColor?: string };
  };
}

export interface DataLabelOptions {
  enabled?: boolean;
  format?: string;
  formatter?: (this: { point: any; series: any; x: any; y: any; percentage?: number }) => string;
  style?: CSSObject;
  color?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  padding?: number;
  align?: AlignType;
  verticalAlign?: VerticalAlignType;
  x?: number;
  y?: number;
  rotation?: number;
  overflow?: 'allow' | 'justify' | 'none';
  crop?: boolean;
  inside?: boolean;
  allowOverlap?: boolean;
  useHTML?: boolean;
  shadow?: boolean;
  shape?: 'square' | 'callout' | 'circle' | 'diamond' | string;
  alignTo?: 'plotEdges' | 'connectors';
  distance?: number;
  connectorWidth?: number;
  connectorColor?: string;
  connectorPadding?: number;
  connectorShape?: 'fixedOffset' | 'straight' | 'crookedLine' | ((args: any) => string);
  softConnector?: boolean;
  crookDistance?: string | number;
  defer?: boolean;
  filter?: { property?: string; operator?: string; value?: number };
  nullFormat?: string;
  nullFormatter?: (this: { point: any; series: any }) => string;
  zIndex?: number;
  className?: string;
  position?: 'center' | 'left' | 'right';
  intersections?: { enabled?: boolean };
  textPath?: {
    enabled?: boolean;
    attributes?: Record<string, any>;
  };
}

export interface SankeyNodeOptions {
  id: string;
  name?: string;
  color?: string;
  column?: number;
  offset?: number | string;
  level?: number;
}

export interface SankeyLevelOptions {
  level?: number;
  color?: string;
  linkOpacity?: number;
  borderColor?: string;
  borderWidth?: number;
  colorByPoint?: boolean;
  dataLabels?: DataLabelOptions;
}

export interface BorderRadiusOptions {
  radius?: number;
  scope?: 'point' | 'stack';
  where?: 'all' | 'end';
}

export interface AnimationOptions {
  duration?: number;
  easing?: string;
  defer?: number;
  complete?: () => void;
}

export interface SeriesStatesOptions {
  hover?: {
    enabled?: boolean;
    lineWidth?: number;
    lineWidthPlus?: number;
    halo?: { size?: number; opacity?: number; attributes?: Record<string, any> };
    brightness?: number;
    color?: string;
    borderColor?: string;
    borderWidth?: number;
    marker?: MarkerOptions;
    animation?: AnimationOptions;
  };
  select?: {
    enabled?: boolean;
    color?: string;
    borderColor?: string;
    borderWidth?: number;
    animation?: AnimationOptions;
  };
  inactive?: {
    enabled?: boolean;
    opacity?: number;
    animation?: AnimationOptions;
  };
  normal?: {
    animation?: AnimationOptions;
  };
}

export interface ZoneOptions {
  value?: number;
  color?: string;
  dashStyle?: DashStyleType;
  fillColor?: string;
  className?: string;
}

export interface GaugeDialOptions {
  backgroundColor?: string;
  baseLength?: string | number;
  baseWidth?: number;
  borderColor?: string;
  borderWidth?: number;
  radius?: string | number;
  rearLength?: string | number;
  topWidth?: number;
}

export interface GaugePivotOptions {
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  radius?: number;
}

export interface PaneOptions {
  startAngle?: number;
  endAngle?: number;
  center?: (string | number)[];
  size?: string | number;
  background?: PaneBackgroundOptions | PaneBackgroundOptions[];
}

export interface PaneBackgroundOptions {
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  innerRadius?: string | number;
  outerRadius?: string | number;
  shape?: 'circle' | 'arc';
}

export interface TreemapLevelOptions {
  level?: number;
  color?: string;
  borderColor?: string;
  borderWidth?: number;
  colorByPoint?: boolean;
  colorVariation?: { key?: string; to?: number };
  dataLabels?: DataLabelOptions;
  layoutAlgorithm?: string;
}

/**
 * Confidence-region ellipse for a PCoA / ordination series. Either pass a precomputed
 * polygon (`boundary`) or parametric coordinates (`cx`, `cy`, `rx`, `ry`, `rotation`).
 * The chart folds these bounds into the axis domain so the ellipse always fits
 * inside the plot area.
 */
export interface PCoAEllipseOptions {
  cx?: number;
  cy?: number;
  rx?: number;
  ry?: number;
  rotation?: number;
  boundary?: [number, number][];
  fill?: string;
  fillOpacity?: number;
  stroke?: string;
  strokeWidth?: number;
}

export interface SeriesOptions {
  type?: SeriesType;
  ellipse?: PCoAEllipseOptions;
  name?: string;
  data?: (number | [number, number] | [number, number, number] | [string, number] | PointOptions | null)[];
  id?: string;
  index?: number;
  legendIndex?: number;
  legendType?: 'point' | 'series';
  color?: string;
  colorIndex?: number;
  visible?: boolean;
  showInLegend?: boolean;
  xAxis?: number | string;
  yAxis?: number | string;
  zIndex?: number;
  cursor?: CursorType;
  opacity?: number;
  className?: string;
  lineWidth?: number;
  lineColor?: string;
  dashStyle?: DashStyleType;
  fillColor?: string;
  fillOpacity?: number;
  negativeColor?: string;
  negativeFillColor?: string;
  threshold?: number | null;
  softThreshold?: boolean;
  marker?: MarkerOptions;
  dataLabels?: DataLabelOptions;
  states?: SeriesStatesOptions;
  animation?: boolean | AnimationOptions;
  enableMouseTracking?: boolean;
  stickyTracking?: boolean;
  allowPointSelect?: boolean;
  selected?: boolean;
  stack?: string | number;
  stacking?: 'normal' | 'percent' | 'overlap' | 'stream' | null;
  step?: 'left' | 'center' | 'right' | false;
  connectNulls?: boolean;
  clip?: boolean;
  zones?: ZoneOptions[];
  zoneAxis?: 'x' | 'y';
  linkedTo?: string;
  tooltip?: TooltipOptions;
  turboThreshold?: number;
  cropThreshold?: number;
  pointStart?: number;
  pointInterval?: number;
  pointIntervalUnit?: 'day' | 'month' | 'year';
  pointPlacement?: 'on' | 'between' | number;
  pointPadding?: number;
  groupPadding?: number;
  borderWidth?: number;
  borderColor?: string;
  borderRadius?: number | BorderRadiusOptions;
  colorByPoint?: boolean;
  colors?: string[];
  innerSize?: string | number;
  size?: string | number;
  center?: (string | number)[];
  startAngle?: number;
  endAngle?: number;
  depth?: number;
  minSize?: string | number;
  maxSize?: string | number;
  sizeBy?: 'area' | 'width';
  drilldown?: string;
  shadow?: boolean | { color?: string; offsetX?: number; offsetY?: number; width?: number; opacity?: number };
  linecap?: 'round' | 'square' | 'butt';
  findNearestPointBy?: 'x' | 'xy';
  crisp?: boolean;
  trackByArea?: boolean;
  grouping?: boolean;
  centerInCategory?: boolean;
  maxPointWidth?: number;
  minPointLength?: number;
  pointWidth?: number;
  pointRange?: number;
  showCheckbox?: boolean;
  connectEnds?: boolean;
  getExtremesFromAll?: boolean;
  animationLimit?: number;
  boostThreshold?: number;
  relativeXValue?: boolean;
  jitter?: { x?: number; y?: number };

  displayNegative?: boolean;
  sizeByAbsoluteValue?: boolean;
  zMin?: number;
  zMax?: number;
  zThreshold?: number;

  upColor?: string;
  upLineColor?: string;
  downColor?: string;
  downLineColor?: string;
  sumColor?: string;
  intermediateSumColor?: string;

  streaming?: StreamingOptions;

  onSeries?: string;
  shape?: 'flag' | 'circlepin' | 'squarepin';
  brickSize?: number;
  reversalAmount?: number;
  boxSize?: number;
  lineBreakCount?: number;
  topLine?: { color?: string; fillColor?: string; fillOpacity?: number };
  bottomLine?: { color?: string; fillColor?: string; fillOpacity?: number };

  slicedOffset?: number;
  ignoreHiddenPoint?: boolean;

  dial?: GaugeDialOptions;
  pivot?: GaugePivotOptions;
  wrap?: boolean;
  overshoot?: number;
  pane?: PaneOptions;

  colsize?: number;
  rowsize?: number;
  nullColor?: string;
  interpolation?: boolean;

  layoutAlgorithm?: 'squarified' | 'strip' | 'stripes' | 'sliceAndDice' | 'binary' | 'dice' | 'slice' | 'sliceDice';
  layoutStartingDirection?: 'vertical' | 'horizontal';
  sortIndex?: number;
  levels?: TreemapLevelOptions[];
  alternateStartingDirection?: boolean;
  interactByLeaf?: boolean;
  allowTraversingTree?: boolean;
  allowDrillToNode?: boolean;
  traverseUpButton?: { position?: { align?: AlignType; verticalAlign?: VerticalAlignType; x?: number; y?: number }; theme?: Record<string, any> };
  levelIsConstant?: boolean;
  levelSize?: { unit?: 'weight' | 'percentage' | 'pixels'; value?: number };
  rootId?: string;

  linkColorMode?: 'from' | 'to' | 'gradient';
  linkOpacity?: number;
  nodePadding?: number;
  nodeWidth?: number;
  nodeDistance?: number;
  minLinkWidth?: number;
  curveFactor?: number;
  centerNodes?: boolean;
  spreadFactor?: number;
  draggable?: boolean;

  borderDashStyle?: DashStyleType;

  medianColor?: string;
  medianDashStyle?: DashStyleType;
  medianWidth?: number;
  stemColor?: string;
  stemDashStyle?: DashStyleType;
  stemWidth?: number;
  whiskerColor?: string;
  whiskerDashStyle?: DashStyleType;
  whiskerLength?: string | number;
  whiskerWidth?: number;
  boxDashStyle?: DashStyleType;

  events?: {
    click?: (this: any, event: any) => void;
    mouseOver?: (this: any, event: any) => void;
    mouseOut?: (this: any, event: any) => void;
    legendItemClick?: (this: any, event: any) => boolean | void;
    show?: (this: any, event: any) => void;
    hide?: (this: any, event: any) => void;
    afterAnimate?: (this: any, event: any) => void;
    checkboxClick?: (this: any, event: any) => boolean | void;
  };
  point?: {
    events?: PointOptions['events'];
  };
  keys?: string[];
  [key: string]: any;
}

export interface TooltipOptions {
  enabled?: boolean;
  shared?: boolean;
  split?: boolean;
  useHTML?: boolean;
  followPointer?: boolean;
  followTouchMove?: boolean;
  format?: string;
  headerFormat?: string;
  pointFormat?: string;
  pointFormatter?: (this: { point: any; series: any; x: any; y: any; percentage?: number; total?: number; key?: any; color?: string }) => string;
  footerFormat?: string;
  formatter?: (this: {
    point: any; series: any; x: any; y: any;
    percentage?: number; total?: number; key?: any; color?: string;
    points?: any[];
  }) => string | false;
  positioner?: (labelWidth: number, labelHeight: number, point: any) => { x: number; y: number };
  valueDecimals?: number;
  valuePrefix?: string;
  valueSuffix?: string;
  xDateFormat?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  padding?: number;
  shadow?: boolean;
  style?: CSSObject;
  animation?: boolean;
  hideDelay?: number;
  snap?: number;
  distance?: number;
  outside?: boolean;
  stickOnContact?: boolean;
  zIndex?: number;
  shape?: 'callout' | 'square' | 'circle' | string;
  headerShape?: 'callout' | 'square' | 'circle' | string;
  nullFormat?: string;
  nullFormatter?: (this: { point: any; series: any }) => string;
  className?: string;
  crosshairs?: boolean | CrosshairOptions | [boolean | CrosshairOptions, boolean | CrosshairOptions];
  dateTimeLabelFormats?: Record<string, string>;
}

export interface LegendOptions {
  enabled?: boolean;
  layout?: 'horizontal' | 'vertical' | 'proximate';
  align?: AlignType;
  verticalAlign?: VerticalAlignType;
  floating?: boolean;
  x?: number;
  y?: number;
  margin?: number;
  padding?: number;
  itemMarginTop?: number;
  itemMarginBottom?: number;
  itemDistance?: number;
  itemWidth?: number;
  maxHeight?: number;
  maxWidth?: number;
  lineHeight?: number;
  valueDecimals?: number;
  valueSuffix?: string;
  navigation?: {
    activeColor?: string;
    inactiveColor?: string;
    arrowSize?: number;
    style?: CSSObject;
    animation?: boolean | AnimationOptions;
    enabled?: boolean;
  };
  itemStyle?: CSSObject;
  itemHoverStyle?: CSSObject;
  itemHiddenStyle?: CSSObject;
  itemCheckboxStyle?: CSSObject;
  symbolWidth?: number;
  symbolHeight?: number;
  symbolRadius?: number;
  symbolPadding?: number;
  squareSymbol?: boolean;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  shadow?: boolean;
  reversed?: boolean;
  rtl?: boolean;
  className?: string;
  title?: { text?: string; style?: CSSObject };
  labelFormatter?: (this: {
    name: string; color: string; percentage?: number; total?: number;
    index?: number; legendIndex?: number; options: SeriesOptions;
  }) => string;
  labelFormat?: string;
  useHTML?: boolean;
  width?: number;
  bubbleLegend?: {
    enabled?: boolean;
    borderColor?: string;
    borderWidth?: number;
    color?: string;
    connectorColor?: string;
    connectorDistance?: number;
    connectorWidth?: number;
    legendIndex?: number;
    maxSize?: number;
    minSize?: number;
    ranges?: { value?: number; borderColor?: string; color?: string; connectorColor?: string }[];
    sizeBy?: 'area' | 'width';
    zIndex?: number;
    labels?: { align?: AlignType; format?: string; formatter?: (this: { value: number }) => string; style?: CSSObject };
  };
  events?: {
    itemClick?: (this: any, event: any) => boolean | void;
  };
}

export interface CreditsOptions {
  enabled?: boolean;
  text?: string;
  href?: string;
  position?: { align?: AlignType; verticalAlign?: VerticalAlignType; x?: number; y?: number };
  style?: CSSObject;
}

export interface ExportingOptions {
  enabled?: boolean;
  buttons?: {
    contextButton?: {
      enabled?: boolean;
      menuItems?: string[];
      symbol?: string;
      symbolFill?: string;
      symbolStroke?: string;
      symbolStrokeWidth?: number;
      theme?: Record<string, any>;
      x?: number;
      y?: number;
    };
  };
  filename?: string;
  type?: 'image/png' | 'image/jpeg' | 'image/svg+xml' | 'application/pdf';
  width?: number;
  scale?: number;
  sourceWidth?: number;
  sourceHeight?: number;
  chartOptions?: Partial<KatuChartsOptions>;
  fallbackToExportServer?: boolean;
  printMaxWidth?: number;
  menuClassName?: string;
  menuItemDefinitions?: Record<string, { text?: string; onclick?: () => void }>;
  formAttributes?: Record<string, string>;
  libURL?: string;
  tableCaption?: string | boolean;
  csv?: {
    columnHeaderFormatter?: (item: any, key?: string, keyLength?: number) => string | false;
    dateFormat?: string;
    itemDelimiter?: string;
    lineDelimiter?: string;
    decimalPoint?: string;
  };
}

export interface LoadingOptions {
  hideDuration?: number;
  showDuration?: number;
  labelStyle?: CSSObject;
  style?: CSSObject;
}

export interface NavigatorOptions {
  enabled?: boolean;
  height?: number;
  margin?: number;
  maskFill?: string;
  maskInside?: boolean;
  outlineColor?: string;
  outlineWidth?: number;
  adaptToUpdatedData?: boolean;
  baseSeries?: number | string;
  handles?: {
    backgroundColor?: string;
    borderColor?: string;
    width?: number;
    height?: number;
    enabled?: boolean;
    lineWidth?: number;
    symbols?: string[];
  };
  series?: Partial<SeriesOptions>;
  xAxis?: Partial<AxisOptions>;
  yAxis?: Partial<AxisOptions>;
}

export interface RangeSelectorOptions {
  enabled?: boolean;
  selected?: number;
  allButtonsEnabled?: boolean;
  buttons?: {
    type?: 'millisecond' | 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'ytd' | 'year' | 'all';
    count?: number;
    text?: string;
    title?: string;
    dataGrouping?: { forced?: boolean; units?: [string, number[] | null][] };
    events?: { click?: (this: any, event: any) => void };
  }[];
  inputEnabled?: boolean;
  inputDateFormat?: string;
  inputEditDateFormat?: string;
  inputDateParser?: (value: string) => number;
  inputPosition?: { align?: AlignType; x?: number; y?: number };
  buttonPosition?: { align?: AlignType; x?: number; y?: number };
  buttonSpacing?: number;
  buttonTheme?: Record<string, any>;
  inputBoxBorderColor?: string;
  inputBoxHeight?: number;
  inputBoxWidth?: number;
  inputStyle?: CSSObject;
  labelStyle?: CSSObject;
  floating?: boolean;
  dropdown?: 'always' | 'never' | 'responsive';
  verticalAlign?: VerticalAlignType;
  x?: number;
  y?: number;
}

export interface DrilldownOptions {
  activeAxisLabelStyle?: CSSObject;
  activeDataLabelStyle?: CSSObject;
  animation?: boolean | AnimationOptions;
  allowPointDrilldown?: boolean;
  drillUpButton?: {
    position?: { align?: AlignType; verticalAlign?: VerticalAlignType; x?: number; y?: number };
    relativeTo?: 'plotBox' | 'spacingBox';
    theme?: Record<string, any>;
  };
  breadcrumbs?: {
    format?: string;
    formatter?: (this: { level: number; levelOptions: any }) => string;
    position?: { align?: AlignType; verticalAlign?: VerticalAlignType; x?: number; y?: number };
    showFullPath?: boolean;
    separator?: { text?: string; style?: CSSObject };
    style?: CSSObject;
    floating?: boolean;
    relativeTo?: 'plotBox' | 'spacingBox';
    events?: {
      click?: (this: any, event: any) => void;
    };
  };
  series?: SeriesOptions[];
}

export interface ResponsiveRuleOptions {
  condition: {
    maxWidth?: number;
    maxHeight?: number;
    minWidth?: number;
    minHeight?: number;
    callback?: () => boolean;
  };
  chartOptions: Partial<KatuChartsOptions>;
}

export interface ResponsiveOptions {
  rules?: ResponsiveRuleOptions[];
}

export interface AccessibilityOptions {
  enabled?: boolean;
  description?: string;
  keyboardNavigation?: {
    enabled?: boolean;
    focusBorder?: { enabled?: boolean; style?: CSSObject; margin?: number };
    order?: string[];
    seriesNavigation?: { mode?: 'normal' | 'serialize'; skipNullPoints?: boolean; pointNavigationEnabledThreshold?: number };
  };
  announceNewData?: { enabled?: boolean; minAnnounceInterval?: number; interruptUser?: boolean };
  screenReaderSection?: { beforeChartFormat?: string; afterChartFormat?: string };
  point?: { valueDescriptionFormat?: string; descriptionFormatter?: (point: any) => string };
  series?: { descriptionFormat?: string; describeSingleSeries?: boolean };
  landmarkVerbosity?: 'all' | 'one' | 'disabled';
  highContrastMode?: 'auto' | boolean;
  highContrastTheme?: Record<string, any>;
  typeDescription?: string;
  linkedDescription?: string;
  customComponents?: Record<string, any>;
}

export interface MapNavigationOptions {
  enabled?: boolean;
  enableButtons?: boolean;
  enableDoubleClickZoom?: boolean;
  enableMouseWheelZoom?: boolean;
  enableDrag?: boolean;
  maxZoom?: number;
  buttonOptions?: {
    align?: AlignType;
    verticalAlign?: VerticalAlignType;
    x?: number;
    y?: number;
    theme?: Record<string, any>;
  };
}

export interface ColorAxisOptions {
  min?: number;
  max?: number;
  stops?: [number, string][];
  minColor?: string;
  maxColor?: string;
  type?: 'linear' | 'logarithmic';
  reversed?: boolean;
  labels?: AxisLabelOptions;
  marker?: { color?: string };
  gridLineWidth?: number;
  tickInterval?: number;
  dataClasses?: { from?: number; to?: number; color?: string; name?: string }[];
}

export interface PlotOptionsSeriesOptions extends Omit<SeriesOptions, 'data' | 'id' | 'name'> {}

export interface PlotOptions {
  series?: PlotOptionsSeriesOptions;
  line?: PlotOptionsSeriesOptions;
  spline?: PlotOptionsSeriesOptions;
  area?: PlotOptionsSeriesOptions;
  areaspline?: PlotOptionsSeriesOptions;
  column?: PlotOptionsSeriesOptions;
  bar?: PlotOptionsSeriesOptions;
  scatter?: PlotOptionsSeriesOptions;
  bubble?: PlotOptionsSeriesOptions;
  pie?: PlotOptionsSeriesOptions;
  heatmap?: PlotOptionsSeriesOptions;
  treemap?: PlotOptionsSeriesOptions;
  sunburst?: PlotOptionsSeriesOptions;
  sankey?: PlotOptionsSeriesOptions;
  gauge?: PlotOptionsSeriesOptions;
  solidgauge?: PlotOptionsSeriesOptions;
  candlestick?: PlotOptionsSeriesOptions;
  ohlc?: PlotOptionsSeriesOptions;
  waterfall?: PlotOptionsSeriesOptions;
  boxplot?: PlotOptionsSeriesOptions;
  funnel?: PlotOptionsSeriesOptions;
  pyramid?: PlotOptionsSeriesOptions;
  networkgraph?: PlotOptionsSeriesOptions;
  dependencywheel?: PlotOptionsSeriesOptions;
  timeline?: PlotOptionsSeriesOptions;
  gantt?: PlotOptionsSeriesOptions;
  map?: PlotOptionsSeriesOptions;
  barchartrace?: PlotOptionsSeriesOptions;
  polar?: PlotOptionsSeriesOptions;
  radar?: PlotOptionsSeriesOptions;
  venn?: PlotOptionsSeriesOptions;
  arearange?: PlotOptionsSeriesOptions;
  volcano?: PlotOptionsSeriesOptions;
  manhattan?: PlotOptionsSeriesOptions;
  violin?: PlotOptionsSeriesOptions;
  kaplanmeier?: PlotOptionsSeriesOptions;
  forestplot?: PlotOptionsSeriesOptions;
  sequencelogo?: PlotOptionsSeriesOptions;
  clusteredheatmap?: PlotOptionsSeriesOptions;
  phylotree?: PlotOptionsSeriesOptions;
  circos?: PlotOptionsSeriesOptions;
  heikinashi?: PlotOptionsSeriesOptions;
  hollowcandlestick?: PlotOptionsSeriesOptions;
  volume?: PlotOptionsSeriesOptions;
  baseline?: PlotOptionsSeriesOptions;
  flags?: PlotOptionsSeriesOptions;
  renko?: PlotOptionsSeriesOptions;
  kagi?: PlotOptionsSeriesOptions;
  pointandfigure?: PlotOptionsSeriesOptions;
  linebreak?: PlotOptionsSeriesOptions;
  [key: string]: PlotOptionsSeriesOptions | undefined;
}

export interface KatuChartsOptions {
  chart?: ChartOptions;
  title?: TitleOptions;
  subtitle?: SubtitleOptions;
  xAxis?: AxisOptions | AxisOptions[];
  yAxis?: AxisOptions | AxisOptions[];
  colorAxis?: ColorAxisOptions | ColorAxisOptions[];
  series?: SeriesOptions[];
  tooltip?: TooltipOptions;
  legend?: LegendOptions;
  plotOptions?: PlotOptions;
  credits?: CreditsOptions;
  exporting?: ExportingOptions;
  loading?: LoadingOptions;
  navigator?: NavigatorOptions;
  rangeSelector?: RangeSelectorOptions;
  drilldown?: DrilldownOptions;
  responsive?: ResponsiveOptions;
  accessibility?: AccessibilityOptions;
  colors?: string[];
  lang?: Record<string, string>;
}

export interface InternalAxisConfig extends AxisOptions {
  index: number;
  isX: boolean;
  _inverted?: boolean;
}

export interface InternalSeriesConfig extends SeriesOptions {
  index: number;
  _internalType: SeriesType;
  _xAxisIndex: number;
  _yAxisIndex: number;
  _processedData: PointOptions[];
}

export interface InternalConfig {
  chart: Required<Pick<ChartOptions, 'width' | 'height' | 'backgroundColor' | 'animation' | 'reflow'>> & ChartOptions;
  title: TitleOptions;
  subtitle: SubtitleOptions;
  xAxis: InternalAxisConfig[];
  yAxis: InternalAxisConfig[];
  colorAxis: ColorAxisOptions[];
  series: InternalSeriesConfig[];
  tooltip: TooltipOptions;
  legend: LegendOptions;
  plotOptions: PlotOptions;
  credits: CreditsOptions;
  exporting: ExportingOptions;
  loading: LoadingOptions;
  navigator: NavigatorOptions;
  rangeSelector: RangeSelectorOptions;
  drilldown: DrilldownOptions;
  responsive: ResponsiveOptions;
  accessibility: AccessibilityOptions;
  colors: string[];
}

export interface PlotArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

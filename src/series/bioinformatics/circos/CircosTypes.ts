/**
 * Shared type definitions for the entire Circos visualization system.
 * Used by CircosSeries, all track renderers, and all variant series.
 */

export type CircosTrackType =
  | 'scatter' | 'line' | 'histogram' | 'heatmap' | 'link' | 'highlight'
  | 'stack' | 'text' | 'tile' | 'ribbon' | 'connector' | 'area' | 'glyph'
  | 'lollipop';

export type CircosColorScaleName =
  | 'YlOrRd' | 'Blues' | 'Greens' | 'Reds' | 'Purples' | 'Oranges' | 'Greys'
  | 'RdBu' | 'RdYlGn' | 'RdYlBu' | 'Spectral' | 'PiYG' | 'BrBG' | 'PuOr' | 'PRGn'
  | 'Viridis' | 'Plasma' | 'Inferno' | 'Magma' | 'Cividis' | 'Turbo'
  | 'Warm' | 'Cool' | 'CubehelixDefault';

export type GlyphSymbol =
  | 'circle' | 'triangle-up' | 'triangle-down' | 'diamond' | 'square' | 'cross' | 'star';

export type ConnectorType = 'straight' | 'elbow' | 'bezier';

export type BandType = 'gneg' | 'gpos25' | 'gpos50' | 'gpos75' | 'gpos100' | 'acen' | 'gvar' | 'stalk';

export interface CircosRule {
  condition: (d: CircosDataPoint, index: number) => boolean;
  style: {
    color?: string;
    opacity?: number;
    size?: number;
    show?: boolean;
    symbol?: GlyphSymbol;
    strokeWidth?: number;
    strokeColor?: string;
  };
  flow?: 'stop' | 'continue';
}

export interface CircosTrackAxes {
  show?: boolean;
  count?: number;
  color?: string;
  opacity?: number;
  strokeWidth?: number;
  showValues?: boolean;
  valueFormat?: string;
}

export interface CircosTrackBackground {
  color?: string;
  opacity?: number;
  border?: { color?: string; width?: number };
}

export interface IdeogramBand {
  chr: string;
  start: number;
  end: number;
  type: BandType;
  name?: string;
}

export interface ChromosomeDef {
  id: string;
  length: number;
  color?: string;
  bands?: IdeogramBand[];
  gap?: number;
}

export interface ChromosomeArc {
  id: string;
  startAngle: number;
  endAngle: number;
  length: number;
  color: string;
}

export interface CircosDataPoint {
  chr: string;
  start: number;
  end?: number;
  value?: number;
  sourceChr?: string;
  sourceStart?: number;
  sourceEnd?: number;
  targetChr?: string;
  targetStart?: number;
  targetEnd?: number;
  color?: string;
  opacity?: number;
  label?: string;
  symbol?: GlyphSymbol;
  category?: string;
  layer?: number;
  data?: Record<string, any>;
}

export interface CircosTrack {
  type: CircosTrackType;
  data: CircosDataPoint[];
  innerRadius?: number;
  outerRadius?: number;
  color?: string;
  opacity?: number;
  options?: Record<string, any>;
  rules?: CircosRule[];
  axes?: CircosTrackAxes;
  background?: CircosTrackBackground;
  colorScale?: CircosColorScaleName;
  logScale?: boolean;
  tooltip?: {
    formatter?: (d: CircosDataPoint) => string;
    enabled?: boolean;
  };
}

export interface CircosLayoutConfig {
  gap: number;
  outerRadius: number;
  innerRadius: number;
  trackGap: number;
  showLabels: boolean;
  labelFontSize: number;
  showBands: boolean;
}

export interface TrackRenderOptions {
  animate: boolean;
  duration: number;
  cx: number;
  cy: number;
  canvasThreshold: number;
  events?: any;
  seriesRef?: any;
}

export interface ResolvedStyle {
  color: string;
  opacity: number;
  size: number;
  show: boolean;
  symbol?: GlyphSymbol;
  strokeWidth?: number;
  strokeColor?: string;
}

export const DEFAULT_CHR_COLORS = [
  '#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4',
  '#42d4f4', '#f032e6', '#bfef45', '#fabebe', '#469990',
  '#e6beff', '#9a6324', '#fffac8', '#800000', '#aaffc3',
  '#808000', '#ffd8b1', '#000075', '#a9a9a9', '#000000',
  '#808080', '#ffffff', '#dcbeff', '#ffe119',
];

export const BAND_COLORS: Record<BandType, string> = {
  gneg: '#ffffff',
  gpos25: '#c0c0c0',
  gpos50: '#909090',
  gpos75: '#505050',
  gpos100: '#000000',
  acen: '#cc3333',
  gvar: '#dcdcdc',
  stalk: '#708090',
};

export const DEFAULT_CANVAS_THRESHOLD = 5000;

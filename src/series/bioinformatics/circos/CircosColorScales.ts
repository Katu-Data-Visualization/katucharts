/**
 * Color scale factory mapping named scales to D3 interpolator functions.
 * Supports 24 named color scales across sequential, diverging, and multi-hue categories.
 */

import {
  interpolateYlOrRd, interpolateBlues, interpolateGreens, interpolateReds,
  interpolatePurples, interpolateOranges, interpolateGreys,
  interpolateRdBu, interpolateRdYlGn, interpolateRdYlBu,
  interpolateSpectral, interpolatePiYG, interpolateBrBG,
  interpolatePuOr, interpolatePRGn,
  interpolateViridis, interpolatePlasma, interpolateInferno,
  interpolateMagma, interpolateCividis, interpolateTurbo,
  interpolateWarm, interpolateCool, interpolateCubehelixDefault,
} from 'd3-scale-chromatic';
import type { CircosColorScaleName } from './CircosTypes';

const INTERPOLATORS: Record<CircosColorScaleName, (t: number) => string> = {
  YlOrRd: interpolateYlOrRd,
  Blues: interpolateBlues,
  Greens: interpolateGreens,
  Reds: interpolateReds,
  Purples: interpolatePurples,
  Oranges: interpolateOranges,
  Greys: interpolateGreys,
  RdBu: interpolateRdBu,
  RdYlGn: interpolateRdYlGn,
  RdYlBu: interpolateRdYlBu,
  Spectral: interpolateSpectral,
  PiYG: interpolatePiYG,
  BrBG: interpolateBrBG,
  PuOr: interpolatePuOr,
  PRGn: interpolatePRGn,
  Viridis: interpolateViridis,
  Plasma: interpolatePlasma,
  Inferno: interpolateInferno,
  Magma: interpolateMagma,
  Cividis: interpolateCividis,
  Turbo: interpolateTurbo,
  Warm: interpolateWarm,
  Cool: interpolateCool,
  CubehelixDefault: interpolateCubehelixDefault,
};

export function getColorInterpolator(name?: CircosColorScaleName): (t: number) => string {
  if (!name) return interpolateYlOrRd;
  return INTERPOLATORS[name] || interpolateYlOrRd;
}

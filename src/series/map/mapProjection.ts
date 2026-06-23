/**
 * Shared geographic projection helpers for the map series family
 * (`map`, `mappoint`, `flowmap`). Centralizing projection construction here
 * guarantees that every map-family series in a chart resolves the *identical*
 * projection from the same `mapData` + `plotArea`, so point markers and flow
 * lines land exactly on top of the choropleth basemap.
 */

import {
  geoPath, geoMercator, geoNaturalEarth1, geoOrthographic,
  geoAlbers, geoAlbersUsa, geoEquirectangular, geoEqualEarth,
  geoConicEqualArea, geoConicEquidistant, geoStereographic,
  geoTransverseMercator, geoAzimuthalEqualArea, geoAzimuthalEquidistant,
  geoGnomonic, geoProjection, geoConicConformal,
  type GeoProjection, type GeoPath,
} from 'd3-geo';
import { feature as topojsonFeature } from 'topojson-client';
import type { PlotArea } from '../../types/options';

/** Miller cylindrical projection — not provided by d3-geo core. */
const millerRaw: any = (lambda: number, phi: number) => [lambda, 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * phi))];
millerRaw.invert = (x: number, y: number) => [x, 2.5 * Math.atan(Math.exp(0.8 * y)) - 0.625 * Math.PI];
const geoMiller = (): GeoProjection => geoProjection(millerRaw).scale(108.318) as GeoProjection;

export const projectionMap: Record<string, () => GeoProjection> = {
  'naturalEarth': geoNaturalEarth1,
  'naturalEarth1': geoNaturalEarth1,
  'mercator': geoMercator,
  'orthographic': geoOrthographic,
  'albers': geoAlbers,
  'albersUsa': geoAlbersUsa,
  'equirectangular': geoEquirectangular,
  'equalEarth': geoEqualEarth,
  'conicEqualArea': geoConicEqualArea,
  'conicEquidistant': geoConicEquidistant,
  'stereographic': geoStereographic,
  'transverseMercator': geoTransverseMercator,
  'azimuthalEqualArea': geoAzimuthalEqualArea,
  'azimuthalEquidistant': geoAzimuthalEquidistant,
  'gnomonic': geoGnomonic,
  'Orthographic': geoOrthographic,
  'WebMercator': geoMercator,
  'EqualEarth': geoEqualEarth,
  'LambertConformalConic': geoConicConformal,
  'Miller': geoMiller,
};

/**
 * Normalizes `mapData` into a flat array of GeoJSON features. Accepts a
 * GeoJSON FeatureCollection, a bare feature array, or a TopoJSON topology —
 * TopoJSON is converted on the fly so the same `mapData` option works for
 * either format. `objectName` selects the topology object (defaults to a
 * `countries` object when present, otherwise the first one).
 */
export function resolveFeatures(mapData: any, objectName?: string): any[] {
  if (mapData && mapData.type === 'Topology' && mapData.objects) {
    const objName = objectName
      || (mapData.objects.countries ? 'countries' : Object.keys(mapData.objects)[0]);
    const geo = topojsonFeature(mapData, mapData.objects[objName]) as any;
    return geo.features || [geo];
  }
  return mapData.features || mapData;
}

/** True when the projection should be rendered as an interactive 3D globe. */
export function isGlobeProjection(projName: string, cfg?: any): boolean {
  return String(projName).toLowerCase() === 'orthographic' || !!cfg?.options3d?.enabled;
}

export interface ResolvedMapProjection {
  projection: GeoProjection;
  pathGen: GeoPath;
  features: any[];
  projName: string;
}

/**
 * Builds the d3-geo projection + path generator for a map-family series from
 * its `projection` config, fitting the supplied `mapData` to `plotArea`
 * exactly as the choropleth basemap does. The result is deterministic for a
 * given (mapData, projection, plotArea), so sibling series stay aligned.
 */
export function createMapProjection(
  mapData: any,
  projectionCfg: any,
  plotArea: PlotArea,
  mapDataObject?: string,
): ResolvedMapProjection {
  const features = resolveFeatures(mapData, mapDataObject);
  const featureCollection = { type: 'FeatureCollection' as const, features };

  const projName = projectionCfg?.name || projectionCfg || 'naturalEarth';
  const projFactory = projectionMap[projName] || geoNaturalEarth1;
  const projection = projFactory();

  const projCfg = typeof projectionCfg === 'object' ? projectionCfg : {};
  if (projCfg.rotation) projection.rotate?.(projCfg.rotation);
  if (projCfg.center) projection.center?.(projCfg.center);
  if (projCfg.scale) projection.scale?.(projCfg.scale);
  if (projCfg.parallels && (projection as any).parallels) (projection as any).parallels(projCfg.parallels);

  if (!projCfg.scale) {
    projection.fitSize([plotArea.width, plotArea.height], featureCollection as any);
  }

  const pathGen = geoPath().projection(projection);
  return { projection, pathGen, features, projName: String(projName) };
}

/**
 * Reconfigures a projection into globe (orthographic) mode — centered, scaled
 * to the plot radius and clipped to the visible hemisphere. Returns the radius
 * so callers can size the ocean/atmosphere/specular layers consistently.
 */
export function applyGlobeProjection(projection: GeoProjection, plotArea: PlotArea): number {
  const cx = plotArea.width / 2;
  const cy = plotArea.height / 2;
  const radius = Math.min(plotArea.width, plotArea.height) / 2 - 10;
  projection.translate([cx, cy]).scale(radius).clipAngle(90);
  return radius;
}

/**
 * Resolves a single point's geographic coordinate to `[lon, lat]`, accepting
 * the shapes used by `mappoint`/`flowmap`: `{ lat, lon }`,
 * `{ geometry: { coordinates: [lon, lat] } }`, a bare `[lon, lat]` pair, or a
 * `{ x: lon, y: lat }` fallback. Returns null when no coordinate is present.
 */
export function pointLonLat(p: any): [number, number] | null {
  if (!p) return null;
  if (Array.isArray(p) && p.length >= 2 && typeof p[0] === 'number') return [p[0], p[1]];
  if (p.lon != null && p.lat != null) return [p.lon, p.lat];
  if (p.geometry?.coordinates && Array.isArray(p.geometry.coordinates)) {
    return [p.geometry.coordinates[0], p.geometry.coordinates[1]];
  }
  if (typeof p.x === 'number' && typeof p.y === 'number') return [p.x, p.y];
  return null;
}

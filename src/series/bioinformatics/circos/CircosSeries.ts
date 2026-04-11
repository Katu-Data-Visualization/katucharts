/**
 * Circos plot for circular multi-track genome visualization.
 * Refactored to use modular track renderers and shared layout engine.
 * Supports 14 track types: scatter, line, histogram, heatmap, link, highlight,
 * stack, text, tile, ribbon, connector, area, glyph, lollipop.
 */

import { BaseSeries } from '../../BaseSeries';
import type { InternalSeriesConfig } from '../../../types/options';
import { ENTRY_DURATION } from '../../../core/animationConstants';
import { CircosLayoutEngine } from './CircosLayoutEngine';
import type { ChromosomeDef, CircosTrack, TrackRenderOptions } from './CircosTypes';
import { DEFAULT_CANVAS_THRESHOLD } from './CircosTypes';
import { renderScatterTrack } from './tracks/ScatterTrackRenderer';
import { renderLineTrack } from './tracks/LineTrackRenderer';
import { renderHistogramTrack } from './tracks/HistogramTrackRenderer';
import { renderHeatmapTrack } from './tracks/HeatmapTrackRenderer';
import { renderLinkTrack } from './tracks/LinkTrackRenderer';
import { renderHighlightTrack } from './tracks/HighlightTrackRenderer';
import { renderStackTrack } from './tracks/StackTrackRenderer';
import { renderTextTrack } from './tracks/TextTrackRenderer';
import { renderTileTrack } from './tracks/TileTrackRenderer';
import { renderRibbonTrack } from './tracks/RibbonTrackRenderer';
import { renderConnectorTrack } from './tracks/ConnectorTrackRenderer';
import { renderAreaTrack } from './tracks/AreaTrackRenderer';
import { renderGlyphTrack } from './tracks/GlyphTrackRenderer';
import { renderLollipopTrack } from './tracks/LollipopTrackRenderer';
import { renderTrackAxes } from './tracks/TrackAxesRenderer';
import { renderTrackBackground } from './tracks/TrackBackgroundRenderer';

export class CircosSeries extends BaseSeries {
  constructor(config: InternalSeriesConfig) {
    super(config);
  }

  render(): void {
    const { plotArea } = this.context;
    const animate = this.context.animate;

    const circosData = this.getCircosData();
    if (!circosData) return;

    const { chromosomes, tracks } = circosData;
    const showLabels = this.config.showChromosomeLabels !== false;
    const showBands = this.config.showBands !== false;

    const minDim = Math.min(plotArea.width, plotArea.height);
    const scaledLabelFontSize = minDim < 350 ? 7 : 9;

    const engine = new CircosLayoutEngine(chromosomes, plotArea.width, plotArea.height, {
      gap: this.config.gap ?? 2,
      outerRadius: this.config.outerRadius as number,
      innerRadius: this.config.innerRadius as number,
      trackGap: this.config.trackGap ?? 2,
      showLabels,
      labelFontSize: scaledLabelFontSize,
      showBands,
    });

    const animOpts = typeof this.config.animation === 'object' ? this.config.animation : {};
    const entryDur = animOpts.duration ?? ENTRY_DURATION;

    const mainGroup = this.group.append('g')
      .attr('class', 'katucharts-circos')
      .attr('transform', `translate(${engine.cx},${engine.cy})`);

    engine.renderIdeogram(
      mainGroup, engine.innerR, engine.outerR,
      !!animate, entryDur,
      this.context.events, this,
    );

    if (showBands) {
      engine.renderIdeogramBands(mainGroup, engine.innerR, engine.outerR, !!animate, entryDur);
    }

    if (showLabels) {
      const labelOffset = Math.max(6, Math.min(12, minDim * 0.02));
      engine.renderChromosomeLabels(mainGroup, engine.outerR + labelOffset);
    }

    const trackGap = this.config.trackGap ?? 2;
    const trackAreaOuter = engine.innerR - trackGap;
    const nTracks = tracks.length;
    const trackHeight = nTracks > 0 ? (trackAreaOuter * 0.6) / nTracks : 0;

    for (let ti = 0; ti < nTracks; ti++) {
      const track = tracks[ti];
      const tOuter = trackAreaOuter - ti * (trackHeight + trackGap);
      const tInner = tOuter - trackHeight;

      const actualOuter = track.outerRadius ? tOuter * track.outerRadius : tOuter;
      const actualInner = track.innerRadius ? tOuter * track.innerRadius : tInner;

      const trackGroup = mainGroup.append('g')
        .attr('class', `katucharts-circos-track katucharts-circos-track-${track.type}`);

      if (track.background) {
        renderTrackBackground(trackGroup, track.background, actualInner, actualOuter);
      }
      if (track.axes) {
        renderTrackAxes(trackGroup, track.axes, actualInner, actualOuter);
      }

      const renderOpts: TrackRenderOptions = {
        animate: !!animate,
        duration: entryDur,
        cx: engine.cx,
        cy: engine.cy,
        canvasThreshold: (this.config.canvasThreshold as number) ?? DEFAULT_CANVAS_THRESHOLD,
        events: this.context.events,
        seriesRef: this,
      };

      this.renderTrack(engine, trackGroup, track, actualInner, actualOuter, renderOpts);
    }

    if (animate) {
      this.emitAfterAnimate(entryDur + 100);
    }
  }

  private renderTrack(
    engine: CircosLayoutEngine,
    group: any,
    track: CircosTrack,
    innerR: number,
    outerR: number,
    opts: TrackRenderOptions,
  ): void {
    switch (track.type) {
      case 'scatter': renderScatterTrack(engine, group, track, innerR, outerR, opts); break;
      case 'line': renderLineTrack(engine, group, track, innerR, outerR, opts); break;
      case 'histogram': renderHistogramTrack(engine, group, track, innerR, outerR, opts); break;
      case 'heatmap': renderHeatmapTrack(engine, group, track, innerR, outerR, opts); break;
      case 'link': renderLinkTrack(engine, group, track, innerR, opts); break;
      case 'highlight': renderHighlightTrack(engine, group, track, innerR, outerR, opts); break;
      case 'stack': renderStackTrack(engine, group, track, innerR, outerR, opts); break;
      case 'text': renderTextTrack(engine, group, track, innerR, outerR, opts); break;
      case 'tile': renderTileTrack(engine, group, track, innerR, outerR, opts); break;
      case 'ribbon': renderRibbonTrack(engine, group, track, innerR, opts); break;
      case 'connector': renderConnectorTrack(engine, group, track, innerR, outerR, opts); break;
      case 'area': renderAreaTrack(engine, group, track, innerR, outerR, opts); break;
      case 'glyph': renderGlyphTrack(engine, group, track, innerR, outerR, opts); break;
      case 'lollipop': renderLollipopTrack(engine, group, track, innerR, outerR, opts); break;
    }
  }

  private getCircosData(): { chromosomes: ChromosomeDef[]; tracks: CircosTrack[] } | null {
    if (this.data.length > 0) {
      const first = this.data[0] as any;
      if (first.custom?.chromosomes) {
        return { chromosomes: first.custom.chromosomes, tracks: first.custom.tracks || [] };
      }
    }
    if (this.config.chromosomes) {
      return {
        chromosomes: this.config.chromosomes as ChromosomeDef[],
        tracks: (this.config.tracks as CircosTrack[]) || [],
      };
    }
    return null;
  }

  getDataExtents() {
    return { xMin: 0, xMax: 0, yMin: 0, yMax: 0 };
  }
}

/**
 * Builds the fixed overlay that pins axes, title/subtitle, legend, export button
 * and color axis in place while the plot area scrolls inside a scrollable
 * container. Extracted from `Chart` as a pure function over an explicit context
 * so it has no hidden dependency on chart internals; the caller owns the
 * returned overlay element and its lifecycle.
 */

import type { SVGRenderer } from './SVGRenderer';
import type { LayoutResult } from '../layout/LayoutEngine';
import type { InternalConfig } from '../types/options';
import type { ExportButton } from '../components/ExportButton';

type PlotGroup = ReturnType<SVGRenderer['createGroup']>;

export interface ScrollableOverlayContext {
  container: HTMLElement;
  renderer: SVGRenderer;
  options: InternalConfig;
  plotGroup: PlotGroup;
  layout: LayoutResult;
  chartWidth: number;
  chartHeight: number;
  scrollableInner: HTMLDivElement | null;
  scrollableOuterWidth: number;
  scrollableOuterHeight: number;
  useVerticalScroll: boolean;
  useHorizontalScroll: boolean;
  exportButton: ExportButton | null;
  /** The overlay created by a previous call, removed before rebuilding. */
  previousOverlay: SVGSVGElement | null;
}

export function createFixedAxisOverlay(ctx: ScrollableOverlayContext): SVGSVGElement | null {
  const {
    container, renderer, options, plotGroup, layout,
    chartWidth, chartHeight, scrollableInner,
    scrollableOuterWidth, scrollableOuterHeight,
    useVerticalScroll, useHorizontalScroll, exportButton, previousOverlay,
  } = ctx;

  if (!scrollableInner) return null;
  const mainSvg = renderer.getSVGNode();
  if (!mainSvg) return null;

  /**
   * The export button is moved into the overlay (see below), so before discarding an old overlay we
   * must move that button node back onto the main svg — otherwise it is destroyed with the old
   * overlay and the rebuilt one can't find it, leaving the chart with no export/config button.
   */
  const rescueExportButton = (ov: Element | null | undefined) => {
    const btn = ov?.querySelector('.katucharts-export-button-group');
    if (btn) mainSvg.appendChild(btn);
  };

  if (previousOverlay && previousOverlay.parentElement) {
    rescueExportButton(previousOverlay);
    previousOverlay.parentElement.removeChild(previousOverlay);
  }
  const existingOverlays = container.querySelectorAll(':scope > svg[data-katu-fixed-overlay]');
  existingOverlays.forEach(el => { rescueExportButton(el); el.parentElement?.removeChild(el); });

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const scrollbarW = scrollableInner.offsetWidth - scrollableInner.clientWidth;
  const scrollbarH = scrollableInner.offsetHeight - scrollableInner.clientHeight;
  const overlayWidth = scrollableOuterWidth - scrollbarW;
  const overlayHeight = scrollableOuterHeight - scrollbarH;
  const overlay = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  overlay.setAttribute('data-katu-fixed-overlay', '1');
  overlay.setAttribute('width', overlayWidth.toString());
  overlay.setAttribute('height', overlayHeight.toString());
  overlay.style.position = 'absolute';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.pointerEvents = 'none';
  overlay.style.overflow = 'visible';

  const bgColor = (options.chart.backgroundColor as string) || '#ffffff';
  const plotGroupTransform = (plotGroup as any).attr('transform') || '';
  const plotMatch = plotGroupTransform.match(/translate\(([^,]+),\s*([^)]+)\)/);
  const plotOffsetX = plotMatch ? parseFloat(plotMatch[1]) : 0;
  const plotOffsetY = plotMatch ? parseFloat(plotMatch[2]) : 0;
  const isInverted = !!options.chart.inverted;
  const bottomAxisSelector = isInverted ? '.katucharts-axis-y' : '.katucharts-axis-x';
  const leftAxisSelector = isInverted ? '.katucharts-axis-x' : '.katucharts-axis-y';

  const defs = document.createElementNS(SVG_NS, 'defs');
  const gradientIdPrefix = `katucharts-fixed-grad-${Math.random().toString(36).slice(2, 8)}`;
  const makeGradient = (id: string, x1: string, y1: string, x2: string, y2: string, stops: [string, string][]) => {
    const grad = document.createElementNS(SVG_NS, 'linearGradient');
    grad.setAttribute('id', id);
    grad.setAttribute('x1', x1); grad.setAttribute('y1', y1);
    grad.setAttribute('x2', x2); grad.setAttribute('y2', y2);
    stops.forEach(([offset, stopColor]) => {
      const stop = document.createElementNS(SVG_NS, 'stop');
      stop.setAttribute('offset', offset);
      stop.setAttribute('stop-color', bgColor);
      stop.setAttribute('stop-opacity', stopColor);
      grad.appendChild(stop);
    });
    defs.appendChild(grad);
  };

  const titleArea = layout.titleArea;
  const subtitleArea = layout.subtitleArea;
  const lastTextBottom = Math.max(
    (titleArea?.y ?? 0) + (titleArea?.height ?? 0),
    (subtitleArea?.y ?? 0) + (subtitleArea?.height ?? 0),
  );
  const fadeDistance = 30;
  const topBandHeight = Math.max(0, Math.min(lastTextBottom + fadeDistance, plotOffsetY));
  const topOpaquePct = topBandHeight > 0 ? Math.max(0, Math.min(100, (lastTextBottom / topBandHeight) * 100)) : 100;

  makeGradient(`${gradientIdPrefix}-top`, '0%', '0%', '0%', '100%', [['0%', '1'], [`${topOpaquePct}%`, '1'], ['100%', '0']]);
  makeGradient(`${gradientIdPrefix}-bottom`, '0%', '0%', '0%', '100%', [['0%', '0'], ['30%', '1'], ['100%', '1']]);
  makeGradient(`${gradientIdPrefix}-left`, '0%', '0%', '100%', '0%', [['0%', '1'], ['70%', '1'], ['100%', '0']]);
  overlay.appendChild(defs);

  if (useVerticalScroll && topBandHeight > 0) {
    const topBg = document.createElementNS(SVG_NS, 'rect');
    topBg.setAttribute('x', '0');
    topBg.setAttribute('y', '0');
    topBg.setAttribute('width', overlayWidth.toString());
    topBg.setAttribute('height', topBandHeight.toString());
    topBg.setAttribute('fill', `url(#${gradientIdPrefix}-top)`);
    overlay.appendChild(topBg);
  }

  /**
   * Pin chart title and subtitle in the overlay so they don't scroll with the plot.
   */
  const titleGroups = mainSvg.querySelectorAll('.katucharts-title-group');
  titleGroups.forEach(g => {
    (g as SVGElement).style.visibility = 'hidden';
    const clone = g.cloneNode(true) as SVGGElement;
    (clone as SVGElement).style.visibility = 'visible';
    const xShift = (chartWidth - overlayWidth) / 2;
    if (xShift !== 0) {
      clone.setAttribute('transform', `translate(${-xShift}, 0)`);
    }
    overlay.appendChild(clone);
  });

  if (useVerticalScroll) {
    const bottomAxisOrigY = plotOffsetY + layout.plotArea.height;
    const bottomBandHeight = chartHeight - bottomAxisOrigY + 10;
    const bgRect = document.createElementNS(SVG_NS, 'rect');
    bgRect.setAttribute('x', '0');
    bgRect.setAttribute('y', (overlayHeight - bottomBandHeight).toString());
    bgRect.setAttribute('width', overlayWidth.toString());
    bgRect.setAttribute('height', bottomBandHeight.toString());
    bgRect.setAttribute('fill', `url(#${gradientIdPrefix}-bottom)`);
    overlay.appendChild(bgRect);

    const bottomAxisGroups = mainSvg.querySelectorAll(bottomAxisSelector);
    bottomAxisGroups.forEach(axisG => {
      (axisG as SVGElement).style.visibility = 'hidden';
      const wrapper = document.createElementNS(SVG_NS, 'g') as SVGGElement;
      const fixedY = overlayHeight - (chartHeight - bottomAxisOrigY);
      wrapper.setAttribute('transform', `translate(${plotOffsetX}, ${fixedY})`);
      const clone = axisG.cloneNode(true) as SVGGElement;
      clone.removeAttribute('transform');
      (clone as SVGElement).style.visibility = 'visible';
      wrapper.appendChild(clone);
      overlay.appendChild(wrapper);
    });
  }

  if (useHorizontalScroll) {
    const leftBandWidth = plotOffsetX + 5;
    const bgRect = document.createElementNS(SVG_NS, 'rect');
    bgRect.setAttribute('x', '0');
    bgRect.setAttribute('y', '0');
    bgRect.setAttribute('width', leftBandWidth.toString());
    bgRect.setAttribute('height', overlayHeight.toString());
    bgRect.setAttribute('fill', `url(#${gradientIdPrefix}-left)`);
    overlay.appendChild(bgRect);

    const leftAxisGroups = mainSvg.querySelectorAll(leftAxisSelector);
    leftAxisGroups.forEach(axisG => {
      (axisG as SVGElement).style.visibility = 'hidden';
      const wrapper = document.createElementNS(SVG_NS, 'g') as SVGGElement;
      wrapper.setAttribute('transform', `translate(${plotOffsetX}, ${plotOffsetY})`);
      const clone = axisG.cloneNode(true) as SVGGElement;
      clone.removeAttribute('transform');
      (clone as SVGElement).style.visibility = 'visible';
      wrapper.appendChild(clone);
      overlay.appendChild(wrapper);
    });
  }

  /**
   * Pin legends in the overlay so they don't scroll with the plot content.
   */
  const legendGroups = mainSvg.querySelectorAll('.katucharts-legend');
  legendGroups.forEach(legG => {
    const origTransform = (legG as SVGGElement).getAttribute('transform') || '';
    const m = origTransform.match(/translate\(([^,]+),\s*([^)]+)\)/);
    const origX = m ? parseFloat(m[1]) : 0;
    const origY = m ? parseFloat(m[2]) : 0;
    const xShift = (chartWidth - overlayWidth) / 2;
    const yShift = useVerticalScroll ? (chartHeight - overlayHeight) : 0;
    const newX = origX - xShift;
    const newY = origY - yShift;
    (legG as SVGElement).style.visibility = 'hidden';
    const clone = legG.cloneNode(true) as SVGGElement;
    (clone as SVGElement).style.visibility = 'visible';
    clone.setAttribute('transform', `translate(${newX}, ${newY})`);
    overlay.appendChild(clone);
  });

  /**
   * Move export button into the overlay so it stays visible without scrolling.
   */
  const exportBtnNode = mainSvg.querySelector('.katucharts-export-button-group') as SVGGElement | null;
  if (exportBtnNode && exportButton) {
    const btnTransform = exportBtnNode.getAttribute('transform') || '';
    const btnMatch = btnTransform.match(/translate\(([^,]+),\s*([^)]+)\)/);
    const origX = btnMatch ? parseFloat(btnMatch[1]) : 0;
    const origY = btnMatch ? parseFloat(btnMatch[2]) : 0;
    const newBtnX = origX - (chartWidth - overlayWidth);
    exportBtnNode.setAttribute('transform', `translate(${newBtnX},${origY})`);
    exportBtnNode.style.pointerEvents = 'auto';
    overlay.appendChild(exportBtnNode);
    const btnW = 28;
    const btnH = 22;
    exportButton.repositionCenter(newBtnX + btnW / 2, origY + btnH / 2);
  }

  /**
   * Pin heatmap color axis in the overlay, centered in the visible area.
   */
  const colorAxisGroups = mainSvg.querySelectorAll('.katucharts-color-axis');
  colorAxisGroups.forEach(caG => {
    (caG as SVGElement).style.visibility = 'hidden';
    const clone = caG.cloneNode(true) as SVGGElement;
    (clone as SVGElement).style.visibility = 'visible';
    const wrapper = document.createElementNS(SVG_NS, 'g') as SVGGElement;
    const wrapperX = overlayWidth / 2 - layout.plotArea.width / 2;
    wrapper.setAttribute('transform', `translate(${wrapperX},${plotOffsetY})`);
    wrapper.appendChild(clone);
    overlay.appendChild(wrapper);
  });

  /**
   * Pin the credits watermark in the overlay. It is rendered at the foot of the full (tall) plot, so on a
   * vertically scrolled chart it sits at the very bottom of the scroll content — exactly where the opaque
   * bottom band above is drawn, which hides it once the user scrolls down to it. Cloning it into the fixed
   * overlay keeps it pinned to the bottom-right of the visible area, on top of the band. The original is
   * only hidden (not removed) so the credits' own tamper-protection still finds it in the main svg.
   */
  const creditsNode = mainSvg.querySelector('.katucharts-credits') as SVGTextElement | null;
  if (creditsNode) {
    const origX = parseFloat(creditsNode.getAttribute('x') || '0');
    const origY = parseFloat(creditsNode.getAttribute('y') || '0');
    (creditsNode as unknown as SVGElement).style.visibility = 'hidden';
    const clone = creditsNode.cloneNode(true) as SVGTextElement;
    (clone as unknown as SVGElement).style.visibility = 'visible';
    clone.setAttribute('x', String(overlayWidth - (chartWidth - origX)));
    clone.setAttribute('y', String(overlayHeight - (chartHeight - origY)));
    overlay.appendChild(clone);
  }

  container.appendChild(overlay);
  return overlay;
}

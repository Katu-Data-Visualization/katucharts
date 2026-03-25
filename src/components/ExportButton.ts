/**
 * Gear icon button with radial animated menu for chart export actions.
 */

import { Selection } from 'd3-selection';
import type { ExportingOptions } from '../types/options';

interface MenuItem {
  key: string;
  label: string;
  icon: string[];
}

const FILE_BASE_PATHS = [
  'M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z',
  'M14 2v5a1 1 0 0 0 1 1h5',
];

const ICON_PATHS: Record<string, string[]> = {
  downloadPNG: FILE_BASE_PATHS,
  downloadJPEG: FILE_BASE_PATHS,
  downloadSVG: FILE_BASE_PATHS,
  downloadPDF: FILE_BASE_PATHS,
  downloadCSV: FILE_BASE_PATHS,
  downloadXLS: FILE_BASE_PATHS,
  viewDataTable: [
    'M3 3h18v18H3z', 'M12 3v18', 'M3 9h18', 'M3 15h18',
  ],
  viewFullScreen: [
    'M8 3H5a2 2 0 0 0-2 2v3', 'M21 8V5a2 2 0 0 0-2-2h-3',
    'M3 16v3a2 2 0 0 0 2 2h3', 'M16 21h3a2 2 0 0 0 2-2v-3',
  ],
  printChart: [
    'M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2',
    'M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6',
    'M6 14h12v8H6z',
  ],
};

const FILE_EXT_LABELS: Record<string, string> = {
  downloadPNG: 'PNG',
  downloadJPEG: 'JPG',
  downloadSVG: 'SVG',
  downloadPDF: 'PDF',
  downloadCSV: 'CSV',
  downloadXLS: 'XLS',
};

const MENU_LABELS: Record<string, string> = {
  downloadPNG: 'Download PNG',
  downloadJPEG: 'Download JPEG',
  downloadSVG: 'Download SVG',
  downloadPDF: 'Download PDF',
  downloadCSV: 'Download CSV',
  downloadXLS: 'Download XLS',
  viewDataTable: 'Data table',
  viewFullScreen: 'Fullscreen',
  printChart: 'Print',
};

export class ExportButton {
  private group: Selection<SVGGElement, unknown, null, undefined> | null = null;
  private gearGroup: Selection<SVGGElement, unknown, null, undefined> | null = null;
  private radialContainer: HTMLDivElement | null = null;
  private isOpen = false;
  private onExport: (type: string) => void;
  private container: HTMLElement;
  private config: ExportingOptions;
  private chartWidth: number;
  private chartHeight: number;
  private outsideClickHandler: ((e: MouseEvent) => void) | null = null;
  private btnCenterX = 0;
  private btnCenterY = 0;

  constructor(
    config: ExportingOptions,
    svg: Selection<SVGSVGElement, unknown, null, undefined>,
    container: HTMLElement,
    chartWidth: number,
    chartHeight: number,
    onExport: (type: string) => void,
  ) {
    this.config = config;
    this.container = container;
    this.chartWidth = chartWidth;
    this.chartHeight = chartHeight;
    this.onExport = onExport;

    const btn = config.buttons?.contextButton;
    if (btn?.enabled === false) return;

    const btnTheme = btn?.theme || {};
    const btnWidth = (btnTheme.width as number) ?? 28;
    const btnHeight = (btnTheme.height as number) ?? 22;
    const x = chartWidth + (btn?.x ?? -10) - btnWidth;
    const y = btn?.y ?? 10;
    const stroke = btn?.symbolStroke ?? '#666666';
    const strokeWidth = btn?.symbolStrokeWidth ?? 3;
    const symbolFill = btn?.symbolFill ?? stroke;
    const btnFill = (btnTheme.fill as string) ?? 'transparent';
    const btnStroke = (btnTheme.stroke as string) ?? 'none';
    const btnRx = (btnTheme.r as number) ?? 3;
    const hoverFill = (btnTheme['states.hover.fill'] as string) ?? '#e6e6e6';

    this.btnCenterX = x + btnWidth / 2;
    this.btnCenterY = y + btnHeight / 2;

    this.group = svg.append('g')
      .attr('class', 'katucharts-export-button-group')
      .attr('transform', `translate(${x},${y})`)
      .style('cursor', 'pointer');

    this.group.append('rect')
      .attr('class', 'katucharts-export-btn-bg')
      .attr('width', btnWidth)
      .attr('height', btnHeight)
      .attr('rx', btnRx)
      .attr('fill', btnFill)
      .attr('stroke', btnStroke);

    if (btnTheme.padding !== undefined) {
      this.group.select('.katucharts-export-btn-bg')
        .attr('x', -(btnTheme.padding as number))
        .attr('y', -(btnTheme.padding as number))
        .attr('width', btnWidth + (btnTheme.padding as number) * 2)
        .attr('height', btnHeight + (btnTheme.padding as number) * 2);
    }

    const symbolType = btn?.symbol;

    this.gearGroup = this.group.append('g')
      .attr('class', 'katucharts-gear-icon')
      .style('transform-origin', `${btnWidth / 2}px ${btnHeight / 2}px`)
      .style('transition', 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)');

    if (symbolType === 'circle') {
      this.gearGroup.append('circle')
        .attr('cx', btnWidth / 2).attr('cy', btnHeight / 2)
        .attr('r', Math.min(btnWidth, btnHeight) / 3)
        .attr('fill', symbolFill)
        .attr('stroke', stroke)
        .attr('stroke-width', strokeWidth);
    } else if (symbolType === 'menu') {
      const lineX1 = Math.round(btnWidth * 0.21);
      const lineX2 = Math.round(btnWidth * 0.79);
      for (let i = 0; i < 3; i++) {
        this.gearGroup.append('line')
          .attr('x1', lineX1)
          .attr('x2', lineX2)
          .attr('y1', Math.round(btnHeight * 0.27) + i * Math.round(btnHeight * 0.23))
          .attr('y2', Math.round(btnHeight * 0.27) + i * Math.round(btnHeight * 0.23))
          .attr('stroke', stroke)
          .attr('stroke-width', strokeWidth)
          .attr('stroke-linecap', 'round');
      }
    } else {
      const s = Math.min(btnWidth, btnHeight);
      const cx = btnWidth / 2;
      const cy = btnHeight / 2;
      const teeth = 8;
      const outerR = s * 0.44;
      const innerR = s * 0.30;
      const toothH = s * 0.12;
      const toothW = Math.PI / (teeth * 1.6);
      let d = '';
      for (let i = 0; i < teeth; i++) {
        const a = (i / teeth) * Math.PI * 2 - Math.PI / 2;
        const pts = [
          [innerR, a - toothW * 1.2],
          [outerR + toothH, a - toothW],
          [outerR + toothH, a + toothW],
          [innerR, a + toothW * 1.2],
        ];
        for (const [r, ang] of pts) {
          const px = cx + Math.cos(ang) * r;
          const py = cy + Math.sin(ang) * r;
          d += (d === '' ? 'M' : 'L') + px.toFixed(2) + ',' + py.toFixed(2);
        }
      }
      d += 'Z';

      const defs = svg.select('defs').empty()
        ? svg.append('defs')
        : svg.select('defs');

      const glassGrad = defs.append('linearGradient')
        .attr('id', 'katu-gear-glass')
        .attr('x1', '0').attr('y1', '0')
        .attr('x2', '1').attr('y2', '1');
      glassGrad.append('stop').attr('offset', '0%').attr('stop-color', '#aaa').attr('stop-opacity', '0.7');
      glassGrad.append('stop').attr('offset', '45%').attr('stop-color', '#999').attr('stop-opacity', '0.45');
      glassGrad.append('stop').attr('offset', '100%').attr('stop-color', '#888').attr('stop-opacity', '0.35');

      const highlightGrad = defs.append('radialGradient')
        .attr('id', 'katu-gear-highlight')
        .attr('cx', '0.35').attr('cy', '0.3').attr('r', '0.65');
      highlightGrad.append('stop').attr('offset', '0%').attr('stop-color', '#fff').attr('stop-opacity', '0.6');
      highlightGrad.append('stop').attr('offset', '50%').attr('stop-color', '#fff').attr('stop-opacity', '0.1');
      highlightGrad.append('stop').attr('offset', '100%').attr('stop-color', '#fff').attr('stop-opacity', '0');

      this.gearGroup.append('path')
        .attr('d', d)
        .attr('fill', 'url(#katu-gear-glass)')
        .attr('stroke', 'rgba(255,255,255,0.5)')
        .attr('stroke-width', strokeWidth * 0.4)
        .attr('stroke-linejoin', 'round')
        .style('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))');

      this.gearGroup.append('path')
        .attr('d', d)
        .attr('fill', 'url(#katu-gear-highlight)')
        .attr('stroke', 'none')
        .style('pointer-events', 'none');

      this.gearGroup.append('circle')
        .attr('cx', cx).attr('cy', cy).attr('r', s * 0.15)
        .attr('fill', 'rgba(255,255,255,0.6)')
        .attr('stroke', 'rgba(255,255,255,0.4)')
        .attr('stroke-width', '0.5');

      const glassHoverGrad = defs.append('radialGradient')
        .attr('id', 'katu-gear-hover-bg')
        .attr('cx', '0.4').attr('cy', '0.35').attr('r', '0.65');
      glassHoverGrad.append('stop').attr('offset', '0%').attr('stop-color', '#fff').attr('stop-opacity', '0.35');
      glassHoverGrad.append('stop').attr('offset', '50%').attr('stop-color', '#eef2ff').attr('stop-opacity', '0.15');
      glassHoverGrad.append('stop').attr('offset', '100%').attr('stop-color', '#dde6ff').attr('stop-opacity', '0.08');

      const hoverR = s * 0.85;

      const hoverCircle = this.group.insert('circle', '.katucharts-gear-icon')
        .attr('class', 'katucharts-gear-hover-bg')
        .attr('cx', btnWidth / 2).attr('cy', btnHeight / 2)
        .attr('r', hoverR)
        .attr('fill', 'url(#katu-gear-hover-bg)')
        .attr('stroke', 'rgba(255,255,255,0.6)')
        .attr('stroke-width', '1.5')
        .style('filter', 'drop-shadow(0 0 10px rgba(200,225,255,0.5)) drop-shadow(0 2px 6px rgba(0,0,0,0.08))')
        .style('opacity', '0')
        .style('transition', 'opacity 0.25s ease');

      const hoverHighlight = this.group.insert('circle', '.katucharts-gear-icon')
        .attr('class', 'katucharts-gear-hover-highlight')
        .attr('cx', btnWidth / 2).attr('cy', btnHeight / 2)
        .attr('r', hoverR)
        .attr('fill', 'none')
        .attr('stroke', 'rgba(255,255,255,0.8)')
        .attr('stroke-width', '1.5')
        .style('filter', 'drop-shadow(0 0 4px rgba(255,255,255,0.4))')
        .style('opacity', '0')
        .style('transition', 'opacity 0.25s ease');
    }

    this.group
      .on('mouseenter', () => {
        this.group!.select('.katucharts-gear-hover-bg').style('opacity', '1');
        this.group!.select('.katucharts-gear-hover-highlight').style('opacity', '1');
      })
      .on('mouseleave', () => {
        this.group!.select('.katucharts-gear-hover-bg').style('opacity', '0');
        this.group!.select('.katucharts-gear-hover-highlight').style('opacity', '0');
      })
      .on('click', (event: MouseEvent) => {
        event.stopPropagation();
        this.toggle();
      });
  }

  private toggle(): void {
    if (this.isOpen) {
      this.closeMenu();
    } else {
      this.openMenu();
    }
  }

  private openMenu(): void {
    this.isOpen = true;

    if (this.gearGroup) {
      this.gearGroup.style('transform', 'rotate(90deg)');
    }

    const btn = this.config.buttons?.contextButton;
    const rawItems = btn?.menuItems ?? [
      'downloadPNG', 'downloadJPEG', 'downloadSVG', 'downloadPDF',
      'separator',
      'viewFullScreen', 'printChart',
    ];

    const items: MenuItem[] = rawItems
      .filter(k => k !== 'separator')
      .map(k => ({ key: k, label: MENU_LABELS[k] || k, icon: ICON_PATHS[k] || [] }));

    this.radialContainer = document.createElement('div');
    Object.assign(this.radialContainer.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: '1000',
    });

    const mapSize = 64;
    const mapCanvas = document.createElement('canvas');
    mapCanvas.width = mapSize;
    mapCanvas.height = mapSize;
    const mapCtx = mapCanvas.getContext('2d')!;
    const imgData = mapCtx.createImageData(mapSize, mapSize);
    const px = imgData.data;
    let maxS = 0;
    const raw: number[] = [];
    for (let i = 0; i < px.length; i += 4) {
      const xi = (i / 4) % mapSize;
      const yi = Math.floor(i / 4 / mapSize);
      const ux = xi / mapSize - 0.5;
      const uy = yi / mapSize - 0.5;
      const dist = Math.sqrt(ux * ux + uy * uy);
      const edge = Math.max(0, Math.min(1, (0.48 - dist) / 0.15));
      const s = edge * edge * (3 - 2 * edge);
      const dx = ux * s * mapSize;
      const dy = uy * s * mapSize;
      maxS = Math.max(maxS, Math.abs(dx), Math.abs(dy));
      raw.push(dx, dy);
    }
    maxS *= 0.5;
    let ri = 0;
    for (let i = 0; i < px.length; i += 4) {
      px[i] = (raw[ri++] / maxS + 0.5) * 255;
      px[i + 1] = (raw[ri++] / maxS + 0.5) * 255;
      px[i + 2] = 0;
      px[i + 3] = 255;
    }
    mapCtx.putImageData(imgData, 0, 0);
    const mapDataUrl = mapCanvas.toDataURL();

    const svgNS = 'http://www.w3.org/2000/svg';
    const filterSvg = document.createElementNS(svgNS, 'svg');
    filterSvg.setAttribute('width', '0');
    filterSvg.setAttribute('height', '0');
    filterSvg.style.position = 'absolute';
    const defs = document.createElementNS(svgNS, 'defs');
    const filter = document.createElementNS(svgNS, 'filter');
    filter.setAttribute('id', 'katu-glass-lens');
    filter.setAttribute('filterUnits', 'userSpaceOnUse');
    filter.setAttribute('color-interpolation-filters', 'sRGB');
    filter.setAttribute('x', '0');
    filter.setAttribute('y', '0');
    filter.setAttribute('width', '44');
    filter.setAttribute('height', '44');
    const feImg = document.createElementNS(svgNS, 'feImage');
    feImg.setAttributeNS('http://www.w3.org/1999/xlink', 'href', mapDataUrl);
    feImg.setAttribute('width', '44');
    feImg.setAttribute('height', '44');
    feImg.setAttribute('result', 'lens_map');
    const feDisp = document.createElementNS(svgNS, 'feDisplacementMap');
    feDisp.setAttribute('in', 'SourceGraphic');
    feDisp.setAttribute('in2', 'lens_map');
    feDisp.setAttribute('scale', String(Math.round(maxS / 1)));
    feDisp.setAttribute('xChannelSelector', 'R');
    feDisp.setAttribute('yChannelSelector', 'G');
    filter.appendChild(feImg);
    filter.appendChild(feDisp);
    defs.appendChild(filter);
    filterSvg.appendChild(defs);
    this.radialContainer.appendChild(filterSvg);

    this.container.appendChild(this.radialContainer);

    const cx = this.btnCenterX;
    const cy = this.btnCenterY;
    const radius = 76;
    const count = items.length;

    const startAngle = 100 * (Math.PI / 180);
    const endAngle = 280 * (Math.PI / 180);
    const customDefs = this.config.menuItemDefinitions || {};

    items.forEach((item, i) => {
      const angle = count > 1
        ? startAngle + (endAngle - startAngle) * (i / (count - 1))
        : Math.PI;
      const tx = cx + Math.cos(angle) * radius;
      const ty = cy + Math.sin(angle) * radius;

      const dx = tx - cx;
      const dy = ty - cy;

      const el = document.createElement('div');
      el.className = 'katucharts-radial-btn';
      Object.assign(el.style, {
        position: 'absolute',
        left: `${cx}px`,
        top: `${cy}px`,
        width: '44px',
        height: '44px',
        marginLeft: '-22px',
        marginTop: '-22px',
        borderRadius: '50%',
        background: 'linear-gradient(160deg, rgba(255,255,255,0.92) 0%, rgba(240,240,255,0.82) 40%, rgba(255,255,255,0.75) 100%)',
        backdropFilter: 'url(#katu-glass-lens) blur(0.5px) contrast(1.15) brightness(1.05) saturate(1.2)',
        WebkitBackdropFilter: 'url(#katu-glass-lens) blur(0.5px) contrast(1.15) brightness(1.05) saturate(1.2)',
        border: '1.5px solid rgba(255, 255, 255, 0.4)',
        borderTopColor: 'rgba(255, 255, 255, 0.8)',
        borderLeftColor: 'rgba(255, 255, 255, 0.55)',
        borderBottomColor: 'rgba(0, 0, 0, 0.04)',
        borderRightColor: 'rgba(0, 0, 0, 0.02)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        pointerEvents: 'auto',
        transform: 'translate(0px, 0px) scale(0.3)',
        opacity: '0',
        willChange: 'transform, opacity',
        transition: `transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 40}ms, opacity 0.2s ease ${i * 40}ms, background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease`,
        boxShadow: '0 4px 8px rgba(0,0,0,0.2), inset 0 -6px 12px rgba(0,0,0,0.1), inset 0 2px 4px rgba(255,255,255,0.4)',
      });
      el.dataset.dx = String(dx);
      el.dataset.dy = String(dy);

      const highlight = document.createElement('div');
      Object.assign(highlight.style, {
        position: 'absolute',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        borderRadius: '50%',
        background: 'radial-gradient(ellipse 70% 50% at 35% 25%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 70%), radial-gradient(ellipse 60% 40% at 70% 80%, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 70%)',
        boxShadow: 'inset 1.5px 1.5px 3px rgba(255,255,255,0.5), inset -0.5px -0.5px 2px rgba(0,0,0,0.06)',
        pointerEvents: 'none',
        overflow: 'hidden',
      });
      el.appendChild(highlight);

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('width', '30');
      svg.setAttribute('height', '30');
      svg.style.overflow = 'visible';
      svg.style.position = 'relative';
      svg.style.zIndex = '1';

      const paths: SVGPathElement[] = [];
      const textEls: SVGTextElement[] = [];
      for (const d of item.icon) {
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', d);
        p.setAttribute('fill', 'none');
        p.setAttribute('stroke', '#333333');
        p.setAttribute('stroke-width', '2');
        p.setAttribute('stroke-linecap', 'round');
        p.setAttribute('stroke-linejoin', 'round');
        svg.appendChild(p);
        paths.push(p);
      }

      const extLabel = FILE_EXT_LABELS[item.key];
      if (extLabel) {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', '12');
        text.setAttribute('y', '16.5');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', '5.5');
        text.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif');
        text.setAttribute('font-weight', '700');
        text.setAttribute('fill', '#333333');
        text.setAttribute('stroke', 'none');
        text.textContent = extLabel;
        svg.appendChild(text);
        textEls.push(text);
      }

      el.appendChild(svg);

      const tooltip = document.createElement('div');
      tooltip.textContent = item.label;

      const angleDeg = angle * (180 / Math.PI);
      const tipPos: Record<string, string> = {
        position: 'absolute',
        backgroundColor: 'rgba(30, 30, 30, 0.45)',
        backdropFilter: 'blur(20px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
        color: '#ffffff',
        padding: '4px 10px',
        borderRadius: '8px',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        fontSize: '11px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontWeight: '500',
        letterSpacing: '0.2px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.12), inset 0 0.5px 0 rgba(255,255,255,0.1)',
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
        opacity: '0',
        transition: 'opacity 0.15s ease, transform 0.15s ease',
      };

      if (angleDeg > 60 && angleDeg < 120) {
        tipPos.top = 'calc(100% + 6px)';
        tipPos.left = '50%';
        tipPos.transform = 'translateX(-50%) scale(0.8)';
      } else if (angleDeg >= 120 && angleDeg <= 240) {
        tipPos.right = 'calc(100% + 6px)';
        tipPos.top = '50%';
        tipPos.transform = 'translateY(-50%) scale(0.8)';
      } else if (angleDeg > 240 && angleDeg < 300) {
        tipPos.bottom = 'calc(100% + 6px)';
        tipPos.left = '50%';
        tipPos.transform = 'translateX(-50%) scale(0.8)';
      } else {
        tipPos.left = 'calc(100% + 6px)';
        tipPos.top = '50%';
        tipPos.transform = 'translateY(-50%) scale(0.8)';
      }

      Object.assign(tooltip.style, tipPos);
      el.appendChild(tooltip);

      const showTransform = tipPos.transform!.replace('scale(0.8)', 'scale(1)');
      const hideTransform = tipPos.transform!;

      el.addEventListener('mouseenter', () => {
        el.style.background = 'linear-gradient(160deg, rgba(210,230,255,0.9) 0%, rgba(200,225,255,0.8) 40%, rgba(195,220,255,0.72) 100%)';
        el.style.borderColor = 'rgba(210, 230, 255, 0.85)';
        el.style.boxShadow = '0 0 20px rgba(200,225,255,0.7), 0 0 8px rgba(200,225,255,0.5), 0 4px 12px rgba(0,0,0,0.06), 0 0 0 1px rgba(210,230,255,0.35), inset 0 2px 4px rgba(255,255,255,0.6), inset 0 -1px 2px rgba(0,0,0,0.02)';
        paths.forEach(p => p.setAttribute('stroke', '#1a4a8a'));
        textEls.forEach(t => t.setAttribute('fill', '#1a4a8a'));
        tooltip.style.opacity = '1';
        tooltip.style.transform = showTransform;
      });
      el.addEventListener('mouseleave', () => {
        el.style.background = 'linear-gradient(160deg, rgba(255,255,255,0.72) 0%, rgba(240,240,255,0.45) 40%, rgba(255,255,255,0.35) 100%)';
        el.style.borderColor = 'rgba(255, 255, 255, 0.4)';
        el.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2), inset 0 -6px 12px rgba(0,0,0,0.1), inset 0 2px 4px rgba(255,255,255,0.4)';
        paths.forEach(p => p.setAttribute('stroke', '#333333'));
        textEls.forEach(t => t.setAttribute('fill', '#333333'));
        tooltip.style.opacity = '0';
        tooltip.style.transform = hideTransform;
      });
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeMenu();
        const customDef = customDefs[item.key];
        if (customDef?.onclick) {
          customDef.onclick();
        } else {
          this.onExport(item.key);
        }
      });

      this.radialContainer!.appendChild(el);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.style.transform = `translate(${dx}px, ${dy}px) scale(1)`;
          el.style.opacity = '1';
        });
      });
    });

    this.outsideClickHandler = (e: MouseEvent) => {
      if (this.radialContainer && !this.radialContainer.contains(e.target as Node)) {
        this.closeMenu();
      }
    };
    setTimeout(() => {
      document.addEventListener('click', this.outsideClickHandler!);
    }, 0);
  }

  private closeMenu(): void {
    this.isOpen = false;

    if (this.gearGroup) {
      this.gearGroup.style('transform', 'rotate(0deg)');
    }

    if (this.radialContainer) {
      const cx = this.btnCenterX;
      const cy = this.btnCenterY;
      const buttons = this.radialContainer.querySelectorAll<HTMLElement>('.katucharts-radial-btn');
      buttons.forEach((btn, i) => {
        btn.style.transition = `transform 0.25s cubic-bezier(0.4, 0, 1, 1) ${i * 20}ms, opacity 0.2s ease ${i * 20}ms`;
        btn.style.transform = 'translate(0px, 0px) scale(0.3)';
        btn.style.opacity = '0';
      });

      const container = this.radialContainer;
      setTimeout(() => {
        container.remove();
      }, 400);
      this.radialContainer = null;
    }

    if (this.outsideClickHandler) {
      document.removeEventListener('click', this.outsideClickHandler);
      this.outsideClickHandler = null;
    }
  }

  updatePosition(chartWidth: number, chartHeight: number): void {
    this.chartWidth = chartWidth;
    this.chartHeight = chartHeight;

    if (!this.group) return;
    const btn = this.config.buttons?.contextButton;
    const btnTheme = btn?.theme || {};
    const btnWidth = (btnTheme.width as number) ?? 28;
    const btnHeight = (btnTheme.height as number) ?? 22;
    const x = chartWidth + (btn?.x ?? -10) - btnWidth;
    const y = btn?.y ?? 10;
    this.group.attr('transform', `translate(${x},${y})`);
    this.btnCenterX = x + btnWidth / 2;
    this.btnCenterY = y + btnHeight / 2;
    if (this.isOpen) this.closeMenu();
  }

  destroy(): void {
    this.closeMenu();
    if (this.group) {
      this.group.remove();
      this.group = null;
    }
  }
}

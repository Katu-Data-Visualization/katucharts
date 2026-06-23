/**
 * Renders the chart title and subtitle — as SVG `<text>` (with word wrapping)
 * or, when `useHTML` is set, as absolutely-positioned HTML overlays. Extracted
 * from `Chart` as pure functions over an explicit context so the rendering has
 * no hidden dependency on chart internals.
 */

import type { SVGRenderer } from '../core/SVGRenderer';
import type { LayoutResult } from '../layout/LayoutEngine';
import type { InternalConfig } from '../types/options';
import { parseFontSizePx } from '../utils/chartText';

type TitleGroup = ReturnType<SVGRenderer['createGroup']>;

export interface TitleRenderContext {
  titleGroup: TitleGroup;
  container: HTMLElement;
  options: InternalConfig;
  layout: LayoutResult;
  chartWidth: number;
}

function titleX(ctx: TitleRenderContext, align?: string): number {
  if (align === 'left') return ctx.layout.titleArea.x;
  if (align === 'right') return ctx.layout.titleArea.x + ctx.layout.titleArea.width;
  return ctx.chartWidth / 2;
}

function textAnchor(align?: string): string {
  if (align === 'left') return 'start';
  if (align === 'right') return 'end';
  return 'middle';
}

function wrapSvgText(textEl: any, maxWidth: number, x: number, fontSize: number): void {
  const node = textEl.node() as SVGTextElement;
  if (!node || maxWidth <= 0) return;

  try {
    const textLength = node.getComputedTextLength();
    if (textLength <= maxWidth) return;
  } catch {
    return;
  }

  const fullText = textEl.text();
  const words = fullText.split(/\s+/);
  if (words.length <= 1) return;

  const lineHeight = fontSize * 1.3;
  textEl.text(null);

  let line: string[] = [];
  let tspan = textEl.append('tspan')
    .attr('x', x)
    .attr('dy', 0);

  for (const word of words) {
    line.push(word);
    tspan.text(line.join(' '));
    try {
      if (tspan.node().getComputedTextLength() > maxWidth && line.length > 1) {
        line.pop();
        tspan.text(line.join(' '));
        line = [word];
        tspan = textEl.append('tspan')
          .attr('x', x)
          .attr('dy', lineHeight)
          .text(word);
      }
    } catch {
      break;
    }
  }
}

export function renderTitles(ctx: TitleRenderContext): void {
  const { titleGroup, container, options, layout, chartWidth } = ctx;
  titleGroup.selectAll('*').remove();
  container.querySelectorAll('.katucharts-title-html, .katucharts-subtitle-html').forEach(el => el.remove());

  if (options.title?.text) {
    const titleOpts = options.title;
    const fontSize = titleOpts.style?.fontSize as string || '18px';

    if (titleOpts.useHTML) {
      const div = document.createElement('div');
      div.className = 'katucharts-title-html';
      div.innerHTML = titleOpts.text!;
      div.style.cssText = `position:absolute;top:${layout.titleArea.y + 5}px;left:0;width:100%;text-align:${titleOpts.align || 'center'};color:${titleOpts.style?.color as string || '#333333'};font-size:${fontSize};font-weight:${titleOpts.style?.fontWeight as string || 'bold'};pointer-events:none;box-sizing:border-box;padding:0 22px;`;
      container.appendChild(div);
    } else {
      const x = titleX(ctx, titleOpts.align);
      const maxWidth = chartWidth + (titleOpts.widthAdjust ?? -44);
      const titleEl = titleGroup.append('text')
        .attr('class', 'katucharts-chart-title')
        .attr('x', x)
        .attr('y', layout.titleArea.y + 20)
        .attr('text-anchor', textAnchor(titleOpts.align))
        .attr('fill', titleOpts.style?.color as string || '#333333')
        .attr('font-size', fontSize)
        .attr('font-weight', titleOpts.style?.fontWeight as string || 'bold')
        .text(titleOpts.text!);
      wrapSvgText(titleEl, maxWidth, x, parseFontSizePx(fontSize));
    }
  }

  if (options.subtitle?.text) {
    const subOpts = options.subtitle;
    const fontSize = subOpts.style?.fontSize as string || '12px';

    if (subOpts.useHTML) {
      const div = document.createElement('div');
      div.className = 'katucharts-subtitle-html';
      div.innerHTML = subOpts.text!;
      div.style.cssText = `position:absolute;top:${layout.subtitleArea.y + 5}px;left:0;width:100%;text-align:${subOpts.align || 'center'};color:${subOpts.style?.color as string || '#666666'};font-size:${fontSize};pointer-events:none;box-sizing:border-box;padding:0 22px;`;
      container.appendChild(div);
    } else {
      const x = titleX(ctx, subOpts.align);
      const maxWidth = chartWidth + (subOpts.widthAdjust ?? -44);
      const subEl = titleGroup.append('text')
        .attr('class', 'katucharts-chart-subtitle')
        .attr('x', x)
        .attr('y', layout.subtitleArea.y + 15)
        .attr('text-anchor', textAnchor(subOpts.align))
        .attr('fill', subOpts.style?.color as string || '#666666')
        .attr('font-size', fontSize)
        .text(subOpts.text!);
      wrapSvgText(subEl, maxWidth, x, parseFontSizePx(fontSize));
    }
  }
}

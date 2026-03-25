import { Selection } from 'd3-selection';
import type { DataLabelOptions, PointOptions, PlotArea } from '../types/options';
import type { AxisInstance } from '../axis/Axis';
import { templateFormat, stripHtmlTags } from '../utils/format';

export class DataLabels {
  static render(
    group: Selection<SVGGElement, unknown, null, undefined>,
    data: PointOptions[],
    config: DataLabelOptions,
    xAxis: AxisInstance,
    yAxis: AxisInstance,
    seriesName: string
  ): void {
    if (!config.enabled) return;

    const labelsGroup = group.append('g').attr('class', 'katucharts-data-labels');

    if (config.zIndex !== undefined) {
      labelsGroup.style('z-index', config.zIndex);
    }

    data.forEach((point, i) => {
      if (point.y === null || point.y === undefined) return;

      if (config.filter) {
        const filterProp = config.filter.property;
        const filterOp = config.filter.operator || '>';
        const filterVal = config.filter.value ?? 0;
        const pointVal = filterProp ? (point as any)[filterProp] : point.y;
        if (!DataLabels.matchesFilter(pointVal, filterOp, filterVal)) return;
      }

      let text: string;
      if (config.formatter) {
        text = config.formatter.call({
          point, series: { name: seriesName }, x: point.x, y: point.y,
          percentage: (point as any).percentage,
        });
      } else if (config.format) {
        text = stripHtmlTags(templateFormat(config.format, {
          point, series: { name: seriesName }, x: point.x, y: point.y,
        }));
      } else {
        text = String(point.y);
      }

      const x = xAxis.getPixelForValue(point.x ?? i) + (config.x ?? 0);
      const y = yAxis.getPixelForValue(point.y) + (config.y ?? -8);

      const label = labelsGroup.append('text')
        .attr('x', x)
        .attr('y', y)
        .attr('text-anchor', config.align || 'center')
        .attr('dominant-baseline', 'auto')
        .attr('font-size', config.style?.fontSize as string || '11px')
        .attr('fill', config.color || config.style?.color as string || '#333')
        .attr('font-weight', config.style?.fontWeight as string || 'normal')
        .text(text);

      if (config.className) {
        label.attr('class', config.className);
      }

      if (config.rotation) {
        label.attr('transform', `rotate(${config.rotation},${x},${y})`);
      }

      if (config.shadow) {
        label.attr('filter', 'drop-shadow(1px 1px 2px rgba(0,0,0,0.3))');
      }

      if (config.textPath?.enabled) {
        const pathAttrs = config.textPath.attributes || {};
        label.selectAll('*').remove();
        const textPathEl = label.append('textPath');
        for (const [k, v] of Object.entries(pathAttrs)) {
          textPathEl.attr(k, v);
        }
        textPathEl.text(text);
      }

      if (config.backgroundColor) {
        const bbox = (label.node() as SVGTextElement)?.getBBox?.();
        if (bbox) {
          const pad = config.padding ?? 2;
          const bgRect = labelsGroup.insert('rect', 'text')
            .attr('x', bbox.x - pad)
            .attr('y', bbox.y - pad)
            .attr('width', bbox.width + pad * 2)
            .attr('height', bbox.height + pad * 2)
            .attr('fill', config.backgroundColor)
            .attr('rx', config.borderRadius ?? 0)
            .attr('stroke', config.borderColor || 'none')
            .attr('stroke-width', config.borderWidth ?? 0);

          if (config.shadow) {
            bgRect.attr('filter', 'drop-shadow(1px 1px 2px rgba(0,0,0,0.3))');
          }
        }
      }
    });

    if (config.defer) {
      labelsGroup.style('opacity', '0');
      labelsGroup.transition().delay(1000).duration(200)
        .style('opacity', '1');
    }
  }

  private static matchesFilter(value: any, operator: string, threshold: number): boolean {
    const num = Number(value);
    if (isNaN(num)) return false;
    switch (operator) {
      case '>': return num > threshold;
      case '<': return num < threshold;
      case '>=': return num >= threshold;
      case '<=': return num <= threshold;
      case '==': return num === threshold;
      case '!=': return num !== threshold;
      default: return true;
    }
  }
}

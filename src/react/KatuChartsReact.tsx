import {
  useRef,
  useEffect,
  forwardRef,
  memo,
  type HTMLAttributes,
} from 'react';
import type { KatuChartsOptions } from '../types/options';

/**
 * Options accepted by the component. {@link KatuChartsOptions} drives editor
 * autocomplete when an object literal is written inline, while the `object` arm
 * lets options assembled elsewhere — a separate `const`, or a value typed with
 * the caller's own interface — be passed straight through without a type
 * annotation or cast.
 */
export type KatuChartsReactOptions = KatuChartsOptions | object;

interface KatuChartsStatic {
  chart(container: string | HTMLElement, options: KatuChartsReactOptions): KatuChartInstance;
}

interface KatuChartInstance {
  update(options: KatuChartsReactOptions, ...args: any[]): void;
  destroy(): void;
}

export interface KatuChartsReactProps {
  katuCharts: KatuChartsStatic;
  options: KatuChartsReactOptions;
  callback?: (chart: KatuChartInstance) => void;
  containerProps?: HTMLAttributes<HTMLDivElement>;
  /**
   * Name of an alternative chart factory on the library object (e.g.
   * "stockChart"); falls back to `chart` when absent or unknown.
   */
  constructorType?: string;
  /** When false, options-prop changes never touch the chart. Defaults to true. */
  allowChartUpdate?: boolean;
  /** When true, options changes destroy and recreate the chart instead of updating it in place. */
  immutable?: boolean;
  /** Extra arguments forwarded to `chart.update` after the options object. */
  updateArgs?: any[];
}

function optionsChanged(prev: KatuChartsReactOptions, next: KatuChartsReactOptions): boolean {
  try {
    return JSON.stringify(prev) !== JSON.stringify(next);
  } catch {
    return true;
  }
}

const KatuChartsReactInner = forwardRef<HTMLDivElement, KatuChartsReactProps>(
  ({ katuCharts, options, callback, containerProps, constructorType, allowChartUpdate, immutable, updateArgs }, ref) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const chartRef = useRef<KatuChartInstance | null>(null);
    const prevOptionsRef = useRef<KatuChartsReactOptions | null>(null);
    const isInitialMount = useRef(true);

    const setRefs = (el: HTMLDivElement | null) => {
      containerRef.current = el;
      if (typeof ref === 'function') {
        ref(el);
      } else if (ref) {
        (ref as React.MutableRefObject<HTMLDivElement | null>).current = el;
      }
    };

    const createChart = (container: HTMLElement, chartOptions: KatuChartsReactOptions): KatuChartInstance => {
      const factory =
        (constructorType && typeof (katuCharts as any)[constructorType] === 'function'
          ? (katuCharts as any)[constructorType]
          : katuCharts.chart) as KatuChartsStatic['chart'];
      const chart = factory.call(katuCharts, container, chartOptions);
      chartRef.current = chart;
      prevOptionsRef.current = chartOptions;
      callback?.(chart);
      return chart;
    };

    useEffect(() => {
      if (!containerRef.current) return;

      createChart(containerRef.current, options);

      return () => {
        chartRef.current?.destroy();
        chartRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [katuCharts, constructorType]);

    useEffect(() => {
      if (isInitialMount.current) {
        isInitialMount.current = false;
        return;
      }

      if (allowChartUpdate === false) return;

      if (chartRef.current && prevOptionsRef.current && optionsChanged(prevOptionsRef.current, options)) {
        if (immutable && containerRef.current) {
          chartRef.current.destroy();
          createChart(containerRef.current, options);
        } else {
          chartRef.current.update(options, ...(updateArgs ?? []));
          prevOptionsRef.current = options;
        }
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [options]);

    return <div {...containerProps} ref={setRefs} />;
  }
);

KatuChartsReactInner.displayName = 'KatuChartsReact';

export const KatuChartsReact = memo(KatuChartsReactInner);

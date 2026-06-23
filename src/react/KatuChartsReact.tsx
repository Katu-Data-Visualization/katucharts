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
 * autocomplete when an object literal is written inline, while the plain-object
 * arm lets options assembled in a separate `const` be passed straight through
 * without a type annotation or cast.
 */
export type KatuChartsReactOptions = KatuChartsOptions | Record<string, unknown>;

interface KatuChartsStatic {
  chart(container: string | HTMLElement, options: KatuChartsReactOptions): KatuChartInstance;
}

interface KatuChartInstance {
  update(options: KatuChartsReactOptions, redraw?: boolean): void;
  destroy(): void;
}

export interface KatuChartsReactProps {
  katuCharts: KatuChartsStatic;
  options: KatuChartsReactOptions;
  callback?: (chart: KatuChartInstance) => void;
  containerProps?: HTMLAttributes<HTMLDivElement>;
}

function optionsChanged(prev: KatuChartsReactOptions, next: KatuChartsReactOptions): boolean {
  try {
    return JSON.stringify(prev) !== JSON.stringify(next);
  } catch {
    return true;
  }
}

const KatuChartsReactInner = forwardRef<HTMLDivElement, KatuChartsReactProps>(
  ({ katuCharts, options, callback, containerProps }, ref) => {
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

    useEffect(() => {
      if (!containerRef.current) return;

      const chart = katuCharts.chart(containerRef.current, options);
      chartRef.current = chart;
      prevOptionsRef.current = options;
      callback?.(chart);

      return () => {
        chartRef.current?.destroy();
        chartRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [katuCharts]);

    useEffect(() => {
      if (isInitialMount.current) {
        isInitialMount.current = false;
        return;
      }

      if (chartRef.current && prevOptionsRef.current && optionsChanged(prevOptionsRef.current, options)) {
        chartRef.current.update(options);
        prevOptionsRef.current = options;
      }
    }, [options]);

    return <div {...containerProps} ref={setRefs} />;
  }
);

KatuChartsReactInner.displayName = 'KatuChartsReact';

export const KatuChartsReact = memo(KatuChartsReactInner);

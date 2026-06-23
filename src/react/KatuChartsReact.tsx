import {
  useRef,
  useEffect,
  forwardRef,
  memo,
  type HTMLAttributes,
} from 'react';

interface KatuChartsStatic {
  chart(container: string | HTMLElement, options: Record<string, unknown>): KatuChartInstance;
}

interface KatuChartInstance {
  update(options: Record<string, unknown>, redraw?: boolean): void;
  destroy(): void;
}

export interface KatuChartsReactProps {
  katuCharts: KatuChartsStatic;
  options: Record<string, unknown>;
  callback?: (chart: KatuChartInstance) => void;
  containerProps?: HTMLAttributes<HTMLDivElement>;
}

function optionsChanged(prev: Record<string, unknown>, next: Record<string, unknown>): boolean {
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
    const prevOptionsRef = useRef<Record<string, unknown> | null>(null);
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

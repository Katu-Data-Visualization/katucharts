import { defineConfig } from 'vite';
import { resolve } from 'path';

const entries: Record<string, { entry: string; name: string; fileName: string; external?: string[] }> = {
  index: {
    entry: resolve(__dirname, 'src/index.ts'),
    name: 'KatuCharts',
    fileName: 'katucharts',
  },
  bio: {
    entry: resolve(__dirname, 'src/bio.ts'),
    name: 'KatuChartsBio',
    fileName: 'katucharts-bio',
  },
  finance: {
    entry: resolve(__dirname, 'src/finance.ts'),
    name: 'KatuChartsFinance',
    fileName: 'katucharts-finance',
  },
  datatable: {
    entry: resolve(__dirname, 'src/datatable.ts'),
    name: 'KatuChartsDataTable',
    fileName: 'katucharts-datatable',
  },
  react: {
    entry: resolve(__dirname, 'src/react.tsx'),
    name: 'KatuChartsReact',
    fileName: 'katucharts-react',
    external: ['react', 'react-dom', 'react/jsx-runtime'],
  },
};

const target = process.env.BUILD_ENTRY || 'index';
const config = entries[target];

export default defineConfig({
  define: {
    __KATU_LICENSE_SECRET__: JSON.stringify(process.env.KATU_LICENSE_SECRET || 'dev-secret-change-me'),
  },
  build: {
    lib: {
      entry: config.entry,
      name: config.name,
      formats: ['es', 'umd'],
      fileName: (format) => `${config.fileName}.${format}.js`,
    },
    sourcemap: true,
    emptyOutDir: target === 'index',
    rollupOptions: config.external
      ? {
          external: config.external,
          output: {
            globals: {
              react: 'React',
              'react-dom': 'ReactDOM',
              'react/jsx-runtime': 'jsxRuntime',
            },
          },
        }
      : undefined,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.{test,spec}.ts', 'tests/**/*.{test,spec}.ts'],
  },
});

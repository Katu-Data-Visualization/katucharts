# KatuCharts

D3.js charting library with a simple, declarative configuration interface.

## Install

```bash
npm install katucharts
```

## Quick Start

```html
<div id="chart"></div>
<script type="module">
  import KatuCharts from 'katucharts';

  KatuCharts.chart('chart', {
    title: { text: 'Monthly Sales' },
    xAxis: { categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May'] },
    series: [{
      type: 'column',
      name: 'Revenue',
      data: [120, 200, 150, 80, 270]
    }]
  });
</script>
```

## Modules

KatuCharts ships as a core library plus optional modules:

| Module | Import | Description |
|--------|--------|-------------|
| Core | `katucharts` | Line, area, column, scatter, spline, pie, heatmap, gauge, sankey, treemap, and more |
| Bio | `katucharts/bio` | Volcano, manhattan, violin, kaplan-meier, forest, seqlogo, circos, phylogenetic trees |
| Finance | `katucharts/finance` | Candlestick, OHLC, technical indicators, stock chart navigator |
| DataTable | `katucharts/datatable` | Interactive data tables with sorting, filtering, and chart integration |

```js
import KatuCharts from 'katucharts';
import { BioModule } from 'katucharts/bio';

KatuCharts.use(BioModule);
```

## UMD

```html
<script src="https://unpkg.com/katucharts/dist/katucharts.umd.js"></script>
<script>
  KatuCharts.chart('chart', { /* options */ });
</script>
```

## Configuration

KatuCharts uses a simple, declarative options object:

```js
KatuCharts.chart('container', {
  chart: { type: 'line' },
  title: { text: 'Temperature' },
  xAxis: { categories: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] },
  yAxis: { title: { text: 'Celsius' } },
  series: [{ name: 'Tokyo', data: [7, 6.9, 9.5, 14.5, 18.2] }]
});
```

## Features

- 40+ chart types across cartesian, polar, hierarchical, flow, gauge, map, and timeline categories
- Responsive and adaptive layouts
- Zoom, pan, and drilldown interactions
- PNG, JPEG, SVG, and PDF export
- Real-time streaming data support
- Accessibility (ARIA) built-in
- TypeScript types included
- ESM and UMD builds

## Optional Dependencies

- **jspdf** — required only for PDF export (`npm install jspdf`)

## License

Source-available under the [KatuCharts EULA](./LICENSE). Free for personal and commercial use with attribution. Paid license available to remove branding.

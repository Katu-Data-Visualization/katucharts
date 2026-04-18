# KatuCharts

D3.js charting library with a declarative configuration interface.

![version](https://img.shields.io/badge/version-0.1.1-blue) ![license](https://img.shields.io/badge/license-KatuCharts_EULA-orange)

---

## Table of Contents

- [Install](#install)
- [Quick Start](#quick-start)
- [Chart Types](#chart-types)
- [KatuCharts API](#katucharts-api)
- [Chart Instance API](#chart-instance-api)
- [Configuration Reference](#configuration-reference)
  - [chart](#chart-options)
  - [title / subtitle](#title--subtitle)
  - [xAxis / yAxis](#xaxis--yaxis)
  - [series](#series-options)
  - [tooltip](#tooltip)
  - [legend](#legend)
  - [exporting](#exporting)
  - [accessibility](#accessibility)
  - [drilldown](#drilldown)
  - [responsive](#responsive)
- [Modules](#modules)
  - [Finance](#finance-module)
  - [Bio](#bio-module)
  - [DataTable](#datatable-module)
  - [React](#react-wrapper)
- [Streaming & Real-time](#streaming--real-time)
- [Events](#events)
- [Export](#export)
- [Custom Modules](#custom-modules)
- [License](#license)

---

## Install

```bash
npm install katucharts
```

Optional peer dependencies:

```bash
npm install jspdf        # required only for PDF export
npm install react react-dom  # required only for React wrapper
```

---

## Quick Start

**ESM**

```js
import KatuCharts from 'katucharts';

KatuCharts.chart('container', {
  title: { text: 'Monthly Sales' },
  xAxis: { categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May'] },
  series: [{
    type: 'column',
    name: 'Revenue',
    data: [120, 200, 150, 80, 270]
  }]
});
```

**UMD (CDN)**

```html
<script src="https://unpkg.com/katucharts/dist/katucharts.umd.js"></script>
<script>
  KatuCharts.chart('container', { series: [{ type: 'line', data: [1, 2, 3] }] });
</script>
```

**With modules**

```js
import KatuCharts from 'katucharts';
import { BioModule } from 'katucharts/bio';
import { FinanceModule } from 'katucharts/finance';

KatuCharts.use(BioModule);
KatuCharts.use(FinanceModule);
```

---

## Chart Types

### Core — Cartesian

| Type | Description |
|------|-------------|
| `line` | Multi-point line series with optional markers |
| `spline` | Smooth interpolated line |
| `area` | Filled line area |
| `areaspline` | Smooth filled area |
| `column` | Vertical bars (stacked, grouped, or range) |
| `bar` | Horizontal bars (inverted column) |
| `scatter` | Point cloud |
| `bubble` | Scatter with Z-value as radius |
| `heatmap` | 2D grid with color scale |
| `boxplot` | Box-and-whisker distribution |
| `waterfall` | Cumulative change visualization |

### Core — Non-Cartesian

| Type | Description |
|------|-------------|
| `pie` | Pie chart with slicing and drilldown |
| `donut` | Alias for pie with inner radius |
| `gauge` | Speedometer-style gauge |
| `solidgauge` | Solid radial gauge |
| `polar` | Polar coordinate plot |
| `radar` | Alias for polar |

### Core — Hierarchical

| Type | Description |
|------|-------------|
| `treemap` | Squarified treemap with levels |
| `sunburst` | Radial treemap with drilldown |
| `venn` | 2- or 3-way Venn diagram |
| `funnel` | Funnel/conversion visualization |
| `pyramid` | Pyramid chart |

### Core — Specialized

| Type | Description |
|------|-------------|
| `timeline` | Event timeline |
| `gantt` | Project Gantt chart |
| `map` | Geographic map with regions |
| `barchartrace` | Animated bar chart race |

### Flow & Network

| Type | Description |
|------|-------------|
| `sankey` | Flow/alluvial diagram (requires `d3-sankey`) |
| `networkgraph` | Force-directed network graph |
| `dependencywheel` | Circular dependency diagram |

### Financial (`katucharts/finance`)

| Type | Description |
|------|-------------|
| `candlestick` | OHLC candlestick |
| `ohlc` | Open-High-Low-Close bars |
| `heikinashi` | Heikin-Ashi candlestick |
| `hollowcandlestick` | Hollow candlestick |
| `volume` | Trading volume bars |
| `arearange` | Area between range boundaries |
| `baseline` | Profit/loss from a baseline value |
| `flags` | Event markers on a series |
| `renko` | Fixed-move block chart |
| `kagi` | Price reversal chart |
| `pointandfigure` | Point & figure chart |
| `linebreak` | Line break reversal chart |

### Bioinformatics (`katucharts/bio`)

| Type | Description |
|------|-------------|
| `volcano` | Volcano plot (p-value vs fold-change) |
| `manhattan` | Manhattan plot (GWAS) |
| `violin` | Violin plot (distribution) |
| `kaplanmeier` | Kaplan-Meier survival curve |
| `forestplot` | Forest plot (meta-analysis) |
| `sequencelogo` | Sequence logo |
| `clusteredheatmap` | Heatmap with dendrograms |
| `phylotree` | Phylogenetic tree |
| `circos` | Circos circular layout |
| `circosChord` | Circos chord diagram |
| `circosHeatmap` | Circos heatmap tracks |
| `circosComparative` | Circos comparative layout |
| `circosSpiral` | Circos spiral layout |

---

## KatuCharts API

All methods are on the `KatuCharts` static object.

### `KatuCharts.chart(container, options)`

Creates and returns a Chart instance.

| Parameter | Type | Description |
|-----------|------|-------------|
| `container` | `string \| HTMLElement` | DOM element ID or element reference |
| `options` | `KatuChartsOptions` | Chart configuration object |

**Returns:** `Chart`

```js
const chart = KatuCharts.chart('my-chart', { series: [{ data: [1, 2, 3] }] });
```

### `KatuCharts.setOptions(options)`

Sets global defaults applied to every subsequent chart.

```js
KatuCharts.setOptions({
  chart: { backgroundColor: '#1a1a2e' },
  legend: { enabled: false }
});
```

### `KatuCharts.getOptions()`

Returns the current global options object.

### `KatuCharts.use(module)`

Registers a plugin module.

```js
import { FinanceModule } from 'katucharts/finance';
KatuCharts.use(FinanceModule);
```

### `KatuCharts.dateFormat(value, format)`

Formats a date using D3 time format strings.

```js
KatuCharts.dateFormat(new Date(), '%Y-%m-%d');
```

### `KatuCharts.numberFormat(value, decimals?)`

Formats a number with thousand separators and optional decimal places.

```js
KatuCharts.numberFormat(1234567.89, 2); // "1,234,567.89"
```

### `KatuCharts.templateFormat(template, context)`

Substitutes `{key}` placeholders in a template string.

```js
KatuCharts.templateFormat('{name}: {value}', { name: 'Revenue', value: 500 });
```

### `KatuCharts.stripHtmlTags(html)`

Removes HTML tags from a string.

### `KatuCharts.color(input)`

Parses a color string (hex, rgb, named) and returns `{ r, g, b, a? }`.

### `KatuCharts.getPalette(name)`

Returns a color array for a named palette. Available palettes are listed in `KatuCharts.palettes`.

### `KatuCharts.setTheme(name)`

Applies a named theme from `KatuCharts.THEMES` to all subsequent charts.

### `KatuCharts.ChartRegistry`

Low-level registry for series type constructors.

| Method | Description |
|--------|-------------|
| `registerType(name, constructor)` | Registers a custom series type |
| `getType(name)` | Returns the constructor for a type |
| `hasType(name)` | Returns `true` if the type is registered |
| `getRegisteredTypes()` | Returns all registered type names |

---

## Chart Instance API

Methods available on the object returned by `KatuCharts.chart()`.

### `chart.update(options, redraw?)`

Updates configuration and optionally redraws. Pass `redraw: false` to batch multiple updates.

```js
chart.update({ title: { text: 'New Title' } });
```

### `chart.destroy()`

Removes the chart from the DOM and releases all resources.

### `chart.redraw(animate?)`

Forces a full redraw. Pass `false` to skip animation.

### `chart.reflow()`

Recalculates layout and responsive breakpoints. Call after the container is resized.

### `chart.getContainer()`

Returns the container `HTMLElement`.

### `chart.getSVG()`

Returns the root `SVGSVGElement`, or `null` if not yet rendered.

### `chart.getSeries(index?)`

Returns a single `BaseSeries` by index, or all series if index is omitted.

### `chart.getAxis(isX?, index?)`

Returns an axis instance. Pass `true` for X-axes, `false` for Y-axes. Omit `index` to get all.

### `chart.showLoading(text?)`

Shows a loading overlay with optional text.

### `chart.hideLoading()`

Hides the loading overlay.

### `chart.print(maxWidth?)`

Opens the browser print dialog for the chart.

### `chart.exportChart(exportingOptions?)`

Triggers an export. Merges with chart's `exporting` config.

```js
chart.exportChart({ format: 'image/png', filename: 'my-chart' });
```

### `chart.fireEvent(eventName, eventObject?)`

Manually fires a chart event.

---

## Configuration Reference

### chart options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `type` | `string` | `'line'` | Default series type |
| `width` | `number \| null` | `null` | Width in pixels; `null` uses container width |
| `height` | `number \| string \| null` | `null` | Height in pixels, `'50%'`, or `null` |
| `backgroundColor` | `string` | `'#ffffff'` | Outer background color |
| `borderColor` | `string` | `'#335cad'` | Chart border color |
| `borderWidth` | `number` | `0` | Border width in pixels |
| `borderRadius` | `number` | `0` | Rounded corner radius |
| `margin` | `number \| number[]` | auto | `[top, right, bottom, left]` in pixels |
| `marginTop` | `number` | auto | |
| `marginRight` | `number` | auto | |
| `marginBottom` | `number` | auto | |
| `marginLeft` | `number` | auto | |
| `spacing` | `number[]` | `[10,10,15,10]` | Inner spacing `[top,right,bottom,left]` |
| `plotBackgroundColor` | `string` | `null` | Plot area background |
| `plotBorderWidth` | `number` | `0` | Plot area border width |
| `plotShadow` | `boolean` | `false` | Drop shadow on plot area |
| `inverted` | `boolean` | `false` | Swaps X and Y axes |
| `polar` | `boolean` | `false` | Polar coordinate system |
| `reflow` | `boolean` | `true` | Auto-reflow on container resize |
| `animation` | `boolean \| object` | `true` | `{ duration, easing }` |
| `zoomType` | `'x' \| 'y' \| 'xy'` | — | Enable drag-to-zoom |
| `panning` | `boolean \| object` | `false` | Enable panning; `{ enabled, type }` |
| `panKey` | `string` | `'shift'` | Modifier key required to pan |
| `palette` | `string` | `'default'` | Color palette name |
| `colorCount` | `number` | `10` | Number of palette colors to cycle |
| `styledMode` | `boolean` | `false` | Use external CSS instead of inline styles |
| `numberFormatter` | `function` | — | Override global number formatting |
| `events` | `object` | — | Chart-level event callbacks (see [Events](#events)) |

### title / subtitle

```js
{
  title: {
    text: 'Chart Title',
    align: 'center',          // 'left' | 'center' | 'right'
    verticalAlign: 'top',     // 'top' | 'middle' | 'bottom'
    x: 0,
    y: 15,
    floating: false,
    style: { fontSize: '18px', color: '#333333' }
  },
  subtitle: {
    text: 'Optional subtitle',
    align: 'center',
    style: { color: '#666666' }
  }
}
```

### xAxis / yAxis

Both accept a single object or an array for multiple axes.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `type` | `'linear' \| 'logarithmic' \| 'datetime' \| 'category'` | `'linear'` | Scale type |
| `title` | `object` | — | `{ text, style }` |
| `labels` | `object` | — | `{ format, formatter, rotation, style }` |
| `min` | `number \| null` | auto | Axis minimum |
| `max` | `number \| null` | auto | Axis maximum |
| `softMin` | `number` | — | Soft minimum (data can exceed it) |
| `softMax` | `number` | — | Soft maximum |
| `tickInterval` | `number` | auto | Interval between ticks |
| `tickAmount` | `number` | — | Exact number of ticks |
| `tickLength` | `number` | `10` | Tick mark length |
| `tickWidth` | `number` | `1` | Tick mark width |
| `tickPosition` | `'inside' \| 'outside'` | `'outside'` | |
| `gridLineWidth` | `number` | `1` | Grid line width |
| `gridLineColor` | `string` | `'#e6e6e6'` | |
| `gridLineDashStyle` | `string` | `'Solid'` | |
| `lineWidth` | `number` | `1` | Axis line width |
| `opposite` | `boolean` | `false` | Place on opposite side (right/top) |
| `reversed` | `boolean` | `false` | Reverse scale direction |
| `visible` | `boolean` | `true` | |
| `categories` | `string[]` | — | Category axis values |
| `crosshair` | `boolean \| object` | `false` | `{ width, color, dashStyle, snap }` |
| `plotBands` | `PlotBand[]` | — | Shaded regions: `{ from, to, color, label }` |
| `plotLines` | `PlotLine[]` | — | Reference lines: `{ value, width, color, label }` |
| `startOnTick` | `boolean` | `true` | |
| `endOnTick` | `boolean` | `true` | |
| `alternateGridColor` | `string` | — | Zebra-stripe alternate grid color |
| `dateTimeLabelFormats` | `object` | — | Format strings per time unit |
| `events` | `object` | — | `{ afterSetExtremes, setExtremes }` |

```js
yAxis: {
  type: 'logarithmic',
  title: { text: 'Concentration (μM)' },
  plotLines: [{ value: 0, width: 1, color: '#808080' }],
  plotBands: [{ from: 0, to: 10, color: 'rgba(68,170,213,0.1)', label: { text: 'Normal' } }]
}
```

### series options

Each object in the `series` array accepts these options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `type` | `string` | chart default | Overrides chart-level type |
| `name` | `string` | — | Displayed in legend and tooltip |
| `data` | `array` | **required** | See data formats below |
| `color` | `string` | palette | Series color |
| `colorIndex` | `number` | — | Explicit palette index |
| `visible` | `boolean` | `true` | |
| `showInLegend` | `boolean` | `true` | |
| `opacity` | `number` | `1` | |
| `lineWidth` | `number` | `2` | Line thickness |
| `dashStyle` | `string` | `'Solid'` | `'Dash'`, `'Dot'`, `'DashDot'`, etc. |
| `fillColor` | `string` | — | Area fill color |
| `fillOpacity` | `number` | `0.75` | Area fill opacity |
| `borderWidth` | `number` | type-dependent | |
| `borderColor` | `string` | — | |
| `borderRadius` | `number` | `0` | Column corner radius |
| `marker` | `object` | — | `{ enabled, symbol, radius, fillColor, lineWidth, lineColor }` |
| `dataLabels` | `object` | — | `{ enabled, format, formatter, style, position }` |
| `stacking` | `'normal' \| 'percent'` | — | Stack series |
| `stack` | `string \| number` | — | Stack group identifier |
| `negativeColor` | `string` | — | Color for values below threshold |
| `threshold` | `number \| null` | `0` | |
| `zones` | `Zone[]` | — | `[{ value, color, fillColor, dashStyle }]` |
| `step` | `'left' \| 'center' \| 'right' \| false` | `false` | Step line type |
| `connectNulls` | `boolean` | `false` | |
| `pointStart` | `number` | — | X value of the first point |
| `pointInterval` | `number` | `1` | Interval between auto-generated X values |
| `xAxis` | `number \| string` | `0` | Axis index or id |
| `yAxis` | `number \| string` | `0` | |
| `enableMouseTracking` | `boolean` | `true` | |
| `allowPointSelect` | `boolean` | `false` | |
| `drilldown` | `string` | — | Drilldown series ID |
| `events` | `object` | — | `{ click, mouseOver, mouseOut, legendItemClick, show, hide, afterAnimate }` |

**Data formats:**

```js
// Simple array of values (auto X)
data: [10, 20, 30]

// [x, y] pairs
data: [[0, 10], [1, 20], [2, 30]]

// [x, y, z] for bubble charts
data: [[0, 10, 5], [1, 20, 8]]

// [category, value]
data: [['Jan', 120], ['Feb', 200]]

// Point objects
data: [
  { x: 0, y: 10, name: 'Alpha', color: '#ff0000', custom: { extra: 'data' } },
  { x: 1, y: null },   // null creates a gap
  { x: 2, y: 30, sliced: true, selected: true }
]
```

### tooltip

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `true` | |
| `shared` | `boolean` | `false` | Show all series at the hovered X |
| `split` | `boolean` | `false` | Separate callout per series |
| `useHTML` | `boolean` | `false` | Render tooltip content as HTML |
| `followPointer` | `boolean` | `false` | Move with cursor |
| `format` | `string` | — | Template using `{point.x}`, `{series.name}`, etc. |
| `headerFormat` | `string` | — | Header template |
| `pointFormat` | `string` | — | Per-point template |
| `formatter` | `function` | — | `function() { return '...'; }` — `this` is the context |
| `positioner` | `function` | — | `(width, height, point) => ({ x, y })` |
| `backgroundColor` | `string` | `'rgba(247,247,247,0.85)'` | |
| `borderColor` | `string` | auto | |
| `borderWidth` | `number` | `1` | |
| `borderRadius` | `number` | `3` | |
| `padding` | `number` | `8` | |
| `shadow` | `boolean` | `true` | |
| `hideDelay` | `number` | `500` | Milliseconds before hiding |
| `distance` | `number` | `16` | Distance from point in pixels |
| `outside` | `boolean` | `false` | Allow tooltip outside chart bounds |
| `stickOnContact` | `boolean` | `false` | Prevent hiding when mouse enters tooltip |

```js
tooltip: {
  shared: true,
  formatter() {
    return this.points.map(p => `<b>${p.series.name}</b>: ${p.y}`).join('<br>');
  },
  useHTML: true
}
```

### legend

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `true` | |
| `layout` | `'horizontal' \| 'vertical' \| 'proximate'` | `'horizontal'` | |
| `align` | `'left' \| 'center' \| 'right'` | `'center'` | |
| `verticalAlign` | `'top' \| 'middle' \| 'bottom'` | `'bottom'` | |
| `floating` | `boolean` | `false` | Overlap chart area |
| `x` | `number` | `0` | Horizontal offset |
| `y` | `number` | `0` | Vertical offset |
| `maxHeight` | `number` | — | Max height before scrolling |
| `itemDistance` | `number` | `20` | Space between items |
| `symbolWidth` | `number` | `16` | Legend symbol width |
| `symbolHeight` | `number` | `12` | Legend symbol height |
| `squareSymbol` | `boolean` | `true` | |
| `backgroundColor` | `string` | — | |
| `borderWidth` | `number` | `0` | |
| `borderRadius` | `number` | `0` | |
| `reversed` | `boolean` | `false` | Reverse item order |
| `rtl` | `boolean` | `false` | Right-to-left |
| `labelFormatter` | `function` | — | `function() { return this.name; }` |
| `labelFormat` | `string` | `'{name}'` | Template for item labels |

### exporting

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Show export button |
| `format` | `string` | `'image/png'` | Default export format |
| `scale` | `number` | `2` | Resolution multiplier |
| `quality` | `number` | `0.95` | JPEG quality (0–1) |
| `filename` | `string` | `'chart'` | Downloaded file name |
| `sourceWidth` | `number` | — | Export width override |
| `sourceHeight` | `number` | — | Export height override |
| `chartOptions` | `object` | — | Overrides applied only during export |
| `csv.dateFormat` | `string` | — | Date format in CSV |
| `csv.decimalPoint` | `string` | `'.'` | |
| `csv.itemDelimiter` | `string` | `','` | |
| `csv.lineDelimiter` | `string` | `'\n'` | |
| `buttons.contextButton.menuItems` | `string[]` | all | Items in export menu |

```js
exporting: {
  filename: 'my-report',
  scale: 3,
  chartOptions: { title: { style: { color: '#000' } } }
}
```

### accessibility

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `true` | ARIA roles and descriptions |
| `description` | `string` | auto | Override auto-generated description |
| `landmarkVerbosity` | `'all' \| 'minimal' \| 'none'` | `'all'` | |
| `keyboardNavigation.enabled` | `boolean` | `true` | |
| `announceNewData.enabled` | `boolean` | `false` | Announce streaming updates |
| `announceNewData.minAnnounceInterval` | `number` | `5000` | Milliseconds between announcements |

### drilldown

```js
drilldown: {
  series: [
    { id: 'Q1', type: 'column', name: 'Q1 Detail', data: [30, 40, 50] }
  ],
  breadcrumbs: {
    enabled: true,
    position: { align: 'right', verticalAlign: 'top' }
  },
  animation: { duration: 300 }
}
```

Each top-level series point references a drilldown series by `drilldown: 'id'`.

### responsive

```js
chart: {
  responsive: {
    rules: [{
      condition: { maxWidth: 600 },
      chartOptions: {
        legend: { enabled: false },
        yAxis: { title: { text: '' } }
      }
    }]
  }
}
```

---

## Modules

### Finance Module

```js
import KatuCharts from 'katucharts';
import { FinanceModule } from 'katucharts/finance';

KatuCharts.use(FinanceModule);
```

Enables all [financial chart types](#financial-katucharts-finance) plus technical indicators.

**Technical Indicators**

Indicators are computed from OHLCV data and rendered as overlay series.

| Indicator | Constructor | Parameters |
|-----------|------------|------------|
| SMA | `SMA(data, period)` | period |
| EMA | `EMA(data, period, multiplier?)` | period, optional multiplier |
| WMA | `WMA(data, period)` | period |
| RSI | `RSI(data, period)` | period |
| MACD | `MACD(data, fast, slow, signal)` | fast/slow/signal periods |
| Stochastic | `Stochastic(data, kPeriod, smoothK, smoothD)` | |
| Bollinger Bands | `BollingerBands(data, period, stdDevs)` | |
| ATR | `ATR(data, period)` | |
| VWAP | `VWAP(data, volumeKey)` | key for volume column |
| OBV | `OBV(data)` | |
| Ichimoku | `IchimokuCloud(data, tenkan, kijun, ...)` | |

All indicators expose `.calculate()` and `.getResult()` and return data in `[x, y]` series format.

```js
import { FinanceModule, EMA } from 'katucharts/finance';

KatuCharts.use(FinanceModule);

const ema = new EMA(ohlcData, 20);
ema.calculate();
const emaData = ema.getResult();

KatuCharts.chart('container', {
  series: [
    { type: 'candlestick', name: 'AAPL', data: ohlcData },
    { type: 'line', name: 'EMA 20', data: emaData, lineWidth: 1 }
  ]
});
```

### Bio Module

```js
import KatuCharts from 'katucharts';
import { BioModule } from 'katucharts/bio';

KatuCharts.use(BioModule);
```

Enables all [bioinformatics chart types](#bioinformatics-katuchartsbio).

```js
KatuCharts.chart('container', {
  series: [{
    type: 'volcano',
    name: 'DEG Analysis',
    data: genes.map(g => ({ x: g.log2fc, y: -Math.log10(g.pvalue), name: g.symbol }))
  }]
});
```

### DataTable Module

```js
import KatuCharts from 'katucharts';
import { DataTableModule, DataTable } from 'katucharts/datatable';

KatuCharts.use(DataTableModule);
```

**`new DataTable(container, options)`**

| Method | Description |
|--------|-------------|
| `setData(data, columns?)` | Replace all data |
| `getData()` | Return current data array |
| `getSelectedRows()` | Return selected row objects |
| `selectRows(indices, triggerEvent?)` | Programmatic selection |
| `deselectRows(indices?, triggerEvent?)` | Deselect rows |
| `clearSelection()` | Clear all selections |
| `sort(columnId, direction?)` | Sort by column |
| `filter(filters)` | Apply `[{ column, value, operator }]` filters |
| `search(query)` | Global text search |
| `exportData(format, filename?)` | Download as `'csv'` or `'json'` |
| `destroy()` | Remove and release resources |

**ColumnDefinition**

| Option | Type | Description |
|--------|------|-------------|
| `id` | `string` | **required** — column identifier |
| `title` | `string` | Header label |
| `type` | `'string' \| 'number' \| 'date' \| 'boolean' \| 'custom'` | |
| `width` | `number \| string` | Column width |
| `sortable` | `boolean` | |
| `filterable` | `boolean` | |
| `formatter` | `(value, row) => string` | Custom cell renderer |
| `visible` | `boolean` | |
| `align` | `'left' \| 'center' \| 'right'` | |
| `pinned` | `'left' \| 'right' \| false` | Freeze column |
| `cellStyle` | `(value, row) => CSSObject` | Dynamic inline style |

**DataTableOptions (key fields)**

```js
const table = new DataTable('container', {
  data: rows,
  columns: [
    { id: 'name', title: 'Name', type: 'string', sortable: true },
    { id: 'value', title: 'Value', type: 'number', formatter: (v) => v.toFixed(2) }
  ],
  selection: { enabled: true, mode: 'multiple' },
  pagination: { enabled: true, pageSize: 25, pageSizeOptions: [10, 25, 50] },
  sorting: { enabled: true, multiSort: true },
  filtering: { enabled: true, mode: 'both' },
  export: { enabled: true, formats: ['csv', 'json'], filename: 'export' }
});
```

### React Wrapper

```js
import KatuCharts from 'katucharts';
import { KatuChartsReact } from 'katucharts/react';

function SalesChart() {
  return (
    <KatuChartsReact
      katuCharts={KatuCharts}
      options={{
        chart: { type: 'line' },
        title: { text: 'Monthly Sales' },
        series: [{ name: 'Revenue', data: [120, 200, 150, 80, 270] }]
      }}
      callback={(chart) => {
        console.log('chart ready', chart);
      }}
      containerProps={{ style: { height: '400px' } }}
    />
  );
}
```

| Prop | Type | Description |
|------|------|-------------|
| `katuCharts` | `KatuChartsStatic` | **required** — the `KatuCharts` import |
| `options` | `KatuChartsOptions` | **required** — chart configuration |
| `callback` | `(chart) => void` | Called after chart is initialized |
| `containerProps` | `HTMLAttributes<HTMLDivElement>` | Props for the wrapper `<div>` |

---

## Streaming & Real-time

### StreamAdapter

```js
import { StreamAdapter } from 'katucharts';

const chart = KatuCharts.chart('container', {
  series: [{ type: 'line', name: 'Live', data: [] }]
});
const series = chart.getSeries(0);
```

**`StreamAdapter.fromWebSocket(ws, series, parseMessage, options?)`**

```js
const ws = new WebSocket('wss://feed.example.com');
const sub = StreamAdapter.fromWebSocket(
  ws,
  series,
  (msg) => ({ x: Date.now(), y: JSON.parse(msg.data).value }),
  { shift: true }
);
sub.unsubscribe();
```

**`StreamAdapter.fromEventSource(source, series, eventName, parseMessage, options?)`**

```js
const source = new EventSource('/stream');
const sub = StreamAdapter.fromEventSource(
  source,
  series,
  'price',
  (data) => ({ x: Date.now(), y: parseFloat(data) }),
  { shift: true }
);
```

**`StreamAdapter.fromPolling(fetchFn, series, intervalMs, options?)`**

```js
const sub = StreamAdapter.fromPolling(
  async () => {
    const res = await fetch('/api/latest');
    const json = await res.json();
    return { x: Date.now(), y: json.value };
  },
  series,
  2000,
  { shift: true }
);
```

All three return a `{ unsubscribe() }` handle.

### UpdateScheduler

Batch multiple data operations into one redraw.

```js
import { UpdateScheduler } from 'katucharts';

const scheduler = new UpdateScheduler();

scheduler.batch(() => {
  scheduler.schedule([
    { type: 'add', seriesIndex: 0, data: { x: 1, y: 10 } },
    { type: 'add', seriesIndex: 1, data: { x: 1, y: 20 } }
  ]);
});
```

| Method | Description |
|--------|-------------|
| `schedule(updates, redraw?)` | Queue updates |
| `batch(fn)` | Run `fn` and flush once |
| `flush()` | Force immediate flush |
| `clear()` | Discard queued updates |

`UpdateEntry.type` values: `'add'`, `'remove'`, `'update'`, `'clear'`, `'replace'`.

### CircularBuffer

Fixed-size FIFO buffer for rolling windows.

```js
import { CircularBuffer } from 'katucharts';

const buffer = new CircularBuffer(100);
buffer.push({ x: Date.now(), y: 42 });
buffer.toArray(); // last 100 items
```

---

## Events

### EventBus API

Charts expose an `events` bus accessible after creation. You can also pass callbacks directly in the options object.

```js
chart.events.on('point:click', (point) => console.log(point));
chart.events.once('load', () => console.log('ready'));
chart.events.off('point:click');
```

| Method | Description |
|--------|-------------|
| `on(event, callback)` | Subscribe (persistent) |
| `once(event, callback)` | Subscribe (fires once, then removed) |
| `off(event, callback?)` | Unsubscribe; omit callback to remove all listeners for event |
| `emit(event, ...args)` | Fire event manually |
| `removeAllListeners()` | Clear every listener |

### Built-in Events

| Event | Fired when |
|-------|-----------|
| `load` | Chart fully initialized |
| `redraw` | Chart redrawn |
| `render` | Series rendered |
| `click` | Chart background clicked |
| `selection` | Data selection made |
| `addSeries` | Series added dynamically |
| `drilldown` | Point drilled into |
| `drillup` | Drilled back up |
| `beforePrint` | Before print dialog |
| `afterPrint` | After print dialog |
| `point:mouseover` | Mouse enters a point |
| `point:mouseout` | Mouse leaves a point |
| `point:click` | Point clicked |
| `point:select` | Point selected |
| `point:unselect` | Point deselected |
| `series:show` | Series shown |
| `series:hide` | Series hidden |
| `zoom:changed` | Zoom or pan applied |

Callbacks in the `options` object receive `this` as context:

```js
chart: {
  events: {
    click(event) { console.log('clicked at', event.xAxis[0].value); }
  }
},
series: [{
  events: {
    legendItemClick() { return false; }  // return false to prevent default
  }
}]
```

---

## Export

The `ExportModule` functions can be used directly when the built-in export button is insufficient.

```js
import { ExportModule } from 'katucharts';

const svg = ExportModule.inlineStyles(chart.getSVG());

await ExportModule.exportPNG(svg, 'chart', 2);
await ExportModule.exportJPEG(svg, 'chart', 2, 0.9);
await ExportModule.exportPDF(svg, 'chart', 2);   // requires jspdf
ExportModule.exportSVG(svg, 'chart');
ExportModule.exportCSV(chart.getSeries(), 'data');
ExportModule.print(svg, 800);
```

| Function | Description |
|----------|-------------|
| `inlineStyles(svgNode)` | Clone SVG and inline computed styles; returns SVG string |
| `exportSVG(svgString, filename?)` | Download as `.svg` |
| `exportPNG(svgString, filename?, scale?)` | Render to canvas, download `.png` |
| `exportJPEG(svgString, filename?, scale?, quality?)` | Download `.jpg` (quality 0–1) |
| `exportPDF(svgString, filename?, scale?)` | Download `.pdf` — requires `jspdf` |
| `exportCSV(seriesData, filename?, options?)` | Download `.csv` |
| `getCSV(seriesData, options?)` | Return CSV as string |
| `print(svgString, maxWidth?)` | Open print dialog |
| `svgToCanvas(svgString, scale, bgColor?)` | Returns `Promise<HTMLCanvasElement>` |

---

## Custom Modules

Any module must implement `{ name: string, init(katucharts): void }`.

```js
import { BaseSeries } from 'katucharts';

class RidglineChart extends BaseSeries {
  render() {
    // use this.config, this.data, this.chart
  }
}

const RidgelineModule = {
  name: 'ridgeline',
  init(KC) {
    KC.ChartRegistry.registerType('ridgeline', RidglineChart);
  }
};

KatuCharts.use(RidgelineModule);

KatuCharts.chart('container', {
  series: [{ type: 'ridgeline', data: [...] }]
});
```

---

## License

Source-available under the [KatuCharts EULA](./LICENSE).  
Free for personal and commercial use with attribution. Paid license removes attribution requirement.

# CLAUDE.md — KatuCharts (EzD3)

## Overview

KatuCharts is a D3.js charting library at `/home/jose/KATU/EzD3`. It's consumed by IntMeta frontend (`intmeta-frontend/`) as a local file dependency (`"katucharts": "file:../../EzD3"`).

## Build & Dev

```bash
npm run build        # builds all 5 modules (index, bio, finance, datatable, react)
npm run test         # vitest
```

After changes to EzD3, rebuild and restart the frontend dev server for changes to take effect:
```bash
cd /home/jose/KATU/EzD3 && npm run build
cd /home/jose/KATU/intmeta/intmeta-frontend && npm run dev
```

## Key Source Paths

- `src/core/Chart.ts` — main orchestrator (~49KB)
- `src/series/` — all chart series implementations
- `src/components/` — Legend, Tooltip, DataLabels, Crosshair, Credits, ExportButton
- `src/axis/Axis.ts` — axis rendering
- `src/layout/LayoutEngine.ts` — chart layout
- `src/types/options.ts` — full TypeScript option interfaces (~32KB)
- `src/react/KatuChartsReact.tsx` — React wrapper
- `src/utils/` — color, format, math, dom utilities

## Chart Fix Workflow (Production Comparison)

When fixing chart rendering issues, follow this workflow:

### Reference: Production vs Local

- **Production** (reference): `https://intmeta.katudv.com`
- **Local** (KatuCharts-based): `http://localhost:3000`
- Backend: `http://localhost:8001` (must be running)

### Steps

1. **Upload the same test data** on both production and local for the tool being tested (Kraken, CheckM2, DAS Tool, VAMB, SemiBin2, CLARK, Kaiju).
   - Test data lives in `/home/jose/KATU/metagenomics_test/` and `/home/jose/KATU/intmeta/OutputsModel/`.
2. **Screenshot both versions** side by side — every chart tab/view for that tool.
3. **Identify visual discrepancies** — look at: axis labels, tick formatting, legend placement, tooltip content, colors, spacing, data label positions, chart sizing, responsive behavior, empty states.
4. **Fix in EzD3 ONLY** — all changes go to `/home/jose/KATU/EzD3/src/`. Never patch the frontend components to work around a library bug.
5. **Keep changes general-purpose** — fixes must work for any consumer of KatuCharts, not just IntMeta. Implement features as proper library features, not one-off hacks.
6. **Rebuild and verify** — `npm run build` in EzD3, then restart frontend dev server and re-check the chart.
7. **Repeat** for each chart type / tool until parity with production.

### What NOT to Do

- Do not modify `intmeta-frontend/` components to compensate for library bugs.
- Do not add IntMeta-specific logic to the library (e.g., hardcoded tool names, bioinformatics-specific heuristics in core chart code).
- Do not change the options API shape unless absolutely necessary — existing consumers depend on it.

### Common Areas Needing Attention

- **Axis**: tick count, label rotation, number formatting, category truncation
- **Tooltip**: HTML formatting, multi-series display, value formatting
- **Legend**: positioning, item spacing, symbol shapes
- **Column/Bar**: spacing between bars, group padding, border radius
- **Pie/Donut**: label connectors, percentage display, inner size
- **Scatter/Bubble**: point sizing, z-axis scaling, overlap handling
- **Heatmap**: color scale, cell borders, axis alignment
- **BoxPlot**: whisker rendering, median line, outlier markers
- **Export**: PNG/SVG fidelity, font embedding

## Code Style

- Only meaningful docstring comments, no inline obvious comments
- TypeScript strict mode
- D3.js v7 patterns

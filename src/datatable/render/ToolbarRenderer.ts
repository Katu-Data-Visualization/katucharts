/**
 * Toolbar rendering with search, column toggle, export, density and reset controls.
 */

import type {
  ToolbarOptions, SearchOptions, ExportTableOptions,
  InternalColumnDef, DataTableLangOptions, DensityMode,
} from '../../types/datatable-options';
import type { TableTheme } from '../themes/TableTheme';
import type { EventBus } from '../../core/EventBus';
import { SearchRenderer } from './SearchRenderer';
import { ICONS } from './icons';
import { openPopover, type PopoverHandle } from './popover';

type ToolbarItem = 'search' | 'columnToggle' | 'export' | 'fullscreen' | 'density' | 'reset';

export class ToolbarRenderer {
  private theme: TableTheme;
  private events: EventBus;
  private container: HTMLDivElement | null = null;
  private searchRenderer: SearchRenderer;
  private lang: DataTableLangOptions;
  private popover: PopoverHandle | null = null;
  private hasActiveFilters = false;
  private resetButton: HTMLButtonElement | null = null;

  constructor(theme: TableTheme, events: EventBus, lang: DataTableLangOptions = {}) {
    this.theme = theme;
    this.events = events;
    this.searchRenderer = new SearchRenderer(theme, events, lang);
    this.lang = lang;
  }

  /** Swap the active locale strings; takes effect on the next render. */
  setLang(lang: DataTableLangOptions): void {
    this.lang = lang;
    this.searchRenderer.setLang(lang);
  }

  setActiveFilters(active: boolean): void {
    this.hasActiveFilters = active;
  }

  /** Toggle the reset button live, without re-rendering the toolbar. */
  setResetVisible(visible: boolean): void {
    this.hasActiveFilters = visible;
    if (this.resetButton) this.resetButton.style.display = visible ? '' : 'none';
  }

  render(
    parent: HTMLElement,
    options: ToolbarOptions,
    searchOptions: SearchOptions,
    exportOptions: ExportTableOptions,
    columns: InternalColumnDef[]
  ): HTMLDivElement {
    if (this.container) this.container.remove();
    this.closeDropdown();

    this.container = document.createElement('div');
    this.container.className = 'katucharts-dt-toolbar';

    const leftGroup = document.createElement('div');
    leftGroup.className = 'katucharts-dt-toolbar-group katucharts-dt-toolbar-group--left';
    const rightGroup = document.createElement('div');
    rightGroup.className = 'katucharts-dt-toolbar-group';

    const items = (options.items ?? ['search', 'columnToggle', 'export']) as ToolbarItem[];

    for (const item of items) {
      switch (item) {
        case 'search':
          if (searchOptions.enabled !== false) this.searchRenderer.render(leftGroup, searchOptions);
          break;
        case 'reset':
          leftGroup.appendChild(this.createResetButton());
          break;
        case 'columnToggle':
          rightGroup.appendChild(this.createColumnToggle(columns));
          break;
        case 'export':
          if (exportOptions.enabled !== false) rightGroup.appendChild(this.createExportDropdown(exportOptions));
          break;
        case 'density':
          rightGroup.appendChild(this.createDensityToggle());
          break;
        case 'fullscreen':
          rightGroup.appendChild(this.createFullscreenButton());
          break;
      }
    }

    if (options.customItems) {
      for (const custom of options.customItems) {
        const btn = document.createElement('button');
        btn.className = 'katucharts-dt-btn';
        btn.innerHTML = custom.content;
        if (custom.style) Object.assign(btn.style, custom.style);
        if (custom.onClick) btn.addEventListener('click', custom.onClick);
        (custom.position === 'left' ? leftGroup : rightGroup).appendChild(btn);
      }
    }

    this.container.appendChild(leftGroup);
    this.container.appendChild(rightGroup);
    parent.appendChild(this.container);
    return this.container;
  }

  private button(label: string, icon?: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'katucharts-dt-btn';
    btn.innerHTML = `${icon ?? ''}<span>${label}</span>`;
    return btn;
  }

  private createResetButton(): HTMLButtonElement {
    const btn = this.button(this.lang.resetFilters ?? 'Reset', ICONS.x);
    btn.addEventListener('click', () => this.events.emit('filters:reset'));
    btn.style.display = this.hasActiveFilters ? '' : 'none';
    this.resetButton = btn;
    return btn;
  }

  private toggleMenu(btn: HTMLButtonElement, build: () => HTMLDivElement): void {
    if (this.popover) { this.closeDropdown(); return; }
    this.popover = openPopover(btn, build(), { align: 'right' });
  }

  private createColumnToggle(columns: InternalColumnDef[]): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    const btn = this.button(this.lang.columns ?? 'Columns', ICONS.columns);

    btn.addEventListener('click', () => this.toggleMenu(btn, () => {
      const dropdown = document.createElement('div');
      dropdown.className = 'katucharts-dt-menu';

      const label = document.createElement('div');
      label.className = 'katucharts-dt-menu-label';
      label.textContent = this.lang.toggleColumns ?? 'Toggle columns';
      dropdown.appendChild(label);

      for (const col of columns) {
        if (col.enableHiding === false) continue;
        const item = document.createElement('label');
        item.className = 'katucharts-dt-menu-item';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = col._visible;
        checkbox.addEventListener('change', () => {
          this.events.emit('column:visibility', { field: col.field, visible: checkbox.checked });
        });
        const span = document.createElement('span');
        span.textContent = col.title ?? col.field;
        item.appendChild(checkbox);
        item.appendChild(span);
        dropdown.appendChild(item);
      }
      return dropdown;
    }));

    wrapper.appendChild(btn);
    return wrapper;
  }

  private createExportDropdown(options: ExportTableOptions): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    const btn = this.button(this.lang.exportButton ?? 'Export', ICONS.download);

    btn.addEventListener('click', () => this.toggleMenu(btn, () => {
      const dropdown = document.createElement('div');
      dropdown.className = 'katucharts-dt-menu';

      const formats = options.formats ?? ['csv', 'json', 'clipboard'];
      const labels: Record<string, string> = {
        csv: this.lang.exportCSV ?? 'Export CSV',
        json: this.lang.exportJSON ?? 'Export JSON',
        clipboard: this.lang.copyClipboard ?? 'Copy to clipboard',
        html: this.lang.exportHTML ?? 'Export HTML',
      };

      for (const format of formats) {
        const item = document.createElement('div');
        item.className = 'katucharts-dt-menu-item';
        item.textContent = labels[format] ?? format;
        item.addEventListener('click', () => {
          this.events.emit('export:trigger', { format });
          this.closeDropdown();
        });
        dropdown.appendChild(item);
      }
      return dropdown;
    }));

    wrapper.appendChild(btn);
    return wrapper;
  }

  private createDensityToggle(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    const btn = this.button(this.lang.density ?? 'Density', ICONS.sliders);

    btn.addEventListener('click', () => this.toggleMenu(btn, () => {
      const dropdown = document.createElement('div');
      dropdown.className = 'katucharts-dt-menu';

      const densities: DensityMode[] = ['compact', 'normal', 'comfortable'];
      const densityLabels: Record<DensityMode, string> = {
        compact: this.lang.densityCompact ?? 'Compact',
        normal: this.lang.densityNormal ?? 'Normal',
        comfortable: this.lang.densityComfortable ?? 'Comfortable',
      };
      for (const d of densities) {
        const item = document.createElement('div');
        item.className = 'katucharts-dt-menu-item';
        if (d === this.theme.density) item.classList.add('is-active');
        item.textContent = densityLabels[d];
        item.addEventListener('click', () => {
          this.events.emit('density:change', { density: d });
          this.closeDropdown();
        });
        dropdown.appendChild(item);
      }
      return dropdown;
    }));

    wrapper.appendChild(btn);
    return wrapper;
  }

  private createFullscreenButton(): HTMLButtonElement {
    const btn = this.button('', ICONS.expand);
    btn.addEventListener('click', () => this.events.emit('fullscreen:toggle'));
    return btn;
  }

  private closeDropdown(): void {
    if (this.popover) { this.popover.close(); this.popover = null; }
  }

  getSearchRenderer(): SearchRenderer {
    return this.searchRenderer;
  }

  destroy(): void {
    this.closeDropdown();
    this.searchRenderer.destroy();
    if (this.container) { this.container.remove(); this.container = null; }
  }
}

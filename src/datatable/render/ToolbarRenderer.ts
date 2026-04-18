/**
 * Toolbar rendering with search, column toggle, export, density controls.
 */

import type {
  ToolbarOptions, SearchOptions, ExportTableOptions,
  InternalColumnDef, DataTableLangOptions, DensityMode,
} from '../../types/datatable-options';
import type { TableTheme } from '../themes/TableTheme';
import type { EventBus } from '../../core/EventBus';
import { SearchRenderer } from './SearchRenderer';

export class ToolbarRenderer {
  private theme: TableTheme;
  private events: EventBus;
  private container: HTMLDivElement | null = null;
  private searchRenderer: SearchRenderer;
  private lang: DataTableLangOptions;
  private openDropdown: HTMLDivElement | null = null;
  private outsideClickHandler: ((e: MouseEvent) => void) | null = null;

  constructor(theme: TableTheme, events: EventBus, lang: DataTableLangOptions = {}) {
    this.theme = theme;
    this.events = events;
    this.searchRenderer = new SearchRenderer(theme, events);
    this.lang = lang;
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
    Object.assign(this.container.style, this.theme.toolbarStyles());

    const leftGroup = document.createElement('div');
    leftGroup.style.display = 'flex';
    leftGroup.style.alignItems = 'center';
    leftGroup.style.gap = '8px';
    leftGroup.style.flex = '1';

    const rightGroup = document.createElement('div');
    rightGroup.style.display = 'flex';
    rightGroup.style.alignItems = 'center';
    rightGroup.style.gap = '8px';

    const items = options.items ?? ['search', 'columnToggle', 'export'];

    for (const item of items) {
      switch (item) {
        case 'search':
          if (searchOptions.enabled !== false) {
            this.searchRenderer.render(leftGroup, searchOptions);
          }
          break;
        case 'columnToggle':
          rightGroup.appendChild(this.createColumnToggle(columns));
          break;
        case 'export':
          if (exportOptions.enabled !== false) {
            rightGroup.appendChild(this.createExportDropdown(exportOptions));
          }
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
        btn.innerHTML = custom.content;
        Object.assign(btn.style, this.theme.toolbarButtonStyles());
        if (custom.style) Object.assign(btn.style, custom.style);
        if (custom.onClick) btn.addEventListener('click', custom.onClick);
        if (custom.position === 'left') leftGroup.appendChild(btn);
        else rightGroup.appendChild(btn);
      }
    }

    this.container.appendChild(leftGroup);
    this.container.appendChild(rightGroup);
    parent.appendChild(this.container);

    return this.container;
  }

  private createColumnToggle(columns: InternalColumnDef[]): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';

    const btn = document.createElement('button');
    btn.textContent = this.lang.columns ?? 'Columns';
    Object.assign(btn.style, this.theme.toolbarButtonStyles());

    btn.addEventListener('click', () => {
      if (this.openDropdown) {
        this.closeDropdown();
        return;
      }
      const dropdown = this.createColumnDropdown(columns);
      wrapper.appendChild(dropdown);
      this.openDropdown = dropdown;
      this.setupOutsideClick(wrapper);
    });

    wrapper.appendChild(btn);
    return wrapper;
  }

  private createColumnDropdown(columns: InternalColumnDef[]): HTMLDivElement {
    const dropdown = document.createElement('div');
    Object.assign(dropdown.style, this.theme.dropdownStyles());

    for (const col of columns) {
      const item = document.createElement('label');
      Object.assign(item.style, {
        ...this.theme.dropdownItemStyles(),
        cursor: 'pointer',
      });

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = col._visible;
      checkbox.style.cursor = 'pointer';

      checkbox.addEventListener('change', () => {
        this.events.emit('column:visibility', { field: col.field, visible: checkbox.checked });
      });

      const label = document.createElement('span');
      label.textContent = col.title ?? col.field;

      item.appendChild(checkbox);
      item.appendChild(label);
      dropdown.appendChild(item);
    }

    return dropdown;
  }

  private createExportDropdown(options: ExportTableOptions): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';

    const btn = document.createElement('button');
    btn.textContent = '\u21E9 Export';
    Object.assign(btn.style, this.theme.toolbarButtonStyles());

    btn.addEventListener('click', () => {
      if (this.openDropdown) {
        this.closeDropdown();
        return;
      }
      const dropdown = document.createElement('div');
      Object.assign(dropdown.style, this.theme.dropdownStyles());

      const formats = options.formats ?? ['csv', 'json', 'clipboard'];
      const labels: Record<string, string> = {
        csv: this.lang.exportCSV ?? 'Export CSV',
        json: this.lang.exportJSON ?? 'Export JSON',
        clipboard: this.lang.copyClipboard ?? 'Copy to clipboard',
        html: 'Export HTML',
      };

      for (const format of formats) {
        const item = document.createElement('div');
        item.textContent = labels[format] ?? format;
        Object.assign(item.style, this.theme.dropdownItemStyles());

        item.addEventListener('mouseenter', () => {
          item.style.backgroundColor = '#f3f4f6';
        });
        item.addEventListener('mouseleave', () => {
          item.style.backgroundColor = 'transparent';
        });

        item.addEventListener('click', () => {
          this.events.emit('export:trigger', { format });
          this.closeDropdown();
        });

        dropdown.appendChild(item);
      }

      wrapper.appendChild(dropdown);
      this.openDropdown = dropdown;
      this.setupOutsideClick(wrapper);
    });

    wrapper.appendChild(btn);
    return wrapper;
  }

  private createDensityToggle(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';

    const btn = document.createElement('button');
    btn.textContent = '\u2261 Density';
    Object.assign(btn.style, this.theme.toolbarButtonStyles());

    btn.addEventListener('click', () => {
      if (this.openDropdown) {
        this.closeDropdown();
        return;
      }
      const dropdown = document.createElement('div');
      Object.assign(dropdown.style, this.theme.dropdownStyles());

      const densities: DensityMode[] = ['compact', 'normal', 'comfortable'];
      for (const d of densities) {
        const item = document.createElement('div');
        item.textContent = d.charAt(0).toUpperCase() + d.slice(1);
        Object.assign(item.style, this.theme.dropdownItemStyles(d === this.theme.density));

        item.addEventListener('mouseenter', () => { item.style.backgroundColor = '#f3f4f6'; });
        item.addEventListener('mouseleave', () => {
          item.style.backgroundColor = d === this.theme.density ? '#f3f4f6' : 'transparent';
        });

        item.addEventListener('click', () => {
          this.events.emit('density:change', { density: d });
          this.closeDropdown();
        });

        dropdown.appendChild(item);
      }

      wrapper.appendChild(dropdown);
      this.openDropdown = dropdown;
      this.setupOutsideClick(wrapper);
    });

    wrapper.appendChild(btn);
    return wrapper;
  }

  private createFullscreenButton(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = '\u26F6';
    Object.assign(btn.style, this.theme.toolbarButtonStyles());

    btn.addEventListener('click', () => {
      this.events.emit('fullscreen:toggle');
    });

    return btn;
  }

  private closeDropdown(): void {
    if (this.openDropdown) {
      this.openDropdown.remove();
      this.openDropdown = null;
    }
    if (this.outsideClickHandler) {
      document.removeEventListener('click', this.outsideClickHandler);
      this.outsideClickHandler = null;
    }
  }

  private setupOutsideClick(wrapper: HTMLElement): void {
    this.outsideClickHandler = (e: MouseEvent) => {
      if (!wrapper.contains(e.target as Node)) {
        this.closeDropdown();
      }
    };
    setTimeout(() => {
      document.addEventListener('click', this.outsideClickHandler!);
    }, 0);
  }

  getSearchRenderer(): SearchRenderer {
    return this.searchRenderer;
  }

  destroy(): void {
    this.closeDropdown();
    this.searchRenderer.destroy();
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }
}

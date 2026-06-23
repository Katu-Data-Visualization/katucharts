/**
 * Global search input rendering.
 */

import type { SearchOptions, DataTableLangOptions } from '../../types/datatable-options';
import type { TableTheme } from '../themes/TableTheme';
import type { EventBus } from '../../core/EventBus';
import { debounce } from '../../utils/throttle';
import { ICONS } from './icons';

export class SearchRenderer {
  private theme: TableTheme;
  private events: EventBus;
  private lang: DataTableLangOptions;
  private input: HTMLInputElement | null = null;
  private container: HTMLDivElement | null = null;

  constructor(theme: TableTheme, events: EventBus, lang: DataTableLangOptions = {}) {
    this.theme = theme;
    this.events = events;
    this.lang = lang;
  }

  /** Swap the active locale strings; takes effect on the next render. */
  setLang(lang: DataTableLangOptions): void {
    this.lang = lang;
  }

  render(parent: HTMLElement, options: SearchOptions): HTMLDivElement {
    if (this.container) this.container.remove();

    this.container = document.createElement('div');
    this.container.className = 'katucharts-dt-search';

    const icon = document.createElement('span');
    icon.className = 'katucharts-dt-search-icon';
    icon.innerHTML = ICONS.search;
    this.container.appendChild(icon);

    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.className = 'katucharts-dt-input';
    this.input.placeholder = options.placeholder ?? this.lang.search ?? 'Search…';
    if (options.inputStyle) Object.assign(this.input.style, options.inputStyle);

    const debouncedEmit = debounce((query: string) => {
      this.events.emit('search:change', { query });
    }, options.debounceMs ?? 300);

    this.input.addEventListener('input', () => debouncedEmit(this.input!.value));
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.input!.value = '';
        this.events.emit('search:change', { query: '' });
      }
    });

    this.container.appendChild(this.input);
    parent.appendChild(this.container);
    return this.container;
  }

  setValue(query: string): void {
    if (this.input) this.input.value = query;
  }

  getValue(): string {
    return this.input?.value ?? '';
  }

  focus(): void {
    this.input?.focus();
  }

  destroy(): void {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    this.input = null;
  }
}

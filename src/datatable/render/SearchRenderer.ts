/**
 * Global search input rendering.
 */

import type { SearchOptions, CSSObject } from '../../types/datatable-options';
import type { TableTheme } from '../themes/TableTheme';
import type { EventBus } from '../../core/EventBus';
import { debounce } from '../../utils/throttle';

export class SearchRenderer {
  private theme: TableTheme;
  private events: EventBus;
  private input: HTMLInputElement | null = null;
  private container: HTMLDivElement | null = null;

  constructor(theme: TableTheme, events: EventBus) {
    this.theme = theme;
    this.events = events;
  }

  render(parent: HTMLElement, options: SearchOptions): HTMLDivElement {
    if (this.container) this.container.remove();

    this.container = document.createElement('div');
    this.container.className = 'katucharts-dt-search';
    this.container.style.display = 'flex';
    this.container.style.alignItems = 'center';
    this.container.style.gap = '6px';

    const icon = document.createElement('span');
    icon.textContent = '\uD83D\uDD0D';
    icon.style.fontSize = '14px';
    icon.style.color = '#9ca3af';
    this.container.appendChild(icon);

    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.placeholder = options.placeholder ?? 'Search...';
    Object.assign(this.input.style, this.theme.searchInputStyles());
    if (options.inputStyle) Object.assign(this.input.style, options.inputStyle);

    const debouncedEmit = debounce((query: string) => {
      this.events.emit('search:change', { query });
    }, options.debounceMs ?? 300);

    this.input.addEventListener('input', () => {
      debouncedEmit(this.input!.value);
    });

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

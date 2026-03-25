/**
 * Pagination controls rendering and state.
 */

import type { PaginationOptions, PageInfo, CSSObject, DataTableLangOptions } from '../../types/datatable-options';
import type { TableTheme } from '../themes/TableTheme';
import type { EventBus } from '../../core/EventBus';

export class PaginationRenderer {
  private theme: TableTheme;
  private events: EventBus;
  private container: HTMLDivElement | null = null;
  private lang: DataTableLangOptions;

  constructor(theme: TableTheme, events: EventBus, lang: DataTableLangOptions = {}) {
    this.theme = theme;
    this.events = events;
    this.lang = lang;
  }

  render(
    parent: HTMLElement,
    pageInfo: PageInfo,
    options: PaginationOptions
  ): HTMLDivElement {
    if (this.container) this.container.remove();

    this.container = document.createElement('div');
    this.container.className = 'katucharts-dt-footer';
    Object.assign(this.container.style, this.theme.paginationStyles());

    const leftSection = document.createElement('div');
    leftSection.style.display = 'flex';
    leftSection.style.alignItems = 'center';
    leftSection.style.gap = '8px';

    if (options.showPageInfo !== false) {
      const info = document.createElement('span');
      info.textContent = this.formatPageInfo(pageInfo);
      leftSection.appendChild(info);
    }

    if (options.showPageSizeSelector !== false && options.pageSizes?.length) {
      const sizeSelector = this.createPageSizeSelector(pageInfo.pageSize, options.pageSizes);
      leftSection.appendChild(sizeSelector);
    }

    const rightSection = document.createElement('div');
    rightSection.style.display = 'flex';
    rightSection.style.alignItems = 'center';
    rightSection.style.gap = '4px';

    if (options.showFirstLast !== false) {
      rightSection.appendChild(
        this.createButton(this.lang.firstPage ?? '\u00AB', 1, pageInfo.page <= 1)
      );
    }

    rightSection.appendChild(
      this.createButton(this.lang.previousPage ?? '\u2039', pageInfo.page - 1, pageInfo.page <= 1)
    );

    const pageButtons = this.getPageNumbers(pageInfo.page, pageInfo.totalPages);
    for (const pn of pageButtons) {
      if (pn === -1) {
        const ellipsis = document.createElement('span');
        ellipsis.textContent = '\u2026';
        ellipsis.style.padding = '4px 4px';
        ellipsis.style.color = '#9ca3af';
        rightSection.appendChild(ellipsis);
      } else {
        rightSection.appendChild(
          this.createButton(String(pn), pn, false, pn === pageInfo.page)
        );
      }
    }

    rightSection.appendChild(
      this.createButton(this.lang.nextPage ?? '\u203A', pageInfo.page + 1, pageInfo.page >= pageInfo.totalPages)
    );

    if (options.showFirstLast !== false) {
      rightSection.appendChild(
        this.createButton(this.lang.lastPage ?? '\u00BB', pageInfo.totalPages, pageInfo.page >= pageInfo.totalPages)
      );
    }

    this.container.appendChild(leftSection);
    this.container.appendChild(rightSection);
    parent.appendChild(this.container);

    return this.container;
  }

  private createButton(text: string, page: number, disabled: boolean, active = false): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.disabled = disabled;
    Object.assign(btn.style, this.theme.paginationButtonStyles(active, disabled));

    btn.addEventListener('mouseenter', () => {
      if (!disabled && !active) btn.style.backgroundColor = '#f3f4f6';
    });
    btn.addEventListener('mouseleave', () => {
      if (!disabled && !active) btn.style.backgroundColor = '#fff';
    });

    if (!disabled) {
      btn.addEventListener('click', () => {
        this.events.emit('page:change', { page });
      });
    }

    return btn;
  }

  private createPageSizeSelector(currentSize: number, sizes: number[]): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.gap = '4px';

    const label = document.createElement('span');
    label.textContent = this.lang.pageSizeLabel ?? 'Rows per page:';
    wrapper.appendChild(label);

    const select = document.createElement('select');
    Object.assign(select.style, this.theme.selectStyles());

    for (const size of sizes) {
      const option = document.createElement('option');
      option.value = String(size);
      option.textContent = String(size);
      if (size === currentSize) option.selected = true;
      select.appendChild(option);
    }

    select.addEventListener('change', () => {
      this.events.emit('page:sizechange', { pageSize: Number(select.value) });
    });

    wrapper.appendChild(select);
    return wrapper;
  }

  private getPageNumbers(current: number, total: number): number[] {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

    const pages: number[] = [];

    pages.push(1);

    if (current > 3) pages.push(-1);

    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (current < total - 2) pages.push(-1);

    pages.push(total);

    return pages;
  }

  private formatPageInfo(info: PageInfo): string {
    const template = this.lang.pageInfo ?? 'Showing {from}-{to} of {total}';
    return template
      .replace('{from}', String(info.from))
      .replace('{to}', String(info.to))
      .replace('{total}', String(info.totalRows));
  }

  update(pageInfo: PageInfo, options: PaginationOptions, parent: HTMLElement): void {
    this.render(parent, pageInfo, options);
  }

  destroy(): void {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }
}

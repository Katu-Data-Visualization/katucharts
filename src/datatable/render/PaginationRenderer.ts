/**
 * Pagination controls rendering and state.
 */

import type { PaginationOptions, PageInfo, DataTableLangOptions } from '../../types/datatable-options';
import type { TableTheme } from '../themes/TableTheme';
import type { EventBus } from '../../core/EventBus';
import { ICONS } from './icons';
import { openPopover, type PopoverHandle } from './popover';

export class PaginationRenderer {
  private theme: TableTheme;
  private events: EventBus;
  private container: HTMLDivElement | null = null;
  private lang: DataTableLangOptions;
  private pageSizePopover: PopoverHandle | null = null;

  constructor(theme: TableTheme, events: EventBus, lang: DataTableLangOptions = {}) {
    this.theme = theme;
    this.events = events;
    this.lang = lang;
  }

  /** Swap the active locale strings; takes effect on the next render. */
  setLang(lang: DataTableLangOptions): void {
    this.lang = lang;
  }

  render(parent: HTMLElement, pageInfo: PageInfo, options: PaginationOptions): HTMLDivElement {
    if (this.container) this.container.remove();
    this.closePageSizeMenu();

    this.container = document.createElement('div');
    this.container.className = 'katucharts-dt-footer';

    const leftSection = document.createElement('div');
    leftSection.className = 'katucharts-dt-footer-section';

    if (options.showPageInfo !== false) {
      const info = document.createElement('span');
      info.className = 'katucharts-dt-page-info';
      info.textContent = this.formatPageInfo(pageInfo);
      leftSection.appendChild(info);
    }
    if (options.showPageSizeSelector !== false && options.pageSizes?.length) {
      leftSection.appendChild(this.createPageSizeSelector(pageInfo.pageSize, options.pageSizes));
    }

    const rightSection = document.createElement('div');
    rightSection.className = 'katucharts-dt-pagination';

    if (options.showFirstLast !== false) {
      rightSection.appendChild(this.createIconButton(ICONS.chevronsLeft, 1, pageInfo.page <= 1, 'First page'));
    }
    rightSection.appendChild(this.createIconButton(ICONS.chevronLeft, pageInfo.page - 1, pageInfo.page <= 1, 'Previous page'));

    for (const pn of this.getPageNumbers(pageInfo.page, pageInfo.totalPages)) {
      if (pn === -1) {
        const ellipsis = document.createElement('span');
        ellipsis.className = 'katucharts-dt-ellipsis';
        ellipsis.textContent = '…';
        rightSection.appendChild(ellipsis);
      } else {
        rightSection.appendChild(this.createTextButton(String(pn), pn, false, pn === pageInfo.page));
      }
    }

    rightSection.appendChild(this.createIconButton(ICONS.chevronRight, pageInfo.page + 1, pageInfo.page >= pageInfo.totalPages, 'Next page'));
    if (options.showFirstLast !== false) {
      rightSection.appendChild(this.createIconButton(ICONS.chevronsRight, pageInfo.totalPages, pageInfo.page >= pageInfo.totalPages, 'Last page'));
    }

    this.container.appendChild(leftSection);
    this.container.appendChild(rightSection);
    parent.appendChild(this.container);
    return this.container;
  }

  private createButton(page: number, disabled: boolean, active: boolean, ariaLabel?: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'katucharts-dt-btn';
    if (active) btn.classList.add('is-active');
    btn.disabled = disabled;
    if (ariaLabel) btn.setAttribute('aria-label', ariaLabel);
    if (!disabled) btn.addEventListener('click', () => this.events.emit('page:change', { page }));
    return btn;
  }

  private createIconButton(icon: string, page: number, disabled: boolean, ariaLabel: string): HTMLButtonElement {
    const btn = this.createButton(page, disabled, false, ariaLabel);
    btn.innerHTML = icon;
    return btn;
  }

  private createTextButton(text: string, page: number, disabled: boolean, active: boolean): HTMLButtonElement {
    const btn = this.createButton(page, disabled, active);
    btn.textContent = text;
    return btn;
  }

  private createPageSizeSelector(currentSize: number, sizes: number[]): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'katucharts-dt-page-size';

    const label = document.createElement('span');
    label.textContent = this.lang.pageSizeLabel ?? 'Rows per page:';
    wrapper.appendChild(label);

    /**
     * A custom dropdown (not a native <select>) so the open menu is themed.
     */
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'katucharts-dt-btn katucharts-dt-page-size-btn';
    btn.setAttribute('aria-label', this.lang.pageSizeLabel ?? 'Rows per page');
    btn.innerHTML = `<span>${currentSize}</span>${ICONS.chevronsUpDown}`;

    btn.addEventListener('click', () => {
      if (this.pageSizePopover) { this.closePageSizeMenu(); return; }
      const menu = document.createElement('div');
      menu.className = 'katucharts-dt-menu';
      menu.style.minWidth = '72px';
      for (const size of sizes) {
        const item = document.createElement('div');
        item.className = 'katucharts-dt-menu-item';
        if (size === currentSize) item.classList.add('is-active');
        item.textContent = String(size);
        item.addEventListener('click', () => {
          this.closePageSizeMenu();
          this.events.emit('page:sizechange', { pageSize: size });
        });
        menu.appendChild(item);
      }
      this.pageSizePopover = openPopover(btn, menu, { align: 'left' });
    });

    wrapper.appendChild(btn);
    return wrapper;
  }

  private closePageSizeMenu(): void {
    if (this.pageSizePopover) { this.pageSizePopover.close(); this.pageSizePopover = null; }
  }

  private getPageNumbers(current: number, total: number): number[] {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages: number[] = [1];
    if (current > 3) pages.push(-1);
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    for (let i = start; i <= end; i++) pages.push(i);
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
    this.closePageSizeMenu();
    if (this.container) { this.container.remove(); this.container = null; }
  }
}

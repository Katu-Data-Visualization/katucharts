/**
 * Lightweight body-level popover positioning.
 *
 * Dropdowns and faceted filters are portalled to <body> so they are never
 * clipped by the table's `overflow:hidden` scroll containers. Because the menu
 * then lives outside the themed root, the active `--kdt-*` custom properties
 * are copied onto it so dark/branded themes are preserved.
 */

const THEME_VARS = [
  '--kdt-font-family', '--kdt-font-size', '--kdt-radius',
  '--kdt-bg', '--kdt-popover-bg', '--kdt-fg', '--kdt-muted', '--kdt-muted-fg',
  '--kdt-border', '--kdt-accent', '--kdt-accent-fg', '--kdt-primary',
];

export interface PopoverHandle {
  element: HTMLElement;
  close(): void;
}

export function openPopover(
  anchor: HTMLElement,
  content: HTMLElement,
  opts: { align?: 'left' | 'right' } = {}
): PopoverHandle {
  const root = anchor.closest('.katucharts-datatable') as HTMLElement | null;
  if (root) {
    const cs = getComputedStyle(root);
    for (const v of THEME_VARS) {
      const value = cs.getPropertyValue(v);
      if (value) content.style.setProperty(v, value);
    }
  }

  content.style.position = 'fixed';
  content.style.zIndex = '1000';
  document.body.appendChild(content);

  const position = () => {
    const r = anchor.getBoundingClientRect();
    content.style.top = `${r.bottom + 4}px`;
    if ((opts.align ?? 'left') === 'right') {
      content.style.left = 'auto';
      content.style.right = `${window.innerWidth - r.right}px`;
    } else {
      content.style.right = 'auto';
      content.style.left = `${r.left}px`;
    }
  };
  position();

  const onOutside = (e: MouseEvent) => {
    if (!content.contains(e.target as Node) && !anchor.contains(e.target as Node)) handle.close();
  };

  const handle: PopoverHandle = {
    element: content,
    close() {
      content.remove();
      window.removeEventListener('scroll', position, true);
      window.removeEventListener('resize', position);
      document.removeEventListener('mousedown', onOutside);
    },
  };

  setTimeout(() => {
    window.addEventListener('scroll', position, true);
    window.addEventListener('resize', position);
    document.addEventListener('mousedown', onOutside);
  }, 0);

  return handle;
}

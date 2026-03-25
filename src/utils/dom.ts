/**
 * DOM helper utilities.
 */

export function resolveContainer(containerOrId: string | HTMLElement): HTMLElement {
  if (typeof containerOrId === 'string') {
    const el = document.getElementById(containerOrId);
    if (!el) throw new Error(`KatuCharts: container element "${containerOrId}" not found`);
    return el;
  }
  return containerOrId;
}

export function getElementDimensions(el: HTMLElement): { width: number; height: number } {
  const computed = getComputedStyle(el);
  const padL = parseFloat(computed.paddingLeft) || 0;
  const padR = parseFloat(computed.paddingRight) || 0;
  const padT = parseFloat(computed.paddingTop) || 0;
  const padB = parseFloat(computed.paddingBottom) || 0;
  const rect = el.getBoundingClientRect();
  return {
    width: (rect.width - padL - padR) || el.clientWidth - padL - padR || 600,
    height: (rect.height - padT - padB) || el.clientHeight - padT - padB || 400,
  };
}

export function createDiv(className?: string, parent?: HTMLElement): HTMLDivElement {
  const div = document.createElement('div');
  if (className) div.className = className;
  if (parent) parent.appendChild(div);
  return div;
}

export function removeElement(el: Element | null): void {
  if (el && el.parentNode) {
    el.parentNode.removeChild(el);
  }
}

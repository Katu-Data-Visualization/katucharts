import type { RangeSelectorOptions } from '../types/options';
import { EventBus } from '../core/EventBus';
import { createDiv } from '../utils/dom';

export class RangeSelector {
  private container: HTMLDivElement | null = null;
  private config: RangeSelectorOptions;
  private events: EventBus;

  constructor(config: RangeSelectorOptions, parentContainer: HTMLElement, events: EventBus) {
    this.config = config;
    this.events = events;

    if (!config.enabled) return;

    this.container = createDiv('katucharts-range-selector', parentContainer);
    Object.assign(this.container.style, {
      display: 'flex', gap: `${config.buttonSpacing ?? 4}px`, padding: '5px', alignItems: 'center',
      flexWrap: 'wrap', fontSize: '12px',
    });

    if (config.floating) {
      this.container.style.position = 'absolute';
      this.container.style.zIndex = '10';
    }

    if (config.x !== undefined) this.container.style.left = `${config.x}px`;
    if (config.y !== undefined) this.container.style.top = `${config.y}px`;

    const buttonPos = config.buttonPosition || {};
    if (buttonPos.align === 'right') this.container.style.justifyContent = 'flex-end';
    else if (buttonPos.align === 'center') this.container.style.justifyContent = 'center';

    const buttons = config.buttons || [
      { type: 'month', count: 1, text: '1m' },
      { type: 'month', count: 3, text: '3m' },
      { type: 'month', count: 6, text: '6m' },
      { type: 'ytd', text: 'YTD' },
      { type: 'year', count: 1, text: '1y' },
      { type: 'all', text: 'All' },
    ];

    const buttonTheme = config.buttonTheme || {};
    const allEnabled = config.allButtonsEnabled ?? false;

    buttons.forEach((btn, i) => {
      const button = document.createElement('button');
      button.textContent = btn.text || btn.type || '';
      button.title = btn.title || '';

      const isSelected = i === (config.selected ?? 0);
      const selectedBg = buttonTheme['states.select.fill'] || buttonTheme.fill || '#e0e0e0';
      const normalBg = buttonTheme.fill || '#fff';

      Object.assign(button.style, {
        padding: buttonTheme.padding || '3px 8px',
        border: `1px solid ${buttonTheme.stroke || '#ccc'}`,
        borderRadius: `${buttonTheme.r ?? 3}px`,
        backgroundColor: isSelected ? selectedBg : normalBg,
        cursor: 'pointer',
        fontSize: buttonTheme['style.fontSize'] || '11px',
        fontWeight: buttonTheme['style.fontWeight'] || 'normal',
        color: buttonTheme['style.color'] || '#333',
      });

      if (!allEnabled && !isSelected) {
        button.style.opacity = '0.8';
      }

      button.addEventListener('click', () => {
        if (btn.events?.click) {
          btn.events.click.call(btn, new Event('click'));
        }

        this.container!.querySelectorAll('button').forEach(b => {
          (b as HTMLButtonElement).style.backgroundColor = normalBg;
          (b as HTMLButtonElement).style.opacity = allEnabled ? '1' : '0.8';
        });
        button.style.backgroundColor = selectedBg;
        button.style.opacity = '1';
        events.emit('rangeSelector:selected', {
          type: btn.type, count: btn.count, index: i,
        });
      });

      this.container!.appendChild(button);
    });

    if (config.inputEnabled !== false) {
      const inputPos = config.inputPosition || {};
      const inputWrapper = document.createElement('div');
      inputWrapper.style.display = 'flex';
      inputWrapper.style.alignItems = 'center';
      inputWrapper.style.gap = '4px';
      inputWrapper.style.marginLeft = inputPos.x !== undefined ? `${inputPos.x}px` : '10px';

      const inputStyle = config.inputStyle || {};
      const boxBorderColor = config.inputBoxBorderColor || '#ccc';
      const boxHeight = config.inputBoxHeight ?? 22;
      const boxWidth = config.inputBoxWidth ?? 90;

      const fromInput = document.createElement('input');
      fromInput.type = 'date';
      Object.assign(fromInput.style, {
        fontSize: (inputStyle.fontSize as string) || '11px',
        border: `1px solid ${boxBorderColor}`,
        height: `${boxHeight}px`,
        width: `${boxWidth}px`,
        padding: '0 4px',
        color: (inputStyle.color as string) || '#333',
      });

      const toInput = document.createElement('input');
      toInput.type = 'date';
      Object.assign(toInput.style, {
        fontSize: (inputStyle.fontSize as string) || '11px',
        border: `1px solid ${boxBorderColor}`,
        height: `${boxHeight}px`,
        width: `${boxWidth}px`,
        padding: '0 4px',
        color: (inputStyle.color as string) || '#333',
      });

      const applyDates = () => {
        if (fromInput.value && toInput.value) {
          events.emit('rangeSelector:dateRange', {
            from: new Date(fromInput.value).getTime(),
            to: new Date(toInput.value).getTime(),
          });
        }
      };

      fromInput.addEventListener('change', applyDates);
      toInput.addEventListener('change', applyDates);

      const labelStyle = config.labelStyle || {};
      const toLabel = document.createElement('span');
      toLabel.textContent = ' to ';
      toLabel.style.fontSize = (labelStyle.fontSize as string) || '11px';
      toLabel.style.color = (labelStyle.color as string) || '#666';

      inputWrapper.appendChild(fromInput);
      inputWrapper.appendChild(toLabel);
      inputWrapper.appendChild(toInput);
      this.container.appendChild(inputWrapper);
    }
  }

  destroy(): void {
    if (this.container) this.container.remove();
  }
}

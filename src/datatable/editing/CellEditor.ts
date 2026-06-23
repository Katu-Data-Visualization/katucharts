/**
 * Inline cell editing with built-in and custom editors.
 */

import type {
  InternalColumnDef, EditingOptions, CustomEditorFn, CustomEditorResult,
} from '../../types/datatable-options';
import type { EventBus } from '../../core/EventBus';
import type { TableTheme } from '../themes/TableTheme';

interface ActiveEditor {
  td: HTMLTableCellElement;
  column: InternalColumnDef;
  rowIndex: number;
  row: any;
  originalValue: any;
  element: HTMLElement;
  getValue: () => any;
  destroy: () => void;
}

export class CellEditor {
  private events: EventBus;
  private theme: TableTheme;
  private options: EditingOptions;
  private activeEditor: ActiveEditor | null = null;

  constructor(events: EventBus, theme: TableTheme, options: EditingOptions) {
    this.events = events;
    this.theme = theme;
    this.options = options;
  }

  startEditing(
    td: HTMLTableCellElement,
    value: any,
    row: any,
    column: InternalColumnDef,
    rowIndex: number
  ): void {
    if (!this.options.enabled) return;
    if (column.editable === false) return;
    if (this.activeEditor) this.commitOrCancel();

    const editor = this.createEditor(td, value, row, column);
    if (!editor) return;

    this.activeEditor = {
      td,
      column,
      rowIndex,
      row,
      originalValue: value,
      element: editor.element,
      getValue: editor.getValue,
      destroy: editor.destroy,
    };

    td.textContent = '';
    td.appendChild(editor.element);

    if (editor.element instanceof HTMLInputElement || editor.element instanceof HTMLSelectElement) {
      editor.element.focus();
    }

    this.events.emit('cell:edit:start', { row, column: column.field, value, rowIndex });
  }

  private createEditor(
    td: HTMLTableCellElement,
    value: any,
    row: any,
    column: InternalColumnDef
  ): { element: HTMLElement; getValue: () => any; destroy: () => void } | null {
    const editorType = column.editor ?? this.inferEditorType(column);

    if (typeof editorType === 'function') {
      const result = (editorType as CustomEditorFn)(td, value, row, column);
      return {
        element: td.lastElementChild as HTMLElement ?? td,
        getValue: result.getValue,
        destroy: result.destroy,
      };
    }

    switch (editorType) {
      case 'text': return this.createTextEditor(value);
      case 'number': return this.createNumberEditor(value);
      case 'select': return this.createSelectEditor(value, column);
      case 'date': return this.createDateEditor(value);
      case 'checkbox': return this.createCheckboxEditor(value);
      default: return this.createTextEditor(value);
    }
  }

  private createTextEditor(value: any): { element: HTMLInputElement; getValue: () => string; destroy: () => void } {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value != null ? String(value) : '';
    this.styleEditorInput(input);

    this.attachEditorEvents(input);

    return {
      element: input,
      getValue: () => input.value,
      destroy: () => input.remove(),
    };
  }

  private createNumberEditor(value: any): { element: HTMLInputElement; getValue: () => number | null; destroy: () => void } {
    const input = document.createElement('input');
    input.type = 'number';
    input.value = value != null ? String(value) : '';
    this.styleEditorInput(input);

    this.attachEditorEvents(input);

    return {
      element: input,
      getValue: () => input.value ? Number(input.value) : null,
      destroy: () => input.remove(),
    };
  }

  private createSelectEditor(value: any, column: InternalColumnDef): { element: HTMLSelectElement; getValue: () => string; destroy: () => void } {
    const select = document.createElement('select');
    this.styleEditorInput(select);

    const options = column.editorOptions ?? column.filterOptions ?? [];
    for (const opt of options) {
      const option = document.createElement('option');
      option.value = String(opt);
      option.textContent = String(opt);
      if (String(opt) === String(value)) option.selected = true;
      select.appendChild(option);
    }

    select.addEventListener('change', () => this.commit());
    select.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.cancel();
    });
    select.addEventListener('blur', () => {
      if (this.options.saveOnBlur !== false) this.commit();
      else this.cancel();
    });

    return {
      element: select,
      getValue: () => select.value,
      destroy: () => select.remove(),
    };
  }

  private createDateEditor(value: any): { element: HTMLInputElement; getValue: () => string; destroy: () => void } {
    const input = document.createElement('input');
    input.type = 'date';
    if (value) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        input.value = d.toISOString().split('T')[0];
      }
    }
    this.styleEditorInput(input);

    this.attachEditorEvents(input);

    return {
      element: input,
      getValue: () => input.value,
      destroy: () => input.remove(),
    };
  }

  private createCheckboxEditor(value: any): { element: HTMLInputElement; getValue: () => boolean; destroy: () => void } {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = Boolean(value);
    input.style.cursor = 'pointer';

    input.addEventListener('change', () => this.commit());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.cancel();
    });

    return {
      element: input,
      getValue: () => input.checked,
      destroy: () => input.remove(),
    };
  }

  private styleEditorInput(input: HTMLInputElement | HTMLSelectElement): void {
    Object.assign(input.style, {
      width: '100%',
      padding: '2px 4px',
      border: '2px solid #3b82f6',
      borderRadius: '3px',
      fontSize: 'inherit',
      fontFamily: 'inherit',
      boxSizing: 'border-box',
      outline: 'none',
      backgroundColor: '#fff',
    });
  }

  private attachEditorEvents(input: HTMLInputElement): void {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.commit();
      } else if (e.key === 'Escape') {
        this.cancel();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        this.commit();
        this.events.emit('cell:edit:tab', { shiftKey: e.shiftKey });
      }
    });

    input.addEventListener('blur', () => {
      setTimeout(() => {
        if (this.activeEditor && this.activeEditor.element === input) {
          if (this.options.saveOnBlur !== false) this.commit();
          else this.cancel();
        }
      }, 100);
    });
  }

  commit(): void {
    if (!this.activeEditor) return;

    const { column, rowIndex, row, originalValue, td } = this.activeEditor;
    const newValue = this.activeEditor.getValue();

    if (column.validator) {
      const result = column.validator(newValue, row);
      if (result !== true) {
        const msg = typeof result === 'string' ? result : 'Validation failed';
        this.showValidationError(td, msg);
        return;
      }
    }

    this.activeEditor.destroy();
    td.textContent = newValue != null ? String(newValue) : '';

    if (newValue !== originalValue) {
      this.events.emit('cell:edit:commit', {
        row,
        column: column.field,
        oldValue: originalValue,
        newValue,
        rowIndex,
      });
    }

    this.activeEditor = null;
  }

  cancel(): void {
    if (!this.activeEditor) return;

    const { column, row, originalValue, td } = this.activeEditor;
    this.activeEditor.destroy();
    td.textContent = originalValue != null ? String(originalValue) : '';

    this.events.emit('cell:edit:cancel', {
      row,
      column: column.field,
      value: originalValue,
    });

    this.activeEditor = null;
  }

  private commitOrCancel(): void {
    if (this.options.saveOnBlur !== false) {
      this.commit();
    } else {
      this.cancel();
    }
  }

  private showValidationError(td: HTMLTableCellElement, message: string): void {
    td.style.outline = '2px solid #ef4444';
    td.title = message;
    setTimeout(() => {
      td.style.outline = '';
      td.title = '';
    }, 2000);
  }

  isEditing(): boolean {
    return this.activeEditor !== null;
  }

  private inferEditorType(column: InternalColumnDef): string {
    switch (column.type) {
      case 'number': return 'number';
      case 'date': return 'date';
      case 'boolean': return 'checkbox';
      default: return 'text';
    }
  }

  destroy(): void {
    if (this.activeEditor) {
      this.activeEditor.destroy();
      this.activeEditor = null;
    }
  }
}

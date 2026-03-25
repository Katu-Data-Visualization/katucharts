/**
 * Plugin registry for chart types, enabling tree-shaking.
 */

import type { SeriesType } from '../types/options';

export interface SeriesConstructor {
  new (...args: any[]): any;
}

export interface ModuleDefinition {
  name: string;
  init: (katucharts: any) => void;
}

class SeriesRegistryClass {
  types = new Map<string, SeriesConstructor>();

  registerType(name: SeriesType | string, constructor: SeriesConstructor): void {
    this.types.set(name, constructor);
  }

  getType(name: string): SeriesConstructor | undefined {
    return this.types.get(name);
  }

  hasType(name: string): boolean {
    return this.types.has(name);
  }

  getRegisteredTypes(): string[] {
    return Array.from(this.types.keys());
  }
}

const _g = globalThis as any;
export const SeriesRegistry: SeriesRegistryClass =
  _g.__katuSeriesRegistry || (_g.__katuSeriesRegistry = new SeriesRegistryClass());

class ModuleRegistryClass {
  modules = new Map<string, ModuleDefinition>();

  register(module: ModuleDefinition): void {
    this.modules.set(module.name, module);
  }

  get(name: string): ModuleDefinition | undefined {
    return this.modules.get(name);
  }

  getAll(): ModuleDefinition[] {
    return Array.from(this.modules.values());
  }
}

export const ModuleRegistry = new ModuleRegistryClass();

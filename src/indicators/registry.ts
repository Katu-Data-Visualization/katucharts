import { Indicator } from './Indicator';

class IndicatorRegistryClass {
  private indicators = new Map<string, Indicator>();

  register(indicator: Indicator): void {
    this.indicators.set(indicator.name.toLowerCase(), indicator);
  }

  get(name: string): Indicator | undefined {
    return this.indicators.get(name.toLowerCase());
  }

  getAll(): Map<string, Indicator> {
    return new Map(this.indicators);
  }
}

export const IndicatorRegistry = new IndicatorRegistryClass();

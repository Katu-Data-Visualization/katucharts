import type { ResponsiveOptions, ResponsiveRuleOptions } from '../types/options';

export class ResponsiveEngine {
  private rules: ResponsiveRuleOptions[];
  private activeIndices: Set<number> = new Set();

  constructor(config: ResponsiveOptions) {
    this.rules = config.rules || [];
  }

  evaluate(chartWidth: number, chartHeight: number): {
    changed: boolean;
    matchingIndices: number[];
  } {
    const matching = new Set<number>();

    for (let i = 0; i < this.rules.length; i++) {
      if (this.matchesCondition(this.rules[i].condition, chartWidth, chartHeight)) {
        matching.add(i);
      }
    }

    const changed = !this.setsEqual(matching, this.activeIndices);
    this.activeIndices = matching;

    return {
      changed,
      matchingIndices: Array.from(matching),
    };
  }

  getRules(): ResponsiveRuleOptions[] {
    return this.rules;
  }

  getCurrentActiveIndices(): number[] {
    return Array.from(this.activeIndices);
  }

  reset(): void {
    this.activeIndices.clear();
  }

  private setsEqual(a: Set<number>, b: Set<number>): boolean {
    if (a.size !== b.size) return false;
    for (const v of a) {
      if (!b.has(v)) return false;
    }
    return true;
  }

  private matchesCondition(
    condition: ResponsiveRuleOptions['condition'],
    width: number,
    height: number
  ): boolean {
    if (condition.callback) return condition.callback();
    if (condition.maxWidth !== undefined && width > condition.maxWidth) return false;
    if (condition.minWidth !== undefined && width < condition.minWidth) return false;
    if (condition.maxHeight !== undefined && height > condition.maxHeight) return false;
    if (condition.minHeight !== undefined && height < condition.minHeight) return false;
    return true;
  }
}

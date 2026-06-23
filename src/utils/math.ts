export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function pick<T>(...values: (T | undefined | null)[]): T {
  for (const v of values) {
    if (v !== undefined && v !== null) return v;
  }
  return values[values.length - 1] as T;
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && isFinite(value);
}

export function normalizeAngle(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

export function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

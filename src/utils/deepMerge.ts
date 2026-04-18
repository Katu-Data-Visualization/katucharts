/**
 * Deep merge utility for option objects.
 */

const MAX_DEPTH = 20;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

export function deepMerge<T extends Record<string, any>>(target: T, ...sources: Partial<T>[]): T {
  return _deepMerge(target, sources, new WeakSet(), 0);
}

function _deepMerge<T extends Record<string, any>>(
  target: T,
  sources: Partial<T>[],
  visited: WeakSet<object>,
  depth: number
): T {
  if (depth > MAX_DEPTH) return target;

  const result = { ...target };

  for (const source of sources) {
    if (!source) continue;
    if (typeof source === 'object' && visited.has(source)) continue;
    if (typeof source === 'object') visited.add(source);

    for (const key of Object.keys(source)) {
      const srcVal = (source as any)[key];
      const tgtVal = (result as any)[key];

      if (srcVal === undefined) continue;

      if (srcVal === null) {
        (result as any)[key] = null;
      } else if (isPlainObject(srcVal) && isPlainObject(tgtVal)) {
        if (visited.has(srcVal)) continue;
        (result as any)[key] = _deepMerge(tgtVal, [srcVal], visited, depth + 1);
      } else if (Array.isArray(srcVal)) {
        (result as any)[key] = [...srcVal];
      } else {
        (result as any)[key] = srcVal;
      }
    }
  }

  return result;
}

export function deepClone<T>(obj: T): T {
  return _deepClone(obj, new WeakSet(), 0);
}

function _deepClone<T>(obj: T, visited: WeakSet<object>, depth: number): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (depth > MAX_DEPTH) return obj;
  if (visited.has(obj as object)) return obj;
  visited.add(obj as object);

  if (Array.isArray(obj)) return obj.map(item => _deepClone(item, visited, depth + 1)) as unknown as T;
  if (obj instanceof Date) return new Date(obj.getTime()) as unknown as T;

  const result = {} as T;
  for (const key of Object.keys(obj as object)) {
    (result as any)[key] = _deepClone((obj as any)[key], visited, depth + 1);
  }
  return result;
}

/**
 * Deep merge utility for option objects.
 */

const MAX_DEPTH = 20;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

export function deepMerge<T extends Record<string, any>>(target: T, ...sources: Partial<T>[]): T {
  return _deepMerge(target, sources, 0);
}

function _deepMerge<T extends Record<string, any>>(
  target: T,
  sources: Partial<T>[],
  depth: number
): T {
  /**
   * Recursion is bounded purely by depth. A per-traversal "visited" set was
   * previously used for cycle safety, but it also skipped the *second*
   * occurrence of any object shared between siblings (e.g. one style object
   * reused across two axes), dropping its merge. Depth-bounding handles cycles
   * without that false positive.
   */
  if (depth > MAX_DEPTH) return target;

  const result = { ...target };

  for (const source of sources) {
    if (!source) continue;

    /**
     * Skip keys that would rebind the prototype chain instead of setting an own
     * property, so a crafted options object (e.g. from parsed JSON) cannot reach
     * `Object.prototype` through the merge (prototype pollution).
     */
    for (const key of Object.keys(source)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      const srcVal = (source as any)[key];
      const tgtVal = (result as any)[key];

      if (srcVal === undefined) continue;

      if (srcVal === null) {
        (result as any)[key] = null;
      } else if (isPlainObject(srcVal) && isPlainObject(tgtVal)) {
        (result as any)[key] = _deepMerge(tgtVal, [srcVal], depth + 1);
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

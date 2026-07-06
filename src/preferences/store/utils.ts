/** Deep structural equality for plain, JSON-serializable preference values. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;

  const aIsArray = Array.isArray(a);
  if (aIsArray !== Array.isArray(b)) return false;
  if (aIsArray) {
    const aArr = a as unknown[];
    const bArr = b as unknown[];
    if (aArr.length !== bArr.length) return false;
    return aArr.every((v, i) => deepEqual(v, bArr[i]));
  }

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(bObj, key) &&
      deepEqual(aObj[key], bObj[key]),
  );
}

/**
 * Clones a value across a read/write boundary so a mutated object can never
 * corrupt stored state. Preference values are plain JSON-serializable data, so
 * `structuredClone` is sufficient; primitives pass straight through.
 */
export function clone<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  return structuredClone(value);
}

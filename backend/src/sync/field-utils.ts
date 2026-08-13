/**
 * YonSuite list endpoints return deeply nested objects whose exact field
 * names vary by module (e.g. an order-line's material code might come back
 * as `materialCode`, `material.code`, or `productCode` depending on the
 * endpoint). Rather than guess a single path and silently drop data when
 * we're wrong, `pick` tries a list of candidate dot-paths and returns the
 * first one that resolves to a non-empty value.
 *
 * Once you've run a real sync and inspected `raw` in Postgres (or logged a
 * sample response), narrow the candidate list in `sync.service.ts` down to
 * the actual field so future records map cleanly.
 */
export function getPath(obj: unknown, path: string): unknown {
  if (obj == null) return undefined;
  return path
    .split('.')
    .reduce<unknown>(
      (acc, key) =>
        acc != null && typeof acc === 'object'
          ? (acc as Record<string, unknown>)[key]
          : undefined,
      obj,
    );
}

export function pick(obj: unknown, candidates: string[]): unknown {
  for (const path of candidates) {
    const value = getPath(obj, path);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

export function toDisplayString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  // A candidate path resolved to an object/array instead of a primitive —
  // surface it rather than silently producing "[object Object]".
  return JSON.stringify(value);
}

export function pickString(
  obj: unknown,
  candidates: string[],
): string | undefined {
  return toDisplayString(pick(obj, candidates));
}

export function pickNumber(
  obj: unknown,
  candidates: string[],
): number | undefined {
  const value = pick(obj, candidates);
  if (value === undefined) return undefined;
  const num = Number(value);
  return Number.isNaN(num) ? undefined : num;
}

export function pickDate(obj: unknown, candidates: string[]): Date | undefined {
  const value = pick(obj, candidates);
  if (value === undefined) return undefined;
  const date = new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Finds the first array field on the object among the candidate keys. */
export function pickArray(obj: unknown, candidates: string[]): unknown[] {
  for (const path of candidates) {
    const value = getPath(obj, path);
    if (Array.isArray(value)) return value;
  }
  return [];
}

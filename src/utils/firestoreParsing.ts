export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parseString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export function parseNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function parseBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function parseStringList(value: unknown, options?: { allowEmpty?: boolean }): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => {
    if (typeof item !== 'string') {
      return false;
    }
    return options?.allowEmpty ? true : item.trim().length > 0;
  });
}

export function parseIsoDate(value: unknown, fallback?: string): string {
  const candidate = parseString(value);
  if (!candidate) {
    return fallback ?? new Date().toISOString();
  }
  const timestamp = Date.parse(candidate);
  return Number.isNaN(timestamp) ? (fallback ?? new Date().toISOString()) : candidate;
}

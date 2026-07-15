const SENSITIVE_KEY_PATTERN =
  /password|passwd|secret|token|credential|authorization|api[_-]?key|id[_-]?token/i;

function scrubValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(scrubValue);
  }

  if (typeof value === 'object') {
    return scrubObject(value as Record<string, unknown>);
  }

  return value;
}

export function scrubObject<T extends Record<string, unknown>>(input: T): T {
  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      output[key] = '[REDACTED]';
      continue;
    }

    output[key] = scrubValue(value);
  }

  return output as T;
}

export function scrubUnknownData(data: unknown): unknown {
  if (data === null || data === undefined) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(scrubUnknownData);
  }

  if (typeof data === 'object') {
    return scrubObject(data as Record<string, unknown>);
  }

  return data;
}

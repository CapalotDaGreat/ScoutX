/**
 * Validation applied to every model output before it is stored or returned: JSON object
 * only, bounded text, no links, no echoed instructions or prompt sections, references to
 * frames and timestamps that actually exist.
 */

const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+|\[[^\]]*\]\([^)]*\)/gi;
const INSTRUCTION_ECHO = [
  /ignore (?:all |any )?(?:previous|prior|above) (?:instructions|rules)/i,
  /system prompt/i,
  /USER_METADATA/,
  /###\s*(?:TRUSTED|OUTPUT|SYSTEM)/i,
  /\bas an ai (?:language )?model\b/i,
  /\byou are now\b/i,
];

export function extractJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const parsed = JSON.parse(fenced?.[1]?.trim() ?? trimmed) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('AI response was not a JSON object.');
  }
  return parsed as Record<string, unknown>;
}

export function hasInstructionEcho(text: string): boolean {
  return INSTRUCTION_ECHO.some((pattern) => pattern.test(text));
}

/** Bounded plain text; empty when the value is not text or echoes instructions. */
export function cleanModelText(value: unknown, maxLength = 600): string {
  if (typeof value !== 'string') return '';
  const text = value.replace(URL_PATTERN, '').replace(/\s+/g, ' ').trim();
  if (!text || hasInstructionEcho(text)) return '';
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}

export function cleanTextList(value: unknown, maxItems = 6, maxLength = 200): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanModelText(item, maxLength)).filter(Boolean).slice(0, maxItems);
}

/** Recursively cleans every string in a model payload; caps arrays and depth. */
export function cleanModelPayload(value: unknown, depth = 0): unknown {
  if (depth > 5) return null;
  if (typeof value === 'string') return cleanModelText(value, 1200);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => cleanModelPayload(item, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 40)
        .map(([key, item]) => [key, cleanModelPayload(item, depth + 1)]),
    );
  }
  return null;
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function timestampWithin(value: unknown, durationSec: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  const rounded = Math.round(value);
  return durationSec > 0 && rounded > durationSec ? null : rounded;
}

export function knownFrameIds(value: unknown, known: Set<string>, max = 8): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === 'string' && known.has(id)))].slice(0, max);
}

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..', '..', 'src', 'i18n', 'locales');
const LOCALES = ['de', 'fr', 'es', 'it', 'pt', 'nl'];

type Json = { [key: string]: Json | string | number | boolean | null | Json[] };

function flatten(value: Json, prefix = ''): Array<[string, unknown]> {
  return Object.entries(value).flatMap(([key, child]) =>
    child && typeof child === 'object' && !Array.isArray(child) ? flatten(child as Json, `${prefix}${key}.`) : [[`${prefix}${key}`, child] as [string, unknown]],
  );
}

const load = (locale: string, file: string) =>
  new Map(flatten(JSON.parse(readFileSync(join(root, locale, file), 'utf8').replace(/^\uFEFF/, '')) as Json));
const variables = (text: unknown) => (typeof text === 'string' ? [...text.matchAll(/\{\{\s*(\w+)/g)].map((m) => m[1]).sort().join(',') : '');

describe('translations', () => {
  for (const file of readdirSync(join(root, 'en'))) {
    test(`${file}: every locale has the same keys and placeholders as English`, () => {
      const en = load('en', file);
      for (const locale of LOCALES) {
        const other = load(locale, file);
        const missing = [...en.keys()].filter((key) => !other.has(key));
        const extra = [...other.keys()].filter((key) => !en.has(key));
        const placeholders = [...en.entries()].filter(([key, value]) => other.has(key) && variables(value) !== variables(other.get(key))).map(([key]) => key);
        assert.deepEqual({ locale, missing, extra, placeholders }, { locale, missing: [], extra: [], placeholders: [] });
      }
    });
  }
});

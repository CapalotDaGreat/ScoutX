import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { cn } from '../../src/utils/cn.ts';

describe('class merging keeps the type scale', () => {
  const config = readFileSync(new URL('../../tailwind.config.js', import.meta.url), 'utf8');
  const block = /fontSize: \{([\s\S]*?)\n {6}\},/.exec(config)?.[1] ?? '';
  const sizes = [...block.matchAll(/^\s+'?([\w-]+)'?: \[/gm)].map((match) => match[1]);

  it('finds the named sizes in the Tailwind config', () => {
    assert.ok(sizes.length >= 10);
    assert.ok(sizes.includes('caption') && sizes.includes('stat-lg'));
  });

  it('never drops a named size when a colour follows it', () => {
    for (const size of sizes) {
      const merged = cn(`text-${size} font-sans`, 'text-foreground-secondary').split(' ');
      assert.ok(merged.includes(`text-${size}`), `text-${size} was dropped`);
      assert.ok(merged.includes('text-foreground-secondary'));
    }
  });

  it('lets a later size replace an earlier one, and a later colour replace an earlier colour', () => {
    assert.equal(cn('text-body', 'text-caption'), 'text-caption');
    assert.equal(cn('text-foreground', 'text-accent'), 'text-accent');
  });
});

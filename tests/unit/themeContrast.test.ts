import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { darkColors, lightColors } from '../../src/theme/tokens/colors.ts';

/** Relative luminance per WCAG 2.x. */
function luminance(hex: string): number {
  const raw = hex.replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const channels = [0, 2, 4].map((offset) => {
    const value = Number.parseInt(full.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

const PAIRS: Array<{ name: string; fg: keyof typeof lightColors; bg: keyof typeof lightColors; min: number }> = [
  { name: 'primary on background', fg: 'textPrimary', bg: 'background', min: 4.5 },
  { name: 'secondary on background', fg: 'textSecondary', bg: 'background', min: 4.5 },
  { name: 'primary on surface', fg: 'textPrimary', bg: 'surface', min: 4.5 },
  { name: 'secondary on surface', fg: 'textSecondary', bg: 'surface', min: 4.5 },
  { name: 'error on background', fg: 'error', bg: 'background', min: 3 },
  { name: 'link on background', fg: 'textLink', bg: 'background', min: 3 },
];

describe('theme contrast (WCAG-oriented)', () => {
  for (const scheme of [
    { id: 'light', colors: lightColors },
    { id: 'dark', colors: darkColors },
  ] as const) {
    describe(scheme.id, () => {
      for (const pair of PAIRS) {
        it(`${pair.name} ≥ ${pair.min}:1`, () => {
          const ratio = contrastRatio(scheme.colors[pair.fg], scheme.colors[pair.bg]);
          assert.ok(
            ratio >= pair.min,
            `${scheme.id} ${pair.name}: ${ratio.toFixed(2)}:1 (need ≥ ${pair.min})`,
          );
        });
      }
    });
  }
});

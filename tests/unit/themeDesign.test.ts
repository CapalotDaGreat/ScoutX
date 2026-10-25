import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { darkColors, lightColors } from '../../src/theme/tokens/colors';
import { radii } from '../../src/theme/tokens/radii';

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => {
    const value = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

describe('Next Era semantic theme', () => {
  for (const [name, colors] of Object.entries({ light: lightColors, dark: darkColors })) {
    it(`${name} text and action token pairs meet 4.5:1 contrast`, () => {
      const pairs = [
        [colors.textPrimary, colors.background], [colors.textSecondary, colors.surface],
        [colors.textTertiary, colors.surface], [colors.textLink, colors.background],
        [colors.primaryForeground, colors.primary], [colors.accentForeground, colors.accent],
        [colors.goldForeground, colors.gold], [colors.error, colors.errorMuted],
        [colors.warning, colors.warningMuted], [colors.info, colors.infoMuted],
      ];
      for (const [foreground, background] of pairs) {
        const a = luminance(foreground);
        const b = luminance(background);
        const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        assert.ok(ratio >= 4.5, `${foreground} on ${background}: ${ratio.toFixed(2)}:1`);
      }
    });
  }
  it('panels stay compact without changing circular avatar tokens', () => {
    for (const [name, value] of Object.entries(radii)) {
      assert.ok(name === 'full' || value <= 8);
    }
    assert.equal(radii.full, 9999);
  });
});

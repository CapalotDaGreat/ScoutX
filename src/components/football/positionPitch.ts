/**
 * Where a stated position sits on a pitch drawn attacking upwards.
 * x: 0 (left touchline) – 1 (right); y: 0 (own goal line) – 1 (opponent goal line).
 * Presentation only: an unknown or free-text position returns null and nothing is drawn.
 */
export type PitchSpot = { x: number; y: number };

const SPOTS: Record<string, PitchSpot> = {
  GK: { x: 0.5, y: 0.06 },
  CB: { x: 0.5, y: 0.2 }, LCB: { x: 0.36, y: 0.2 }, RCB: { x: 0.64, y: 0.2 }, SW: { x: 0.5, y: 0.14 },
  LB: { x: 0.14, y: 0.26 }, RB: { x: 0.86, y: 0.26 }, LWB: { x: 0.12, y: 0.38 }, RWB: { x: 0.88, y: 0.38 },
  CDM: { x: 0.5, y: 0.36 }, DM: { x: 0.5, y: 0.36 },
  CM: { x: 0.5, y: 0.5 }, LCM: { x: 0.36, y: 0.5 }, RCM: { x: 0.64, y: 0.5 },
  LM: { x: 0.14, y: 0.54 }, RM: { x: 0.86, y: 0.54 },
  CAM: { x: 0.5, y: 0.66 }, AM: { x: 0.5, y: 0.66 },
  LW: { x: 0.16, y: 0.76 }, RW: { x: 0.84, y: 0.76 },
  SS: { x: 0.5, y: 0.78 }, CF: { x: 0.5, y: 0.82 }, ST: { x: 0.5, y: 0.88 },
};

const NAMES: Array<[RegExp, keyof typeof SPOTS]> = [
  [/^(goal\s*keeper|keeper|torwart|torh[üu]ter)$/, 'GK'],
  [/^(cent(re|er|ral)[\s-]*(back|defender)|innenverteidiger)$/, 'CB'],
  [/^(left[\s-]*back|linksverteidiger)$/, 'LB'],
  [/^(right[\s-]*back|rechtsverteidiger)$/, 'RB'],
  [/^(defensive[\s-]*mid(fielder|field)?)$/, 'CDM'],
  [/^(cent(re|er|ral)[\s-]*mid(fielder|field)?|midfielder|mittelfeld)$/, 'CM'],
  [/^(attacking[\s-]*mid(fielder|field)?)$/, 'CAM'],
  [/^(left[\s-]*wing(er)?)$/, 'LW'],
  [/^(right[\s-]*wing(er)?)$/, 'RW'],
  [/^(striker|forward|st[üu]rmer|cent(re|er)[\s-]*forward)$/, 'ST'],
];

export function pitchSpotForPosition(position: string | null | undefined): PitchSpot | null {
  const raw = (position ?? '').trim();
  if (!raw) return null;
  const code = raw.toUpperCase();
  if (SPOTS[code]) return SPOTS[code]!;
  const lower = raw.toLowerCase();
  for (const [pattern, key] of NAMES) {
    if (pattern.test(lower)) return SPOTS[key]!;
  }
  return null;
}

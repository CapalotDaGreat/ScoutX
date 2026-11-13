import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { defaultPrivacySettings } from '../../src/features/player-profile/types/privacySettings.ts';
import { buildPublicPortfolioData } from '../../src/features/public-portfolio/models/PortfolioModel.ts';
import { buildFootballCvHtml } from '../../src/features/public-portfolio/services/footballCvHtml.ts';

function portfolio(overrides: Record<string, unknown> = {}, privacy: Record<string, unknown> = {}) {
  return buildPublicPortfolioData(
    {
      id: 'p1',
      fullName: 'Ada Player',
      position: 'CM',
      club: 'FC Test',
      nationality: 'Switzerland',
      biography: 'Box-to-box midfielder.',
      username: 'tester',
      statisticsMatches: [
        { id: 'm1', date: '2026-01-01', opponent: 'Rivals <b>FC</b>', goals: 2, assists: 1, matchRating: null },
        { id: 'm2', date: '2026-02-01', opponent: 'Seedorf', goals: 0, assists: 0, matchRating: 7.5 },
      ],
      privacy: { ...defaultPrivacySettings(), publicPortfolioEnabled: true, showStatistics: true, showRecommendations: true, ...privacy },
      identity: { currentClub: 'FC Test' },
      hiddenEndorsementIds: [],
      ...overrides,
    } as never,
    [{ id: 'r1', authorName: 'Coach Kim', authorOrganization: 'FC Test', body: 'Reads the game early.' } as never],
  );
}

describe('Football CV document', () => {
  it('is refused when the Passport is not public', () => {
    assert.equal(buildFootballCvHtml(portfolio({}, { publicPortfolioEnabled: false })), null);
  });

  it('prints visible sections, escapes user text and links the Passport', () => {
    const built = buildFootballCvHtml(portfolio());
    assert.ok(built);
    assert.equal(built.fullName, 'Ada Player');
    assert.match(built.html, /Rivals &lt;b&gt;FC&lt;\/b&gt;/);
    assert.doesNotMatch(built.html, /Rivals <b>FC/);
    assert.match(built.html, /Coach Kim · FC Test/);
    assert.match(built.html, /<a href="https?:\/\/[^"]+">/);
    // An unrecorded rating is a dash, never a zero.
    assert.match(built.html, /<td class="n">—<\/td>/);
    if (process.env.CV_HTML_OUT) writeFileSync(process.env.CV_HTML_OUT, built.html);
  });

  it('names hidden sections as private and leaks none of their content', () => {
    const built = buildFootballCvHtml(portfolio({}, { showStatistics: false, showRecommendations: false }));
    assert.ok(built);
    assert.match(built.html, /Match statistics are private/);
    assert.match(built.html, /Endorsements are private/);
    assert.doesNotMatch(built.html, /Seedorf|Rivals|Coach Kim|Reads the game/);
  });

  it('leaves out empty fields instead of printing stray separators or headings', () => {
    const built = buildFootballCvHtml(portfolio({ position: '', nationality: '', biography: '  ' }));
    assert.ok(built);
    assert.doesNotMatch(built.html, /class="pos">/);
    assert.doesNotMatch(built.html, /<h2>About<\/h2>/);
    assert.doesNotMatch(built.html, /·\s*<\/div>|<div class="meta">\s*·/);
  });
});

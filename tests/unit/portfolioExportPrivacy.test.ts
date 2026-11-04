import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildPublicPortfolioData,
  filterPortfolioForPublicExport,
} from '../../src/features/public-portfolio/models/PortfolioModel.ts';
import { buildPassportShareCardData } from '../../src/features/share-cards/services/passportShareCardData.ts';
import { defaultPrivacySettings } from '../../src/features/player-profile/types/privacySettings.ts';

describe('portfolio export privacy', () => {
  it('refuses exports when the Passport is not public', () => {
    const data = buildPublicPortfolioData({
      id: 'p1',
      fullName: 'Ada Player',
      privacy: { ...defaultPrivacySettings(), publicPortfolioEnabled: false },
    } as never);
    assert.equal(filterPortfolioForPublicExport(data), null);
    assert.equal(buildPassportShareCardData(data), null);
  });

  it('omits statistics and endorsements when those sections are hidden', () => {
    const data = buildPublicPortfolioData(
      {
        id: 'p1',
        fullName: 'Ada Player',
        position: 'CM',
        club: 'FC Test',
        nationality: 'CH',
        biography: '',
        username: 'tester',
        statisticsMatches: [{ id: 'm1', date: '2026-01-01', opponent: 'Rivals', goals: 2, assists: 1 }],
        privacy: {
          ...defaultPrivacySettings(),
          publicPortfolioEnabled: true,
          showStatistics: false,
          showRecommendations: false,
        },
        identity: { currentClub: 'FC Test' },
        hiddenEndorsementIds: [],
      } as never,
      [{ id: 'r1', authorName: 'Coach', authorOrganization: 'Club', body: 'Great' } as never],
    );
    const filtered = filterPortfolioForPublicExport(data);
    assert.ok(filtered);
    assert.equal(filtered!.profile.statisticsMatches?.length ?? 0, 0);
    assert.equal(filtered!.recommendations.length, 0);
    const card = buildPassportShareCardData(data);
    assert.ok(card);
    assert.equal(card!.includeStatistics, false);
    assert.equal(card!.goals, null);
    assert.equal(card!.matches, null);
    assert.equal(card!.includeEndorsements, false);
    assert.equal(card!.endorsements, null);
  });
});

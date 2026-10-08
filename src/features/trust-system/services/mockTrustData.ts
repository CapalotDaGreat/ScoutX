import {
  type TrustProfile,
  type TrustRecommendation,
} from '@/features/trust-system/types';

const verifiedAt = '2025-11-15T09:00:00.000Z';

const mockTrustProfiles: Record<string, TrustProfile> = {
  'demo-player': {
    playerId: 'demo-player',
    player: { verified: true, verifiedAt },
    scout: { verified: false, verifiedAt: null },
    club: {
      verified: true,
      verifiedAt,
      clubId: 'club-northstar',
      clubName: 'Northstar FC',
    },
    updatedAt: verifiedAt,
  },
  'player-01': {
    playerId: 'player-01',
    player: { verified: true, verifiedAt },
    scout: { verified: false, verifiedAt: null },
    club: {
      verified: true,
      verifiedAt,
      clubId: 'club-northstar',
      clubName: 'Northstar FC',
    },
    updatedAt: verifiedAt,
  },
  'pl-001': {
    playerId: 'pl-001',
    player: { verified: true, verifiedAt },
    scout: { verified: false, verifiedAt: null },
    club: {
      verified: true,
      verifiedAt,
      clubId: 'club-ajax',
      clubName: 'Ajax',
    },
    updatedAt: verifiedAt,
  },
};

const mockRecommendations: TrustRecommendation[] = [
  {
    id: 'rec-coach-01',
    playerId: 'demo-player',
    authorId: 'coach-ruiz',
    authorName: 'Carlos Ruiz',
    authorRole: 'coach',
    authorTitle: 'Head of Youth Development',
    authorOrganization: 'Northstar FC',
    authorAvatarUrl:
      'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=200&q=80',
    type: 'coach_recommendation',
    category: 'Technical',
    relationship: 'Coached Mateo at Northstar FC U21',
    headline: 'Elite creator with professional habits',
    body: 'Mateo consistently elevates training standards. His vision between the lines is rare at this age, and he handles pressure with maturity beyond his years. I would recommend him without hesitation for a first-team pathway.',
    skills: ['Vision', 'Composure', 'Final-third creativity', 'Leadership'],
    yearsKnown: 3,
    featured: true,
    createdAt: '2025-05-20T10:00:00.000Z',
    updatedAt: '2025-05-20T10:00:00.000Z',
  },
  {
    id: 'rec-coach-02',
    playerId: 'demo-player',
    authorId: 'coach-martinez',
    authorName: 'Ana Martínez',
    authorRole: 'coach',
    authorTitle: 'Academy Technical Director',
    authorOrganization: 'Universidad Academy',
    authorAvatarUrl:
      'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=200&q=80',
    type: 'coach_recommendation',
    category: 'Technical',
    relationship: 'Developed Mateo through youth ranks (2020–2023)',
    headline: 'Technically outstanding with high football IQ',
    body: 'One of the most coachable players I have worked with. Mateo reads space early, links play intelligently, and maintains intensity in defensive transitions.',
    skills: ['Technical ability', 'Work rate', 'Tactical awareness'],
    yearsKnown: 3,
    featured: false,
    createdAt: '2025-04-10T14:30:00.000Z',
    updatedAt: '2025-04-10T14:30:00.000Z',
  },
  {
    id: 'rec-scout-01',
    playerId: 'demo-player',
    authorId: 'demo-scout',
    authorName: 'Alex Morgan',
    authorRole: 'scout',
    authorTitle: 'Senior Talent Scout',
    authorOrganization: 'PitchProof Network',
    authorAvatarUrl:
      'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=200&q=80',
    type: 'scout_endorsement',
    category: null,
    relationship: 'Observed across 12 competitive matches',
    headline: 'Top-tier creative profile for Eredivisie-level projects',
    body: 'Mateo profiles as a modern 10/8 hybrid. His progressive passing and press resistance stand out in transition-heavy leagues. Strong recommendation for clubs building possession-based systems.',
    skills: ['Progressive passing', 'Press resistance', 'Transition play'],
    yearsKnown: 1,
    featured: true,
    createdAt: '2025-06-01T08:00:00.000Z',
    updatedAt: '2025-06-01T08:00:00.000Z',
  },
  {
    id: 'rec-coach-pl001',
    playerId: 'pl-001',
    authorId: 'coach-de-jong',
    authorName: 'Pieter de Jong',
    authorRole: 'coach',
    authorTitle: 'U19 Head Coach',
    authorOrganization: 'Ajax',
    authorAvatarUrl:
      'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=200&q=80',
    type: 'coach_recommendation',
    category: 'Technical',
    relationship: 'Coached Lucas at Ajax U19',
    headline: 'Explosive winger with elite 1v1 profile',
    body: 'Lucas has the tools to break lines individually while maintaining team structure. His decision-making in the final third has improved significantly this season.',
    skills: ['Dribbling', 'Pace', 'Crossing', 'Work ethic'],
    yearsKnown: 2,
    featured: true,
    createdAt: '2025-06-15T11:00:00.000Z',
    updatedAt: '2025-06-15T11:00:00.000Z',
  },
  {
    id: 'rec-scout-pl001',
    playerId: 'pl-001',
    authorId: 'demo-scout',
    authorName: 'Alex Morgan',
    authorRole: 'scout',
    authorTitle: 'Senior Talent Scout',
    authorOrganization: 'PitchProof Network',
    authorAvatarUrl:
      'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=200&q=80',
    type: 'scout_endorsement',
    category: null,
    relationship: 'Tracked across Eredivisie U21 fixtures',
    headline: 'High-ceiling wide forward for top-five league projects',
    body: 'Lucas combines directness with end-product consistency. Profiles well for clubs needing vertical width and counter-attacking threat.',
    skills: ['1v1 dominance', 'Acceleration', 'End product'],
    yearsKnown: 1,
    featured: false,
    createdAt: '2025-06-20T09:30:00.000Z',
    updatedAt: '2025-06-20T09:30:00.000Z',
  },
];

const playerIdAliases: Record<string, string> = {
  'player-01': 'demo-player',
};

function resolvePlayerId(playerId: string): string {
  return playerIdAliases[playerId] ?? playerId;
}

export function getMockTrustProfile(playerId: string): TrustProfile | null {
  const resolvedId = resolvePlayerId(playerId);
  return mockTrustProfiles[resolvedId] ?? mockTrustProfiles[playerId] ?? null;
}

export function getMockTrustRecommendations(playerId: string): TrustRecommendation[] {
  const resolvedId = resolvePlayerId(playerId);
  return mockRecommendations.filter(
    (item) => item.playerId === resolvedId || item.playerId === playerId,
  );
}

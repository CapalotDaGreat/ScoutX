import { type PlayerProfile } from '@/features/player-profile/types';
import { mockJourneyEntries } from '@/features/football-journey/services/mockJourneyData';
import { getMockHighlightVideoLibrary } from '@/features/highlight-videos/services/mockHighlightVideos';
import { mockPlayerStatisticsMatches } from '@/features/player-statistics';

const mockProfile: PlayerProfile = {
  id: 'player-01',
  fullName: 'Mateo Alvarez',
  position: 'Attacking Midfielder',
  club: 'Northstar FC',
  nationality: 'Chilean',
  preferredFoot: 'Right',
  height: '178 cm',
  weight: '72 kg',
  biography:
    'Mateo is a technically gifted creator known for his vision, quick turns, and calm control in transition. He blends explosive dribbling with sharp final passes and is a reliable presence in high-pressure moments.',
  coverImageUrl:
    'https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&w=1200&q=80',
  avatarUrl:
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
  stats: [
    { label: 'Goals', value: '18', trend: { value: '+4 this month', direction: 'up' } },
    { label: 'Assists', value: '12', trend: { value: '+2 this week', direction: 'up' } },
    { label: 'Passing', value: '91%', trend: { value: 'Top 3 league', direction: 'neutral' } },
    { label: 'Recoveries', value: '66', trend: { value: '+8 vs last match', direction: 'up' } },
  ],
  performanceSummary: [
    { label: 'Key Passes', value: 7, max: 10, hint: 'Excellent vision' },
    { label: 'Shots on Target', value: 6, max: 10, hint: 'Clinical finishing' },
    { label: 'Pressing Intensity', value: 8, max: 10, hint: 'Consistent defensive work' },
  ],
  statisticsMatches: mockPlayerStatisticsMatches,
  identity: {
    currentClub: 'Northstar FC',
    clubHistory: [
      {
        club: 'Northstar FC',
        period: '2023–Present',
        league: 'Chilean Primera',
        appearances: 48,
        yearsAtClub: 3,
      },
      {
        club: 'Universidad Academy',
        period: '2020–2023',
        league: 'Youth',
        appearances: 62,
        yearsAtClub: 3,
      },
    ],
    careerTimeline: [
      {
        id: 'tl-1',
        type: 'club',
        title: 'Signed first professional contract',
        organization: 'Northstar FC',
        period: '2023',
        description: 'Breakthrough into senior squad.',
      },
      {
        id: 'tl-2',
        type: 'achievement',
        title: 'Youth Player of the Year',
        organization: 'Regional Federation',
        period: '2022',
      },
    ],
    preferredPositions: ['Attacking Midfielder', 'Left Winger'],
    secondaryPositions: ['Central Midfielder'],
    preferredFormation: '4-2-3-1',
    strongFoot: 'right',
    weakFootRating: 4,
    skillMovesRating: 4,
    hasCaptainExperience: true,
    jerseyNumber: 10,
    languagesSpoken: ['Spanish', 'English'],
    academicStatus: 'university',
    contractStatus: 'under_contract',
    availability: 'available',
    preferredCountries: ['Chile', 'Netherlands', 'Portugal'],
    preferredLeagues: ['Eredivisie', 'Primeira Liga'],
    preferredPlayingStyle: 'Possession-based',
    transferStatus: 'open_to_offers',
    biographyHeadline: 'Creative midfielder with elite final-third vision',
  },
  footballJourney: {
    entries: mockJourneyEntries,
    updatedAt: '2025-06-15T12:00:00.000Z',
  },
  highlightVideos: getMockHighlightVideoLibrary(),
};

export async function getMockPlayerProfile(): Promise<PlayerProfile> {
  await new Promise((resolve) => setTimeout(resolve, 700));
  return mockProfile;
}

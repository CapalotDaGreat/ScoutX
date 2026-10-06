import { type ScoutingReport } from '@/features/scouting-reports/types';

const now = '2025-06-10T10:00:00.000Z';

export const mockScoutingReports: ScoutingReport[] = [
  {
    id: 'report-demo-01',
    scoutId: 'demo-scout',
    scoutName: 'Alex Morgan',
    playerId: 'pl-001',
    playerName: 'Mateo Alvarez',
    ratings: {
      overall: 78,
      potential: 84,
      technicalAbility: 82,
      tacticalIntelligence: 80,
      physicalAbility: 71,
      mentality: 76,
    },
    strengths: [
      'Elite vision in the final third',
      'Composed under pressure',
      'Quick decision-making in transition',
    ],
    weaknesses: ['Defensive intensity drops late in matches', 'Aerial duels need improvement'],
    recommendations:
      'Monitor for six more matches, then recommend U21 national team observation camp.',
    suitablePlayingStyle: 'Possession-based',
    suggestedFormation: '4-2-3-1',
    scoutNotes:
      'Best deployed as a roaming 10 with freedom to drift wide. Thrives when allowed to receive between lines.',
    createdAt: now,
    updatedAt: now,
  },
];

export function getMockReportsForPlayer(playerId: string, scoutId: string): ScoutingReport[] {
  return mockScoutingReports.filter(
    (report) => report.playerId === playerId && report.scoutId === scoutId,
  );
}

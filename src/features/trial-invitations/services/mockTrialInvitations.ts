import { type TrialInvitation } from '@/features/trial-invitations/types';

const now = '2025-06-20T10:00:00.000Z';
const scheduled = '2025-07-12T14:00:00.000Z';

export const mockTrialInvitations: TrialInvitation[] = [
  {
    id: 'trial-demo-01',
    scoutId: 'demo-scout',
    scoutName: 'Mina Chen',
    playerId: 'demo-player',
    playerName: 'Alex Rivera',
    club: 'Northstar FC',
    coach: 'Carlos Mendez',
    location: 'Northstar Training Ground, Field 2',
    scheduledDate: scheduled,
    notes: 'Arrive 30 minutes early for registration. Bring boots and training kit.',
    status: 'pending',
    history: [
      {
        id: 'history-01',
        action: 'created',
        actorId: 'demo-scout',
        actorName: 'Mina Chen',
        actorRole: 'scout',
        timestamp: now,
      },
    ],
    messageThreadId: 'thread-trial-demo-01',
    createdAt: now,
    updatedAt: now,
  },
];

export function getMockTrialsForPlayer(playerId: string): TrialInvitation[] {
  return mockTrialInvitations.filter((trial) => trial.playerId === playerId);
}

export function getMockTrialsForScoutPlayer(
  scoutId: string,
  playerId: string,
): TrialInvitation[] {
  return mockTrialInvitations.filter(
    (trial) => trial.scoutId === scoutId && trial.playerId === playerId,
  );
}

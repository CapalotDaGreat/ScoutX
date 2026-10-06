import type { TrialReplay, TrialReplayStep } from '@/features/career-story/types';

export type TrialReplaySource = {
  id: string;
  playerId: string;
  scoutId: string;
  history: ReadonlyArray<{ id: string; action: string; timestamp: string; note?: string }>;
};

export function buildTrialReplay(invitation: TrialReplaySource): TrialReplay {
  const steps: TrialReplayStep[] = invitation.history.map((entry) => ({
    id: entry.id,
    action: entry.action,
    at: entry.timestamp,
    note: entry.note ?? null,
  }));
  return {
    trialId: invitation.id,
    playerId: invitation.playerId,
    scoutId: invitation.scoutId,
    steps,
  };
}

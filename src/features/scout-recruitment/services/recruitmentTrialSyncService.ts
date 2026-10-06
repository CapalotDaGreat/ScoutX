import { RecruitmentRepository } from '@/features/scout-recruitment/repositories/RecruitmentRepository';
import { type RecruitmentStage } from '@/features/scout-recruitment/types';
import { type TrialInvitation, type TrialStatus } from '@/features/trial-invitations/types';

function stageForTrialStatus(status: TrialStatus): RecruitmentStage {
  switch (status) {
    case 'pending':
    case 'accepted':
    case 'rescheduled':
      return 'invited';
    case 'completed':
      return 'trial';
    case 'declined':
    case 'cancelled':
      return 'follow_up';
    default:
      return 'contacted';
  }
}

export async function syncRecruitmentStageFromTrial(
  invitation: TrialInvitation,
): Promise<void> {
  const repository = RecruitmentRepository.getInstance();
  const workspace = await repository.loadWorkspace(invitation.scoutId);
  const entry = workspace.entries.find((item) => item.playerId === invitation.playerId);
  const nextStage = stageForTrialStatus(invitation.status);
  const notes = `Trial ${invitation.status} · ${invitation.club} · ${invitation.scheduledDate.slice(0, 10)}`;

  if (!entry) {
    await repository.savePlayer(
      invitation.scoutId,
      {
        playerId: invitation.playerId,
        playerName: invitation.playerName,
        playerClub: invitation.club,
        playerPosition: 'Unknown',
        playerAvatarUrl: '',
        playerOverallRating: null,
      },
      nextStage,
    );
  } else if (entry.stage !== nextStage) {
    await repository.movePlayerStage(invitation.scoutId, invitation.playerId, nextStage);
  }

  await repository.updateTrialLink(
    invitation.scoutId,
    invitation.playerId,
    invitation.id,
    notes,
  );
}

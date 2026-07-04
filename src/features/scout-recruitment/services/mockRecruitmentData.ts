import { DEFAULT_RECRUITMENT_FOLDER_ID } from '@/features/scout-recruitment/constants';
import { createEmptyWorkspace } from '@/features/scout-recruitment/models/RecruitmentModel';
import { type RecruitmentWorkspace } from '@/features/scout-recruitment/types';

export function buildDemoRecruitmentWorkspace(scoutId: string): RecruitmentWorkspace {
  const workspace = createEmptyWorkspace(scoutId);
  const now = new Date().toISOString();

  return {
    ...workspace,
    shortlists: [
      {
        id: 'shortlist-winter-targets',
        name: 'Winter Targets',
        description: 'Priority profiles for January window',
        folderId: DEFAULT_RECRUITMENT_FOLDER_ID,
        playerIds: ['pl-001', 'pl-003'],
        order: 0,
        createdAt: now,
        updatedAt: now,
      },
    ],
    entries: [
      {
        id: `${scoutId}_pl-001`,
        scoutId,
        playerId: 'pl-001',
        playerName: 'Luca Fernandez',
        playerClub: 'Ajax Amsterdam',
        playerPosition: 'CAM / LW',
        playerAvatarUrl:
          'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200&h=200&fit=crop',
        playerOverallRating: 78,
        stage: 'watching',
        folderId: DEFAULT_RECRUITMENT_FOLDER_ID,
        shortlistIds: ['shortlist-winter-targets'],
        notes: 'Strong vision, needs physical development',
        dragMetadata: { columnId: 'watching', sortIndex: 0 },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: `${scoutId}_pl-003`,
        scoutId,
        playerId: 'pl-003',
        playerName: 'Noah Williams',
        playerClub: 'Brentford FC',
        playerPosition: 'ST',
        playerAvatarUrl:
          'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop',
        playerOverallRating: 74,
        stage: 'invite_planned',
        folderId: DEFAULT_RECRUITMENT_FOLDER_ID,
        shortlistIds: ['shortlist-winter-targets'],
        notes: 'Trial scheduled for next month',
        dragMetadata: { columnId: 'invite_planned', sortIndex: 0 },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: `${scoutId}_pl-005`,
        scoutId,
        playerId: 'pl-005',
        playerName: 'Ethan Clarke',
        playerClub: 'Brighton & Hove Albion',
        playerPosition: 'CB',
        playerAvatarUrl:
          'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&h=200&fit=crop',
        playerOverallRating: 72,
        stage: 'observed',
        folderId: DEFAULT_RECRUITMENT_FOLDER_ID,
        shortlistIds: [],
        notes: '',
        dragMetadata: { columnId: 'observed', sortIndex: 0 },
        createdAt: now,
        updatedAt: now,
      },
    ],
    updatedAt: now,
  };
}

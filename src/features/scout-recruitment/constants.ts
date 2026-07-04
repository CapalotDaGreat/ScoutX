import { type RecruitmentStage } from '@/features/scout-recruitment/types';

export const RECRUITMENT_WORKSPACE_COLLECTION = 'recruitmentWorkspaces';
export const RECRUITMENT_STORAGE_KEY = '@scoutx/recruitment-workspaces';

export const RECRUITMENT_STAGES: RecruitmentStage[] = [
  'observed',
  'interested',
  'watching',
  'invite_planned',
  'trial_completed',
  'offer',
  'rejected',
  'signed',
];

export const RECRUITMENT_STAGE_LABELS: Record<RecruitmentStage, string> = {
  observed: 'Observed',
  interested: 'Interested',
  watching: 'Watching',
  invite_planned: 'Invite Planned',
  trial_completed: 'Trial Completed',
  offer: 'Offer',
  rejected: 'Rejected',
  signed: 'Signed',
};

export const RECRUITMENT_STAGE_COLORS: Record<RecruitmentStage, string> = {
  observed: '#64748B',
  interested: '#2563EB',
  watching: '#7C3AED',
  invite_planned: '#CA8A04',
  trial_completed: '#0891B2',
  offer: '#16A34A',
  rejected: '#DC2626',
  signed: '#059669',
};

export const RECRUITMENT_FOLDER_COLORS = [
  '#16A34A',
  '#2563EB',
  '#7C3AED',
  '#CA8A04',
  '#DC2626',
  '#0891B2',
] as const;

export const DEFAULT_RECRUITMENT_FOLDER_ID = 'folder-inbox';

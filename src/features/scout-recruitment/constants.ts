import { type RecruitmentStage } from '@/features/scout-recruitment/types';
import { PIPELINE_STAGES } from '@/features/scout-intelligence/services/pipelineStageMigration';

export const RECRUITMENT_WORKSPACE_COLLECTION = 'recruitmentWorkspaces';
export const RECRUITMENT_STORAGE_KEY = '@scoutx/recruitment-workspaces';

export const RECRUITMENT_STAGES: RecruitmentStage[] = [...PIPELINE_STAGES];

export const RECRUITMENT_STAGE_COLORS: Record<RecruitmentStage, string> = {
  discovered: '#64748B',
  shortlisted: '#2563EB',
  contacted: '#7C3AED',
  invited: '#CA8A04',
  trial: '#0891B2',
  evaluated: '#16A34A',
  follow_up: '#DC2626',
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

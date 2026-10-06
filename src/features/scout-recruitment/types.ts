import type { PipelineStage, StageHistoryEntry } from '@/features/scout-intelligence/types';

export type RecruitmentStage = PipelineStage;

export type RecruitmentFolder = {
  id: string;
  name: string;
  color: string;
  order: number;
  createdAt: string;
  updatedAt: string;
};

export type RecruitmentShortlist = {
  id: string;
  name: string;
  description: string;
  folderId: string | null;
  playerIds: string[];
  order: number;
  createdAt: string;
  updatedAt: string;
};

/** Prepared for future drag-and-drop: column + sort index per entry. */
export type RecruitmentDragMetadata = {
  columnId: RecruitmentStage;
  sortIndex: number;
};

export type RecruitmentEntry = {
  id: string;
  scoutId: string;
  playerId: string;
  playerName: string;
  playerClub: string;
  playerPosition: string;
  playerAvatarUrl: string;
  /** Snapshot of the discovery rating at save time; null when the player had none. */
  playerOverallRating: number | null;
  stage: RecruitmentStage;
  folderId: string | null;
  shortlistIds: string[];
  notes: string;
  trialInvitationId?: string | null;
  dragMetadata: RecruitmentDragMetadata;
  stageHistory: StageHistoryEntry[];
  createdAt: string;
  updatedAt: string;
};

export type RecruitmentWorkspace = {
  scoutId: string;
  folders: RecruitmentFolder[];
  shortlists: RecruitmentShortlist[];
  entries: RecruitmentEntry[];
  updatedAt: string;
};

export type RecruitmentFolderDraft = {
  name: string;
  color: string;
};

export type RecruitmentShortlistDraft = {
  name: string;
  description?: string;
  folderId?: string | null;
};

export type RecruitmentPlayerSnapshot = {
  playerId: string;
  playerName: string;
  playerClub: string;
  playerPosition: string;
  playerAvatarUrl: string;
  playerOverallRating: number | null;
};

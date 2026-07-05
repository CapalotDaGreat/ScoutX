import { type ReportReason } from '@/features/trust-safety/constants';

export type ContentReportTargetType = 'post' | 'user';

export type ContentReport = {
  id: string;
  reporterId: string;
  targetType: ContentReportTargetType;
  targetId: string;
  reason: ReportReason;
  details?: string;
  createdAt: string;
};

export type ContentReportDraft = {
  targetType: ContentReportTargetType;
  targetId: string;
  reason: ReportReason;
  details?: string;
};

export type BlockedUser = {
  blockerId: string;
  blockedUserId: string;
  blockedUserName: string;
  createdAt: string;
  active: boolean;
};

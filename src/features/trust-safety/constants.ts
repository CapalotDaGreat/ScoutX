export const BLOCKED_USERS_COLLECTION = 'blockedUsers';
export const CONTENT_REPORTS_COLLECTION = 'contentReports';

/** Kept in sync with functions/src/moderation/model.ts and validReportReason in firestore.rules. */
export const REPORT_REASONS = [
  { value: 'spam', label: 'Spam or misleading' },
  { value: 'harassment', label: 'Harassment or abuse' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'impersonation', label: 'Impersonation' },
  { value: 'inappropriate_contact', label: 'Inappropriate contact' },
  { value: 'copyright', label: 'Copyright' },
  { value: 'privacy', label: 'Privacy violation' },
  { value: 'appears_in_video', label: 'I appear in this video' },
  { value: 'minor_in_video', label: 'A child appears without permission' },
  { value: 'exploitation', label: 'Exploitation or grooming' },
  { value: 'safety_concern', label: 'Safety concern' },
  { value: 'other', label: 'Other' },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['value'];

export const REPORT_TARGET_TYPES = [
  'user',
  'post',
  'media',
  'reel',
  'passport',
  'scout',
  'evidenceRequest',
  'trial',
  'scoutingReport',
  'external_football_source',
] as const;

export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

const ACCOUNT_REASONS: readonly ReportReason[] = [
  'harassment',
  'inappropriate_contact',
  'impersonation',
  'exploitation',
  'safety_concern',
  'spam',
  'other',
];

const VIDEO_REASONS: readonly ReportReason[] = [
  'appears_in_video',
  'minor_in_video',
  'privacy',
  'copyright',
  'inappropriate',
  'exploitation',
  'impersonation',
  'other',
];

const CONTACT_REASONS: readonly ReportReason[] = [
  'inappropriate_contact',
  'harassment',
  'exploitation',
  'safety_concern',
  'spam',
  'other',
];

const REASONS_BY_TARGET: Record<ReportTargetType, readonly ReportReason[]> = {
  user: ACCOUNT_REASONS,
  scout: ACCOUNT_REASONS,
  post: ['spam', 'harassment', 'inappropriate', 'privacy', 'copyright', 'other'],
  media: VIDEO_REASONS,
  reel: VIDEO_REASONS,
  passport: VIDEO_REASONS,
  evidenceRequest: CONTACT_REASONS,
  trial: CONTACT_REASONS,
  scoutingReport: CONTACT_REASONS,
  external_football_source: ['impersonation', 'privacy', 'spam', 'inappropriate', 'safety_concern', 'other'],
};

export function reportReasonsFor(targetType: ReportTargetType): readonly ReportReason[] {
  return REASONS_BY_TARGET[targetType];
}

/** Targets whose id is the owning account itself. */
export function targetIsAccount(targetType: ReportTargetType): boolean {
  return targetType === 'user' || targetType === 'scout' || targetType === 'passport';
}

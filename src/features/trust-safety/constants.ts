export const BLOCKED_USERS_COLLECTION = 'blockedUsers';
export const CONTENT_REPORTS_COLLECTION = 'contentReports';

export const REPORT_REASONS = [
  { value: 'spam', label: 'Spam or misleading' },
  { value: 'harassment', label: 'Harassment or abuse' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'impersonation', label: 'Impersonation' },
  { value: 'other', label: 'Other' },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['value'];

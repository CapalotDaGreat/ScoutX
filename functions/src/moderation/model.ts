// Pure moderation rules shared by triggers, callables and unit tests.

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
] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export const REPORT_REASONS = [
  'spam',
  'harassment',
  'inappropriate',
  'impersonation',
  'inappropriate_contact',
  'copyright',
  'privacy',
  'appears_in_video',
  'minor_in_video',
  'exploitation',
  'safety_concern',
  'other',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export type CasePriority = 'urgent' | 'high' | 'normal';
export type CaseState = 'triage' | 'restricted' | 'review' | 'notified' | 'appealed' | 'closed';

export const MODERATION_ACTIONS = [
  'dismiss',
  'restrict',
  'hide',
  'remove',
  'warn',
  'suspend',
  'disable',
  'escalate',
] as const;
export type ModerationAction = (typeof MODERATION_ACTIONS)[number];

export type StaffRole = 'moderator' | 'admin';

export type HoldState = 'restricted' | 'hidden' | 'removed';

export function isReportTargetType(value: unknown): value is ReportTargetType {
  return typeof value === 'string' && (REPORT_TARGET_TYPES as readonly string[]).includes(value);
}

export function isReportReason(value: unknown): value is ReportReason {
  return typeof value === 'string' && (REPORT_REASONS as readonly string[]).includes(value);
}

export function isModerationAction(value: unknown): value is ModerationAction {
  return typeof value === 'string' && (MODERATION_ACTIONS as readonly string[]).includes(value);
}

const URGENT_REASONS: readonly ReportReason[] = ['minor_in_video', 'inappropriate_contact', 'exploitation', 'safety_concern'];
const HIGH_REASONS: readonly ReportReason[] = ['appears_in_video', 'privacy', 'harassment', 'copyright', 'impersonation'];

/** Reports involving minors, contact or exploitation are reviewed first. */
export function priorityFor(reason: ReportReason, targetOwnerIsMinor: boolean): CasePriority {
  if (URGENT_REASONS.includes(reason)) return 'urgent';
  if (HIGH_REASONS.includes(reason) || targetOwnerIsMinor) return 'high';
  return 'normal';
}

const PRIORITY_ORDER: Record<CasePriority, number> = { urgent: 0, high: 1, normal: 2 };

export function higherPriority(a: CasePriority, b: CasePriority): CasePriority {
  return PRIORITY_ORDER[a] <= PRIORITY_ORDER[b] ? a : b;
}

export function comparePriority(a: CasePriority, b: CasePriority): number {
  return PRIORITY_ORDER[a] - PRIORITY_ORDER[b];
}

/** Hours until a first review is due, by priority. */
export const REVIEW_SLA_HOURS: Record<CasePriority, number> = { urgent: 4, high: 24, normal: 72 };

/** People in a video (or their guardians) get it hidden from public view while it is reviewed. */
export function shouldAutoRestrict(targetType: ReportTargetType, reason: ReportReason): boolean {
  return (
    (targetType === 'media' || targetType === 'reel') &&
    (reason === 'minor_in_video' || reason === 'appears_in_video' || reason === 'privacy')
  );
}

const ACCOUNT_TARGETS: readonly ReportTargetType[] = ['user', 'scout', 'passport'];
const ACCOUNT_ACTIONS: readonly ModerationAction[] = ['suspend', 'disable'];

export function actionAllowedForTarget(action: ModerationAction, targetType: ReportTargetType): boolean {
  if (ACCOUNT_ACTIONS.includes(action)) return ACCOUNT_TARGETS.includes(targetType);
  return true;
}

const MODERATOR_ACTIONS: readonly ModerationAction[] = ['dismiss', 'restrict', 'hide', 'warn', 'escalate'];

export function roleMayApply(role: StaffRole, action: ModerationAction): boolean {
  return role === 'admin' || MODERATOR_ACTIONS.includes(action);
}

/** Destructive actions additionally require a sign-in within the last few minutes. */
export function isDestructive(action: ModerationAction): boolean {
  return action === 'remove' || action === 'suspend' || action === 'disable';
}

export const RECENT_AUTH_SECONDS = 15 * 60;

export function isRecentAuth(authTimeSeconds: unknown, nowMs = Date.now()): boolean {
  return typeof authTimeSeconds === 'number' && nowMs / 1000 - authTimeSeconds <= RECENT_AUTH_SECONDS;
}

export function holdStateFor(action: ModerationAction): HoldState | null {
  if (action === 'restrict') return 'restricted';
  if (action === 'hide') return 'hidden';
  if (action === 'remove') return 'removed';
  return null;
}

export function caseStateAfter(action: ModerationAction): CaseState {
  if (action === 'dismiss') return 'closed';
  if (action === 'escalate') return 'review';
  return 'notified';
}

/** Only decisions that took something away from the user can be appealed, once. */
export function isAppealable(action: ModerationAction): boolean {
  return action !== 'dismiss' && action !== 'escalate';
}

export function canAppeal(caseState: CaseState, decision: ModerationAction | null, alreadyAppealed: boolean): boolean {
  return caseState === 'notified' && decision !== null && isAppealable(decision) && !alreadyAppealed;
}

export function holdKey(targetType: ReportTargetType, targetId: string): string {
  return `${targetType}_${targetId}`;
}

export function validReason(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length >= 5 && value.length <= 1000;
}

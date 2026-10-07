export type ModerationNoticeAction =
  | 'dismiss'
  | 'restrict'
  | 'hide'
  | 'remove'
  | 'warn'
  | 'suspend'
  | 'disable'
  | 'escalate'
  | 'restored'
  | 'appeal_upheld'
  | 'appeal_overturned';

export type AppealStatus = 'pending' | 'upheld' | 'overturned';

/** A decision about the user's own content, written by the moderation callables. */
export type ModerationNotice = {
  caseId: string;
  targetType: string;
  action: ModerationNoticeAction;
  reasonCode: string;
  appealable: boolean;
  appealStatus: AppealStatus | null;
  at: string;
};

const ACTIONS: readonly ModerationNoticeAction[] = [
  'dismiss',
  'restrict',
  'hide',
  'remove',
  'warn',
  'suspend',
  'disable',
  'escalate',
  'restored',
  'appeal_upheld',
  'appeal_overturned',
];

export function parseModerationNotice(id: string, data: Record<string, unknown>): ModerationNotice | null {
  const action = ACTIONS.find((value) => value === data.action);
  if (!action || typeof data.at !== 'string') return null;
  const appealStatus =
    data.appealStatus === 'pending' || data.appealStatus === 'upheld' || data.appealStatus === 'overturned'
      ? data.appealStatus
      : null;
  return {
    caseId: typeof data.caseId === 'string' ? data.caseId : id,
    targetType: typeof data.targetType === 'string' ? data.targetType : 'user',
    action,
    reasonCode: typeof data.reasonCode === 'string' ? data.reasonCode : 'other',
    appealable: data.appealable === true && appealStatus === null,
    appealStatus,
    at: data.at,
  };
}

import './authSecurityPolicy';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';

export { generateAiInsight } from './aiCoach';
export { analyzeMatchFootage } from './matchAnalysis';
export { generateHighlightReelPlan } from './highlightReelStudio';
export { scheduleWeeklyFootballReports } from './weeklyReportScheduler';
export {
  archiveContentReport,
  listAdminReviewQueue,
  resolveVerificationRequest,
} from './adminReview';
export { recordPortfolioView } from './portfolioAnalytics';
export { deleteAuthenticatedAccount, persistAppleAuthorizationCode } from './appleAuth';

initializeApp();

type PushTokenDoc = {
  token?: string;
  userId?: string;
};

type ActivityDoc = {
  recipientId?: string;
  actorId?: string;
  title?: string;
  body?: string;
  type?: string;
};

const HOUR_MS = 60 * 60 * 1000;

/** Minimum gap between pushes of the same type to one recipient, to prevent notification spam. */
const PUSH_COOLDOWN_MS: Record<string, number> = {
  portfolio_viewed: 6 * HOUR_MS,
  recommendation_received: 0.25 * HOUR_MS,
  milestone_earned: 1 * HOUR_MS,
  weekly_report_ready: 24 * HOUR_MS,
  trial_invitation: 0,
};

const PUSH_THROTTLE_COLLECTION = 'pushThrottle';

/** Atomically claims a push slot; returns false when the recipient was notified too recently. */
async function claimPushSlot(recipientId: string, type: string): Promise<boolean> {
  const cooldown = PUSH_COOLDOWN_MS[type] ?? 0;
  if (cooldown <= 0) {
    return true;
  }
  const db = getFirestore();
  const ref = db.collection(PUSH_THROTTLE_COLLECTION).doc(recipientId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const lastSent = (snapshot.data()?.[type] as number | undefined) ?? 0;
    const now = Date.now();
    if (now - lastSent < cooldown) {
      return false;
    }
    transaction.set(ref, { [type]: now }, { merge: true });
    return true;
  });
}

async function sendExpoPush(token: string, title: string, body: string): Promise<void> {
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: token,
      sound: 'default',
      title,
      body,
      priority: 'high',
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Expo push failed (${response.status}): ${text}`);
  }
}

export const onActivityCreatedPush = onDocumentCreated(
  'activities/{activityId}',
  async (event) => {
    const activity = event.data?.data() as ActivityDoc | undefined;
    if (!activity?.recipientId || !activity.title || !activity.body) {
      return;
    }

    if (!activity.type || !(activity.type in PUSH_COOLDOWN_MS)) {
      return;
    }

    if (activity.type === 'portfolio_viewed' && activity.actorId === activity.recipientId) {
      return;
    }

    if (!(await claimPushSlot(activity.recipientId, activity.type))) {
      logger.info('Push throttled', { recipientId: activity.recipientId, type: activity.type });
      return;
    }

    const tokenSnapshot = await getFirestore()
      .collection('pushTokens')
      .doc(activity.recipientId)
      .get();

    const tokenData = tokenSnapshot.data() as PushTokenDoc | undefined;
    if (!tokenData?.token) {
      logger.info('No push token for recipient', { recipientId: activity.recipientId });
      return;
    }

    try {
      await sendExpoPush(tokenData.token, activity.title, activity.body);
      logger.info('Push notification sent', {
        recipientId: activity.recipientId,
        type: activity.type,
      });
    } catch (error) {
      logger.error('Failed to send push notification', {
        recipientId: activity.recipientId,
        error,
      });
    }
  },
);

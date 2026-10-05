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
  title?: string;
  body?: string;
  type?: string;
};

const PUSHABLE_ACTIVITY_TYPES = new Set([
  'portfolio_viewed',
  'recommendation_received',
  'milestone_earned',
  'weekly_report_ready',
  'trial_invitation',
]);

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

    if (activity.type && !PUSHABLE_ACTIVITY_TYPES.has(activity.type)) {
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

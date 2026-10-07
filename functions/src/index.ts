import './authSecurityPolicy';
import { initializeApp } from 'firebase-admin/app';

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
export { purgeLegacyGpsLocation } from './gpsPrivacy';
export { confirmRole } from './roleClaims';
export { onProfileWrittenProjectPassport, refreshPublicPassport } from './publicPassport';
export {
  onProfileWrittenProjectDiscovery,
  onPassportSummaryWrittenProjectDiscovery,
  recordDiscoverableView,
  searchDiscoverablePlayers,
} from './discoveryProjection';
export { onRecruitmentEntryWritten, onPassportSummaryWrittenNotifyWatchers } from './watchlist';
export { fulfillEvidenceRequest, requestEvidence } from './evidenceRequests';
export { onVerificationWrittenSyncTrust } from './trustSync';
export { askThisMatch } from './askThisMatch';
export { getMediaPlaybackUrl } from './mediaAccess';
export { exportReel, onReelExportQueued } from './reelRender';
export { deleteAuthenticatedAccount, persistAppleAuthorizationCode } from './appleAuth';

export { onActivityCreatedPush } from './pushDelivery';
export {
  onMatchAnalysisJobFinishedNotify,
  onPassportSummaryWrittenNotifyOwner,
  onTrialInvitationCreatedNotify,
  onTrialInvitationUpdatedNotify,
  onTrustRecommendationCreatedNotify,
  sendDevelopmentReminders,
} from './notificationProducers';

initializeApp();

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
export { confirmRole } from './roleClaims';
export { onProfileWrittenProjectPassport, refreshPublicPassport } from './publicPassport';
export {
  onProfileWrittenProjectDiscovery,
  onPassportSummaryWrittenProjectDiscovery,
  recordDiscoverableView,
  searchDiscoverablePlayers,
} from './discoveryProjection';
export { onRecruitmentEntryWritten, onPassportSummaryWrittenNotifyWatchers } from './watchlist';
export { requestEvidence } from './evidenceRequests';
export { onVerificationWrittenSyncTrust } from './trustSync';
export { askThisMatch } from './askThisMatch';
export { getMediaPlaybackUrl, exportReel } from './mediaAccess';
export { deleteAuthenticatedAccount, persistAppleAuthorizationCode } from './appleAuth';

export { onActivityCreatedPush } from './pushDelivery';
export {
  onMatchAnalysisJobFinishedNotify,
  onPassportSummaryWrittenNotifyOwner,
  onTrialInvitationUpdatedNotify,
  sendDevelopmentReminders,
} from './notificationProducers';

initializeApp();

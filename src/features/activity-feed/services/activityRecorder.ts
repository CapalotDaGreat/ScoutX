import { ActivityRepository } from '@/features/activity-feed/repositories/ActivityRepository';
import {
  buildPlayerSavedActivity,
  buildProfileUpdatedActivity,
  buildRecommendationReceivedActivity,
  buildPortfolioViewedActivity,
  buildScoutingReportActivity,
  buildTrialInvitationActivity,
  buildVideoUploadedActivity,
  buildMilestoneEarnedActivity,
  buildWeeklyReportReadyActivity,
} from '@/features/activity-feed/services/activityEmitters';
import { type ActivityDraft } from '@/features/activity-feed/types';

export class ActivityRecorder {
  private static instance: ActivityRecorder | null = null;
  private readonly repository = ActivityRepository.getInstance();

  private constructor() {}

  public static getInstance(): ActivityRecorder {
    if (!this.instance) {
      this.instance = new ActivityRecorder();
    }
    return this.instance;
  }

  public record(draft: ActivityDraft): void {
    void this.repository.recordActivity(draft).catch(() => undefined);
  }

  public recordProfileUpdated(playerId: string, playerName: string): void {
    this.record(buildProfileUpdatedActivity(playerId, playerName));
  }

  public recordTrialInvitation(input: Parameters<typeof buildTrialInvitationActivity>[0]): void {
    this.record(buildTrialInvitationActivity(input));
  }

  public recordScoutingReport(input: Parameters<typeof buildScoutingReportActivity>[0]): void {
    this.record(buildScoutingReportActivity(input));
  }

  public recordVideoUploaded(input: Parameters<typeof buildVideoUploadedActivity>[0]): void {
    this.record(buildVideoUploadedActivity(input));
  }

  public recordPlayerSaved(input: Parameters<typeof buildPlayerSavedActivity>[0]): void {
    this.record(buildPlayerSavedActivity(input));
  }

  public recordRecommendationReceived(
    input: Parameters<typeof buildRecommendationReceivedActivity>[0],
  ): void {
    this.record(buildRecommendationReceivedActivity(input));
  }

  public recordPortfolioViewed(input: Parameters<typeof buildPortfolioViewedActivity>[0]): void {
    this.record(buildPortfolioViewedActivity(input));
  }

  public recordMilestoneEarned(input: Parameters<typeof buildMilestoneEarnedActivity>[0]): void {
    this.record(buildMilestoneEarnedActivity(input));
  }

  public recordWeeklyReportReady(input: Parameters<typeof buildWeeklyReportReadyActivity>[0]): void {
    this.record(buildWeeklyReportReadyActivity(input));
  }
}

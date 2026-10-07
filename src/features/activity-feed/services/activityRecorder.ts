import { ActivityRepository } from '@/features/activity-feed/repositories/ActivityRepository';
import {
  buildPlayerSavedActivity,
  buildProfileUpdatedActivity,
  buildScoutingReportActivity,
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

  /** Scouting reports are private to the scout; the player is never notified. */
  public recordOwnScoutingReport(input: Parameters<typeof buildScoutingReportActivity>[0]): void {
    if (input.recipientId !== input.scoutId) {
      return;
    }
    this.record(buildScoutingReportActivity(input));
  }

  public recordVideoUploaded(input: Parameters<typeof buildVideoUploadedActivity>[0]): void {
    this.record(buildVideoUploadedActivity(input));
  }

  public recordPlayerSaved(input: Parameters<typeof buildPlayerSavedActivity>[0]): void {
    this.record(buildPlayerSavedActivity(input));
  }

  public recordMilestoneEarned(input: Parameters<typeof buildMilestoneEarnedActivity>[0]): void {
    this.record(buildMilestoneEarnedActivity(input));
  }

  public recordWeeklyReportReady(input: Parameters<typeof buildWeeklyReportReadyActivity>[0]): void {
    this.record(buildWeeklyReportReadyActivity(input));
  }
}

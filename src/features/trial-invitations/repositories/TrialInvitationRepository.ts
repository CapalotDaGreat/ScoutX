import {
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  where,
  orderBy,
} from 'firebase/firestore';
import { getFirestoreDb } from '@/config/firebase';
import {
  TRIAL_INVITATION_COLLECTION,
  TRIAL_NOTIFICATION_COLLECTION,
} from '@/features/trial-invitations/constants';
import {
  applyTrialAcceptance,
  applyTrialCancellation,
  applyTrialDecline,
  applyTrialReschedule,
  buildTrialInvitation,
  parseTrialInvitation,
  parseTrialNotification,
  serializeTrialInvitation,
  serializeTrialNotification,
  sortTrialInvitations,
  sortTrialNotifications,
} from '@/features/trial-invitations/models/TrialInvitationModel';
import { ActivityRecorder } from '@/features/activity-feed/services/activityRecorder';
import {
  buildInvitationAcceptedNotifications,
  buildInvitationCancelledNotifications,
  buildInvitationCreatedNotifications,
  buildInvitationDeclinedNotifications,
  buildInvitationRescheduledNotifications,
} from '@/features/trial-invitations/services/trialNotificationService';
import {
  loadLocalTrialInvitationsForPlayer,
  loadLocalTrialInvitationsForScoutPlayer,
  loadLocalTrialNotifications,
  markLocalNotificationRead,
  saveLocalTrialInvitation,
  saveLocalTrialNotification,
} from '@/features/trial-invitations/services/trialInvitationStorage';
import { syncRecruitmentStageFromTrial } from '@/features/scout-recruitment/services/recruitmentTrialSyncService';
import {
  type TrialInvitation,
  type TrialInvitationDraft,
  type TrialNotification,
} from '@/features/trial-invitations/types';

export class TrialInvitationRepository {
  private static instance: TrialInvitationRepository | null = null;

  private constructor() {}

  public static getInstance(): TrialInvitationRepository {
    if (!this.instance) {
      this.instance = new TrialInvitationRepository();
    }
    return this.instance;
  }

  public subscribeToPlayerTrials(
    playerId: string,
    callback: (trials: TrialInvitation[]) => void,
    onError?: (error: Error) => void,
  ): () => void {
    const db = getFirestoreDb();
    if (!db) {
      void loadLocalTrialInvitationsForPlayer(playerId).then(callback);
      return () => undefined;
    }

    const trialsQuery = query(
      collection(db, TRIAL_INVITATION_COLLECTION),
      where('playerId', '==', playerId),
      orderBy('updatedAt', 'desc'),
    );

    return onSnapshot(
      trialsQuery,
      (snapshot) => {
        const trials = snapshot.docs
          .map((document) => parseTrialInvitation(document.data(), document.id))
          .filter((trial): trial is TrialInvitation => trial !== null);
        callback(sortTrialInvitations(trials));
      },
      (error) => {
        void loadLocalTrialInvitationsForPlayer(playerId).then(callback);
        onError?.(error);
      },
    );
  }

  public subscribeToScoutPlayerTrials(
    scoutId: string,
    playerId: string,
    callback: (trials: TrialInvitation[]) => void,
    onError?: (error: Error) => void,
  ): () => void {
    const db = getFirestoreDb();
    if (!db) {
      void loadLocalTrialInvitationsForScoutPlayer(scoutId, playerId).then(callback);
      return () => undefined;
    }

    const trialsQuery = query(
      collection(db, TRIAL_INVITATION_COLLECTION),
      where('scoutId', '==', scoutId),
      where('playerId', '==', playerId),
      orderBy('updatedAt', 'desc'),
    );

    return onSnapshot(
      trialsQuery,
      (snapshot) => {
        const trials = snapshot.docs
          .map((document) => parseTrialInvitation(document.data(), document.id))
          .filter((trial): trial is TrialInvitation => trial !== null);
        callback(sortTrialInvitations(trials));
      },
      (error) => {
        void loadLocalTrialInvitationsForScoutPlayer(scoutId, playerId).then(callback);
        onError?.(error);
      },
    );
  }

  public subscribeToNotifications(
    recipientId: string,
    callback: (notifications: TrialNotification[]) => void,
    onError?: (error: Error) => void,
  ): () => void {
    const db = getFirestoreDb();
    if (!db) {
      void loadLocalTrialNotifications(recipientId).then(callback);
      return () => undefined;
    }

    const notificationsQuery = query(
      collection(db, TRIAL_NOTIFICATION_COLLECTION),
      where('recipientId', '==', recipientId),
      orderBy('createdAt', 'desc'),
    );

    return onSnapshot(
      notificationsQuery,
      (snapshot) => {
        const notifications = snapshot.docs
          .map((document) => parseTrialNotification(document.data(), document.id))
          .filter((item): item is TrialNotification => item !== null);
        callback(sortTrialNotifications(notifications));
      },
      (error) => {
        void loadLocalTrialNotifications(recipientId).then(callback);
        onError?.(error);
      },
    );
  }

  public async createInvitation(
    scoutId: string,
    scoutName: string,
    playerId: string,
    playerName: string,
    draft: TrialInvitationDraft,
  ): Promise<TrialInvitation> {
    const invitation = buildTrialInvitation(scoutId, scoutName, playerId, playerName, draft);
    await this.persistInvitation(invitation);
    await this.persistNotifications(buildInvitationCreatedNotifications(invitation));
    ActivityRecorder.getInstance().recordTrialInvitation({
      playerId,
      playerName,
      scoutId,
      scoutName,
      trialId: invitation.id,
      club: invitation.club,
    });
    return invitation;
  }

  public async acceptInvitation(
    invitation: TrialInvitation,
    playerId: string,
    playerName: string,
    note?: string,
  ): Promise<TrialInvitation> {
    const updated = applyTrialAcceptance(invitation, playerId, playerName, note);
    await this.persistInvitation(updated);
    await this.persistNotifications(buildInvitationAcceptedNotifications(updated));
    return updated;
  }

  public async declineInvitation(
    invitation: TrialInvitation,
    playerId: string,
    playerName: string,
    note?: string,
  ): Promise<TrialInvitation> {
    const updated = applyTrialDecline(invitation, playerId, playerName, note);
    await this.persistInvitation(updated);
    await this.persistNotifications(buildInvitationDeclinedNotifications(updated));
    return updated;
  }

  public async rescheduleInvitation(
    invitation: TrialInvitation,
    scoutId: string,
    scoutName: string,
    draft: TrialInvitationDraft,
  ): Promise<TrialInvitation> {
    const updated = applyTrialReschedule(invitation, scoutId, scoutName, draft);
    await this.persistInvitation(updated);
    await this.persistNotifications(buildInvitationRescheduledNotifications(updated));
    return updated;
  }

  public async cancelInvitation(
    invitation: TrialInvitation,
    scoutId: string,
    scoutName: string,
    note?: string,
  ): Promise<TrialInvitation> {
    const updated = applyTrialCancellation(invitation, scoutId, scoutName, note);
    await this.persistInvitation(updated);
    await this.persistNotifications(buildInvitationCancelledNotifications(updated));
    return updated;
  }

  public async markNotificationRead(
    recipientId: string,
    notificationId: string,
  ): Promise<void> {
    const db = getFirestoreDb();
    if (db) {
      try {
        await setDoc(
          doc(db, TRIAL_NOTIFICATION_COLLECTION, notificationId),
          { read: true },
          { merge: true },
        );
        return;
      } catch {
        // Fall through to local storage.
      }
    }
    await markLocalNotificationRead(recipientId, notificationId);
  }

  private async persistInvitation(invitation: TrialInvitation): Promise<void> {
    const db = getFirestoreDb();
    if (db) {
      try {
        await setDoc(
          doc(db, TRIAL_INVITATION_COLLECTION, invitation.id),
          serializeTrialInvitation(invitation),
        );
        await syncRecruitmentStageFromTrial(invitation).catch(() => undefined);
        return;
      } catch {
        // Fall through to local storage.
      }
    }
    await saveLocalTrialInvitation(invitation);
    await syncRecruitmentStageFromTrial(invitation).catch(() => undefined);
  }

  private async persistNotifications(notifications: TrialNotification[]): Promise<void> {
    const db = getFirestoreDb();
    for (const notification of notifications) {
      if (db) {
        try {
          await setDoc(
            doc(db, TRIAL_NOTIFICATION_COLLECTION, notification.id),
            serializeTrialNotification(notification),
          );
          continue;
        } catch {
          // Fall through to local storage.
        }
      }
      await saveLocalTrialNotification(notification);
    }
  }
}

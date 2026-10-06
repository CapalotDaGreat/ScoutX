import {
  collection,
  doc,
  query,
  setDoc,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';
import { useMockData } from '@/config/appMode';
import { getFirestoreDb } from '@/config/firebase';
import { LISTENER_LIMITS, subscribeToQuery } from '@/firebase/firestoreSubscriptions';
import { ACTIVITY_COLLECTION } from '@/features/activity-feed/constants';
import {
  buildActivityFromDraft,
  parseActivity,
  serializeActivity,
  sortActivities,
} from '@/features/activity-feed/models/ActivityModel';
import {
  loadLocalActivities,
  markAllLocalActivitiesRead,
  markLocalActivityRead,
  upsertLocalActivity,
} from '@/features/activity-feed/services/activityStorage';
import { getMockActivities } from '@/features/activity-feed/services/mockActivityData';
import { type ActivityDraft, type ActivityItem } from '@/features/activity-feed/types';

export class ActivityRepository {
  private static instance: ActivityRepository | null = null;

  private constructor() {}

  public static getInstance(): ActivityRepository {
    if (!this.instance) {
      this.instance = new ActivityRepository();
    }
    return this.instance;
  }

  public subscribeToActivities(
    recipientId: string,
    recipientRole: 'player' | 'scout',
    callback: (activities: ActivityItem[]) => void,
    onError?: (error: Error) => void,
  ): () => void {
    const db = getFirestoreDb();

    if (!db) {
      void this.resolveActivities(recipientId, recipientRole).then(callback);
      return () => undefined;
    }

    const activitiesQuery = query(
      collection(db, ACTIVITY_COLLECTION),
      where('recipientId', '==', recipientId),
      orderBy('createdAt', 'desc'),
      limit(LISTENER_LIMITS.activities),
    );

    return subscribeToQuery({
      firestoreQuery: activitiesQuery,
      parse: (data, id) => parseActivity(data, id),
      onData: (activities) => callback(sortActivities(activities)),
      onFallback: () => {
        void this.resolveActivities(recipientId, recipientRole).then(callback);
      },
      onEmptyFallback: () => {
        void this.resolveActivities(recipientId, recipientRole).then(callback);
      },
      onError,
    });
  }

  public async recordActivity(draft: ActivityDraft): Promise<ActivityItem> {
    const activity = buildActivityFromDraft(draft);
    const db = getFirestoreDb();

    if (db) {
      try {
        await setDoc(doc(db, ACTIVITY_COLLECTION, activity.id), serializeActivity(activity));
        return activity;
      } catch {
        await upsertLocalActivity(activity);
        return activity;
      }
    }

    await upsertLocalActivity(activity);
    return activity;
  }

  public async markActivityRead(recipientId: string, activityId: string): Promise<void> {
    const db = getFirestoreDb();

    if (db) {
      try {
        await setDoc(doc(db, ACTIVITY_COLLECTION, activityId), { read: true }, { merge: true });
        return;
      } catch {
        await markLocalActivityRead(recipientId, activityId);
        return;
      }
    }

    await markLocalActivityRead(recipientId, activityId);
  }

  public async markAllActivitiesRead(recipientId: string, unreadIds: string[] = []): Promise<void> {
    const db = getFirestoreDb();
    const local = await loadLocalActivities(recipientId);
    const ids = new Set([
      ...unreadIds,
      ...local.filter((item) => !item.read).map((item) => item.id),
    ]);

    if (db) {
      try {
        // allSettled: local-only items have no server document and are expected to be rejected.
        await Promise.allSettled(
          [...ids].map((id) =>
            setDoc(doc(db, ACTIVITY_COLLECTION, id), { read: true }, { merge: true }),
          ),
        );
      } catch {
        await markAllLocalActivitiesRead(recipientId);
        return;
      }
    }

    await markAllLocalActivitiesRead(recipientId);
  }

  private async resolveActivities(
    recipientId: string,
    recipientRole: 'player' | 'scout',
  ): Promise<ActivityItem[]> {
    const local = await loadLocalActivities(recipientId);
    if (local.length > 0 || !useMockData()) {
      return local;
    }

    return getMockActivities(recipientId, recipientRole);
  }
}

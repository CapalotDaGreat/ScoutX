import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  where,
  orderBy,
} from 'firebase/firestore';
import { getFirestoreDb } from '@/config/firebase';
import { subscribeToQuery } from '@/firebase/firestoreSubscriptions';
import {
  createScoutingReportFromDraft,
  parseScoutingReport,
  serializeScoutingReport,
  sortScoutingReports,
} from '@/features/scouting-reports/models/ScoutingReportModel';
import {
  deleteLocalScoutingReport,
  loadLocalScoutingReports,
  saveLocalScoutingReport,
} from '@/features/scouting-reports/services/scoutingReportStorage';
import { SCOUTING_REPORT_COLLECTION } from '@/features/scouting-reports/constants';
import { type ScoutingReport, type ScoutingReportDraft } from '@/features/scouting-reports/types';
import { ActivityRecorder } from '@/features/activity-feed/services/activityRecorder';

export class ScoutingReportRepository {
  private static instance: ScoutingReportRepository | null = null;

  private constructor() {}

  public static getInstance(): ScoutingReportRepository {
    if (!this.instance) {
      this.instance = new ScoutingReportRepository();
    }
    return this.instance;
  }

  public subscribeToPlayerReports(
    scoutId: string,
    playerId: string,
    callback: (reports: ScoutingReport[]) => void,
    onError?: (error: Error) => void,
  ): () => void {
    const db = getFirestoreDb();

    if (!db) {
      void loadLocalScoutingReports(scoutId, playerId).then(callback);
      return () => undefined;
    }

    const reportsQuery = query(
      collection(db, SCOUTING_REPORT_COLLECTION),
      where('scoutId', '==', scoutId),
      where('playerId', '==', playerId),
      orderBy('updatedAt', 'desc'),
    );

    return subscribeToQuery({
      firestoreQuery: reportsQuery,
      parse: (data, id) => parseScoutingReport(data, id),
      onData: (reports) => callback(sortScoutingReports(reports)),
      onFallback: () => {
        void loadLocalScoutingReports(scoutId, playerId).then(callback);
      },
      onError,
    });
  }

  public async fetchPlayerReports(scoutId: string, playerId: string): Promise<ScoutingReport[]> {
    const db = getFirestoreDb();

    if (!db) {
      return loadLocalScoutingReports(scoutId, playerId);
    }

    try {
      const reportsQuery = query(
        collection(db, SCOUTING_REPORT_COLLECTION),
        where('scoutId', '==', scoutId),
        where('playerId', '==', playerId),
        orderBy('updatedAt', 'desc'),
      );
      const snapshot = await getDocs(reportsQuery);
      return sortScoutingReports(
        snapshot.docs
          .map((document) => parseScoutingReport(document.data(), document.id))
          .filter((report): report is ScoutingReport => report !== null),
      );
    } catch {
      return loadLocalScoutingReports(scoutId, playerId);
    }
  }

  public async saveReport(
    scoutId: string,
    playerId: string,
    playerName: string,
    draft: ScoutingReportDraft,
    existing?: ScoutingReport,
  ): Promise<ScoutingReport> {
    const report = createScoutingReportFromDraft(
      scoutId,
      playerId,
      playerName,
      draft,
      existing,
    );

    const db = getFirestoreDb();

    if (db) {
      try {
        await setDoc(doc(db, SCOUTING_REPORT_COLLECTION, report.id), serializeScoutingReport(report));
      } catch {
        await saveLocalScoutingReport(report);
      }
    } else {
      await saveLocalScoutingReport(report);
    }

    const scoutName = report.scoutName ?? 'Scout';
    const recorder = ActivityRecorder.getInstance();
    recorder.recordScoutingReport({
      recipientId: scoutId,
      recipientRole: 'scout',
      scoutId,
      scoutName,
      playerId,
      playerName,
      reportId: report.id,
    });
    recorder.recordScoutingReport({
      recipientId: playerId,
      recipientRole: 'player',
      scoutId,
      scoutName,
      playerId,
      playerName,
      reportId: report.id,
    });

    return report;
  }

  public async deleteReport(
    scoutId: string,
    playerId: string,
    reportId: string,
  ): Promise<void> {
    const db = getFirestoreDb();

    if (db) {
      try {
        await deleteDoc(doc(db, SCOUTING_REPORT_COLLECTION, reportId));
      } catch {
        await deleteLocalScoutingReport(scoutId, playerId, reportId);
      }
    } else {
      await deleteLocalScoutingReport(scoutId, playerId, reportId);
    }
  }
}

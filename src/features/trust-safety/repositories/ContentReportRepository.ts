import { doc, setDoc } from 'firebase/firestore';
import { getFirestoreDb } from '@/config/firebase';
import { CONTENT_REPORTS_COLLECTION } from '@/features/trust-safety/constants';
import { type ContentReport, type ContentReportDraft } from '@/features/trust-safety/types';
import { createSecureId } from '@/utils/secureId';

function createReportId(): string {
  return createSecureId('report', 9);
}

export class ContentReportRepository {
  private static instance: ContentReportRepository | null = null;

  private constructor() {}

  public static getInstance(): ContentReportRepository {
    if (!this.instance) {
      this.instance = new ContentReportRepository();
    }
    return this.instance;
  }

  public async submitReport(reporterId: string, draft: ContentReportDraft): Promise<ContentReport> {
    const report: ContentReport = {
      id: createReportId(),
      reporterId,
      targetType: draft.targetType,
      targetId: draft.targetId,
      targetOwnerId: draft.targetOwnerId,
      reason: draft.reason,
      details: draft.details,
      createdAt: new Date().toISOString(),
    };

    const db = getFirestoreDb();
    if (db) {
      await setDoc(doc(db, CONTENT_REPORTS_COLLECTION, report.id), {
        reporterId: report.reporterId,
        targetType: report.targetType,
        targetId: report.targetId,
        targetOwnerId: report.targetOwnerId,
        reason: report.reason,
        ...(report.details ? { details: report.details } : {}),
        createdAt: report.createdAt,
      });
    }

    return report;
  }
}

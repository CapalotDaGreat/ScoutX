import AsyncStorage from '@react-native-async-storage/async-storage';
import { SCOUTING_REPORTS_STORAGE_KEY } from '@/features/scouting-reports/constants';
import { sortScoutingReports } from '@/features/scouting-reports/models/ScoutingReportModel';
import { type ScoutingReport } from '@/features/scouting-reports/types';
import {
  readKeyedValue,
  removeKeyedListItem,
  upsertKeyedListItem,
} from '@/data/scopedAsyncStorage';

function storageKey(scoutId: string): string {
  return `${SCOUTING_REPORTS_STORAGE_KEY}/${scoutId}`;
}

export async function loadLocalScoutingReports(
  scoutId: string,
  playerId: string,
): Promise<ScoutingReport[]> {
  const reports = (await readKeyedValue<ScoutingReport[]>(storageKey(scoutId), playerId)) ?? [];
  return sortScoutingReports(
    reports.filter((report): report is ScoutingReport => typeof report?.id === 'string'),
  );
}

export async function saveLocalScoutingReport(report: ScoutingReport): Promise<void> {
  await upsertKeyedListItem(
    storageKey(report.scoutId),
    report.playerId,
    report,
    sortScoutingReports,
  );
}

export async function deleteLocalScoutingReport(
  scoutId: string,
  playerId: string,
  reportId: string,
): Promise<void> {
  await removeKeyedListItem<ScoutingReport>(storageKey(scoutId), playerId, reportId);
}

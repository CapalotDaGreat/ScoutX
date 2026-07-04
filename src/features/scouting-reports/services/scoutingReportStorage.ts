import AsyncStorage from '@react-native-async-storage/async-storage';
import { SCOUTING_REPORTS_STORAGE_KEY } from '@/features/scouting-reports/constants';
import { type ScoutingReport } from '@/features/scouting-reports/types';
import { sortScoutingReports } from '@/features/scouting-reports/models/ScoutingReportModel';

type StoredReports = Record<string, ScoutingReport[]>;

function storageKey(scoutId: string): string {
  return `${SCOUTING_REPORTS_STORAGE_KEY}/${scoutId}`;
}

export async function loadLocalScoutingReports(
  scoutId: string,
  playerId: string,
): Promise<ScoutingReport[]> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(scoutId));
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as StoredReports;
    const reports = parsed[playerId] ?? [];
    return sortScoutingReports(
      reports.filter((report): report is ScoutingReport => typeof report?.id === 'string'),
    );
  } catch {
    return [];
  }
}

export async function saveLocalScoutingReport(report: ScoutingReport): Promise<void> {
  const raw = await AsyncStorage.getItem(storageKey(report.scoutId));
  const parsed: StoredReports = raw ? (JSON.parse(raw) as StoredReports) : {};
  const current = parsed[report.playerId] ?? [];
  const next = sortScoutingReports([
    report,
    ...current.filter((item) => item.id !== report.id),
  ]);
  parsed[report.playerId] = next;
  await AsyncStorage.setItem(storageKey(report.scoutId), JSON.stringify(parsed));
}

export async function deleteLocalScoutingReport(
  scoutId: string,
  playerId: string,
  reportId: string,
): Promise<void> {
  const raw = await AsyncStorage.getItem(storageKey(scoutId));
  if (!raw) {
    return;
  }
  const parsed = JSON.parse(raw) as StoredReports;
  parsed[playerId] = (parsed[playerId] ?? []).filter((report) => report.id !== reportId);
  await AsyncStorage.setItem(storageKey(scoutId), JSON.stringify(parsed));
}

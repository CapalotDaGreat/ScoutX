import { useCallback, useEffect, useState } from 'react';
import { useMockData } from '@/config/appMode';
import { ScoutingReportRepository } from '@/features/scouting-reports/repositories/ScoutingReportRepository';
import { getMockReportsForPlayer } from '@/features/scouting-reports/services/mockScoutingReports';
import { type ScoutingReport, type ScoutingReportDraft } from '@/features/scouting-reports/types';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { toUserMessage } from '@/utils/userFacingError';

/** Cross-player reports inbox for the scout Trials tab. */
export function useScoutAllReports() {
  const { user } = useAuth();
  const scoutId = user?.id ?? '';
  const [reports, setReports] = useState<ScoutingReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const repository = ScoutingReportRepository.getInstance();

  useEffect(() => {
    if (!scoutId) {
      setReports([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const unsubscribe = repository.subscribeToScoutReports(
      scoutId,
      (nextReports) => {
        setReports(nextReports);
        setIsLoading(false);
      },
      (err) => {
        setError(toUserMessage(err, 'Unable to sync right now.'));
        setReports([]);
        setIsLoading(false);
      },
    );
    return unsubscribe;
  }, [repository, scoutId]);

  return { reports, isLoading, error };
}

export function useScoutingReports(playerId: string, playerName: string) {
  const { user } = useAuth();
  const scoutId = user?.id ?? '';
  const [reports, setReports] = useState<ScoutingReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const repository = ScoutingReportRepository.getInstance();

  useEffect(() => {
    if (!scoutId || !playerId) {
      setReports([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const unsubscribe = repository.subscribeToPlayerReports(
      scoutId,
      playerId,
      (nextReports) => {
        if (nextReports.length === 0) {
          setReports(useMockData() ? getMockReportsForPlayer(playerId, scoutId) : []);
        } else {
          setReports(nextReports);
        }
        setIsLoading(false);
      },
      (err) => {
        setError(toUserMessage(err, 'Unable to sync right now.'));
        setReports(useMockData() ? getMockReportsForPlayer(playerId, scoutId) : []);
        setIsLoading(false);
      },
    );

    return unsubscribe;
  }, [playerId, repository, scoutId]);

  const saveReport = useCallback(
    async (draft: ScoutingReportDraft, existing?: ScoutingReport) => {
      if (!scoutId) {
        throw new Error('Scout is not authenticated.');
      }

      setIsSaving(true);
      setError(null);
      try {
        const nextDraft: ScoutingReportDraft = {
          ...draft,
          scoutName: draft.scoutName ?? user?.name,
        };
        return await repository.saveReport(
          scoutId,
          playerId,
          playerName,
          nextDraft,
          existing,
        );
      } catch (err) {
        const message = toUserMessage(err, 'Failed to save report.');
        setError(message);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [playerId, playerName, repository, scoutId, user?.name],
  );

  const deleteReport = useCallback(
    async (reportId: string) => {
      if (!scoutId) {
        throw new Error('Scout is not authenticated.');
      }

      setIsSaving(true);
      setError(null);
      try {
        await repository.deleteReport(scoutId, playerId, reportId);
      } catch (err) {
        const message = toUserMessage(err, 'Failed to delete report.');
        setError(message);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [playerId, repository, scoutId],
  );

  return {
    reports,
    isLoading,
    isSaving,
    error,
    saveReport,
    deleteReport,
  };
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GPS_TRACKING_CONFIG } from '@/features/gps/constants';
import { createGpsSession, createGpsSessionId } from '@/features/gps/models/GpsSessionModel';
import { GpsSessionRepository } from '@/features/gps/repositories/GpsSessionRepository';
import {
  calculateSessionMetrics,
  createEmptyMetrics,
  shouldAcceptPoint,
} from '@/features/gps/services/gpsSessionCalculator';
import {
  clearActiveSession,
  loadActiveSession,
  saveActiveSession,
} from '@/features/gps/services/gpsSessionStorage';
import {
  getGpsPermissionStatus,
  requestGpsPermissions,
  startGpsTracking,
  stopGpsTracking,
  type GpsPermissionStatus,
} from '@/features/gps/services/gpsTrackingService';
import {
  type GpsPoint,
  type GpsSession,
  type GpsSessionMetrics,
  type GpsSessionStatus,
} from '@/features/gps/types';
import { toUserMessage } from '@/utils/userFacingError';

export type UseGpsTrackingOptions = {
  playerId: string | null;
};

export function useGpsTracking({ playerId }: UseGpsTrackingOptions) {
  const [status, setStatus] = useState<GpsSessionStatus>('idle');
  const [matchLabel, setMatchLabel] = useState('Training Session');
  const [permissionStatus, setPermissionStatus] = useState<GpsPermissionStatus>('undetermined');
  const [points, setPoints] = useState<GpsPoint[]>([]);
  const [session, setSession] = useState<GpsSession | null>(null);
  const [pausedDurationMs, setPausedDurationMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const pausedAtRef = useRef<number | null>(null);
  const pausedDurationMsRef = useRef(0);
  const pointsRef = useRef<GpsPoint[]>([]);
  const sessionRef = useRef<GpsSession | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const liveMetrics = useMemo<GpsSessionMetrics>(() => {
    if (points.length === 0) {
      return createEmptyMetrics();
    }

    return calculateSessionMetrics(points, pausedDurationMs);
  }, [pausedDurationMs, points]);

  const syncAutosave = useCallback(async () => {
    if (!sessionRef.current || pointsRef.current.length === 0) {
      return;
    }

    await saveActiveSession(sessionRef.current, pointsRef.current);
  }, []);

  const handleLocationUpdate = useCallback((point: GpsPoint) => {
    const lastPoint = pointsRef.current[pointsRef.current.length - 1] ?? null;

    if (!shouldAcceptPoint(lastPoint, point)) {
      return;
    }

    const nextPoints = [...pointsRef.current, point].slice(-GPS_TRACKING_CONFIG.maxStoredPoints);
    pointsRef.current = nextPoints;
    setPoints(nextPoints);
  }, []);

  const clearAutosaveTimer = useCallback(() => {
    if (autosaveTimerRef.current) {
      clearInterval(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
  }, []);

  const startAutosaveTimer = useCallback(() => {
    clearAutosaveTimer();
    autosaveTimerRef.current = setInterval(() => {
      void syncAutosave();
    }, GPS_TRACKING_CONFIG.autosaveIntervalMs);
  }, [clearAutosaveTimer, syncAutosave]);

  useEffect(() => {
    void getGpsPermissionStatus().then(setPermissionStatus);
  }, []);

  useEffect(() => {
    let isActive = true;

    void loadActiveSession().then((active) => {
      if (!isActive || !active) {
        return;
      }

      if (active.session.status === 'recording' || active.session.status === 'paused') {
        setSession(active.session);
        sessionRef.current = active.session;
        setPoints(active.points);
        pointsRef.current = active.points;
        setMatchLabel(active.session.matchLabel);
        setPausedDurationMs(active.session.pausedDurationMs);
        pausedDurationMsRef.current = active.session.pausedDurationMs;
        setStatus(active.session.status);
      }
    });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      clearAutosaveTimer();
      void stopGpsTracking();
    };
  }, [clearAutosaveTimer]);

  const startRecording = useCallback(async () => {
    if (!playerId) {
      setError('You must be signed in to record a GPS session.');
      return;
    }

    setError(null);
    const permission = await requestGpsPermissions();
    setPermissionStatus(permission);

    if (permission !== 'granted') {
      setError('Location permission is required to record match movement.');
      return;
    }

    const nextSession = createGpsSession({
      id: createGpsSessionId(),
      playerId,
      matchLabel: matchLabel.trim() || 'Match Session',
      status: 'recording',
    });

    pointsRef.current = [];
    sessionRef.current = nextSession;
    pausedAtRef.current = null;
    pausedDurationMsRef.current = 0;
    setPoints([]);
    setSession(nextSession);
    setPausedDurationMs(0);
    setStatus('recording');

    await startGpsTracking(handleLocationUpdate);
    startAutosaveTimer();
    await saveActiveSession(nextSession, []);
  }, [handleLocationUpdate, matchLabel, playerId, startAutosaveTimer]);

  const pauseRecording = useCallback(async () => {
    if (status !== 'recording') {
      return;
    }

    await stopGpsTracking();
    clearAutosaveTimer();
    pausedAtRef.current = Date.now();
    setStatus('paused');

    if (sessionRef.current) {
      const pausedSession = { ...sessionRef.current, status: 'paused' as const };
      sessionRef.current = pausedSession;
      setSession(pausedSession);
      await saveActiveSession(pausedSession, pointsRef.current);
    }
  }, [clearAutosaveTimer, status]);

  const resumeRecording = useCallback(async () => {
    if (status !== 'paused') {
      return;
    }

    if (pausedAtRef.current) {
      const pauseDelta = Date.now() - pausedAtRef.current;
      setPausedDurationMs((current) => {
        const next = current + pauseDelta;
        pausedDurationMsRef.current = next;
        return next;
      });
      pausedAtRef.current = null;
    }

    setStatus('recording');

    if (sessionRef.current) {
      const resumedSession = {
        ...sessionRef.current,
        status: 'recording' as const,
        pausedDurationMs: pausedDurationMsRef.current,
      };
      sessionRef.current = resumedSession;
      setSession(resumedSession);
    }

    await startGpsTracking(handleLocationUpdate);
    startAutosaveTimer();
  }, [handleLocationUpdate, startAutosaveTimer, status]);

  const stopRecording = useCallback(async (): Promise<GpsSession | null> => {
    if (!sessionRef.current || status === 'idle') {
      return null;
    }

    if (status === 'paused' && pausedAtRef.current) {
      const pauseDelta = Date.now() - pausedAtRef.current;
      pausedDurationMsRef.current += pauseDelta;
      pausedAtRef.current = null;
    }

    await stopGpsTracking();
    clearAutosaveTimer();
    setIsSaving(true);
    setError(null);

    try {
      const repository = GpsSessionRepository.getInstance();
      const completedSession = await repository.completeSession(
        {
          ...sessionRef.current,
          pausedDurationMs: pausedDurationMsRef.current,
          matchLabel: matchLabel.trim() || sessionRef.current.matchLabel,
        },
        pointsRef.current,
      );

      sessionRef.current = null;
      pointsRef.current = [];
      setSession(null);
      setPoints([]);
      setStatus('idle');
      await clearActiveSession();

      return completedSession;
    } catch (err) {
      const message = toUserMessage(err, 'Failed to save GPS session.');
      setError(message);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [clearAutosaveTimer, matchLabel, status]);

  const discardRecording = useCallback(async () => {
    await stopGpsTracking();
    clearAutosaveTimer();
    sessionRef.current = null;
    pointsRef.current = [];
    pausedAtRef.current = null;
    setSession(null);
    setPoints([]);
    setPausedDurationMs(0);
    setStatus('idle');
    await clearActiveSession();
  }, [clearAutosaveTimer]);

  return {
    status,
    matchLabel,
    setMatchLabel,
    permissionStatus,
    points,
    session,
    liveMetrics,
    pausedDurationMs,
    error,
    isSaving,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    discardRecording,
  };
}

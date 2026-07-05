import { useState } from 'react';
import { Screen } from '@/components/layout/Screen';
import { Section } from '@/components/layout/Section';
import { SkeletonLoader } from '@/components/feedback/SkeletonLoader';
import { Text } from '@/components/primitives/Text';
import { GpsHeatmap } from '@/features/gps/components/GpsHeatmap';
import { GpsLiveMetrics } from '@/features/gps/components/GpsLiveMetrics';
import { GpsMovementZones } from '@/features/gps/components/GpsMovementZones';
import { GpsRecordingControls } from '@/features/gps/components/GpsRecordingControls';
import { GpsSessionHistory } from '@/features/gps/components/GpsSessionHistory';
import { useGpsSessions } from '@/features/gps/hooks/useGpsSessions';
import { useGpsTracking } from '@/features/gps/hooks/useGpsTracking';
import { type GpsSession } from '@/features/gps/types';

export type GpsTrackingScreenProps = {
  playerId: string | null;
  embeddedInTabShell?: boolean;
};

export function GpsTrackingScreen({
  playerId,
  embeddedInTabShell = false,
}: GpsTrackingScreenProps) {
  const {
    status,
    matchLabel,
    setMatchLabel,
    liveMetrics,
    points,
    error,
    isSaving,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    discardRecording,
  } = useGpsTracking({ playerId });

  const {
    sessions,
    isLoading,
    error: sessionsError,
    refreshSessions,
  } = useGpsSessions({ playerId });

  const [completedSession, setCompletedSession] = useState<GpsSession | null>(null);

  const handleStop = async () => {
    const session = await stopRecording();
    if (session) {
      setCompletedSession(session);
      await refreshSessions();
    }
  };

  const previewHeatmap = completedSession?.heatmap ?? sessions[0]?.heatmap;
  const previewZones = completedSession?.zones ?? sessions[0]?.zones ?? [];

  return (
    <Screen
      title="GPS Tracking"
      subtitle="Record match movement with battery-optimized sampling"
      onRefresh={refreshSessions}
      refreshing={isLoading}
      error={error ?? sessionsError ?? null}
      onRetry={refreshSessions}
      safeArea
      contentClassName="gap-8"
      embeddedInTabShell={embeddedInTabShell}
    >
      <Section title="Live Session" gap="md">
        <GpsRecordingControls
          status={status}
          matchLabel={matchLabel}
          pointCount={points.length}
          isSaving={isSaving}
          onMatchLabelChange={setMatchLabel}
          onStart={() => void startRecording()}
          onPause={() => void pauseRecording()}
          onResume={() => void resumeRecording()}
          onStop={() => void handleStop()}
          onDiscard={() => void discardRecording()}
        />

        {status !== 'idle' ? <GpsLiveMetrics metrics={liveMetrics} /> : null}
      </Section>

      {completedSession ? (
        <Section title="Session Summary" gap="md">
          <Text variant="body-sm" color="secondary">
            {completedSession.matchLabel} saved with {completedSession.metrics.pointCount} points.
          </Text>
          <GpsLiveMetrics metrics={completedSession.metrics} />
          <GpsMovementZones zones={completedSession.zones} />
          <GpsHeatmap heatmap={completedSession.heatmap} />
        </Section>
      ) : null}

      {!completedSession && previewZones.length > 0 ? (
        <Section title="Latest Analysis" gap="md">
          <GpsMovementZones zones={previewZones} />
          {previewHeatmap ? <GpsHeatmap heatmap={previewHeatmap} /> : null}
        </Section>
      ) : null}

      <Section title="History" gap="md">
        {isLoading ? <SkeletonLoader variant="card" count={2} /> : <GpsSessionHistory sessions={sessions} />}
      </Section>
    </Screen>
  );
}

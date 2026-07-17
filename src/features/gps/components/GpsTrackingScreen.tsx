import { useState } from 'react';
import { CollapsibleSection } from '@/components/layout/CollapsibleSection';
import { Screen } from '@/components/layout/Screen';
import { Section } from '@/components/layout/Section';
import { SkeletonLoader } from '@/components/feedback/SkeletonLoader';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { GpsHeatmap } from '@/features/gps/components/GpsHeatmap';
import { GpsLiveMetrics } from '@/features/gps/components/GpsLiveMetrics';
import { GpsMovementZones } from '@/features/gps/components/GpsMovementZones';
import { GpsRecordingControls } from '@/features/gps/components/GpsRecordingControls';
import { GpsSessionHistory } from '@/features/gps/components/GpsSessionHistory';
import { useGpsSessions } from '@/features/gps/hooks/useGpsSessions';
import { useGpsTracking } from '@/features/gps/hooks/useGpsTracking';
import { type GpsSession } from '@/features/gps/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type GpsTrackingScreenProps = {
  playerId: string | null;
  embeddedInTabShell?: boolean;
  nestedUnderSegment?: boolean;
};

export function GpsTrackingScreen({
  playerId,
  embeddedInTabShell = false,
  nestedUnderSegment = false,
}: GpsTrackingScreenProps) {
  const { t } = useAppTranslation(['gps', 'common', 'errors']);
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
  const [showFullHistory, setShowFullHistory] = useState(false);

  const handleStop = async () => {
    const session = await stopRecording();
    if (session) {
      setCompletedSession(session);
      await refreshSessions();
    }
  };

  const previewHeatmap = completedSession?.heatmap ?? sessions[0]?.heatmap;
  const previewZones = completedSession?.zones ?? sessions[0]?.zones ?? [];
  const historySessions = showFullHistory ? sessions : sessions.slice(0, 3);

  return (
    <Screen
      title={t('gps:title')}
      subtitle={t('gps:recordingSubtitle')}
      onRefresh={refreshSessions}
      refreshing={isLoading}
      error={error ?? sessionsError ?? null}
      onRetry={refreshSessions}
      safeArea
      contentClassName="gap-8"
      embeddedInTabShell={embeddedInTabShell}
      safeAreaEdges={nestedUnderSegment ? (['left', 'right'] as Array<'left' | 'right'>) : undefined}
    >
      <Section title={t('gps:liveSession')} gap="md">
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
        <Section title={t('gps:sessionSummary')} gap="md">
          <Text variant="body-sm" color="secondary">
            {t('gps:sessionSavedSummary', {
              label: completedSession.matchLabel,
              count: completedSession.metrics.pointCount,
            })}
          </Text>
          <GpsLiveMetrics metrics={completedSession.metrics} />
          <CollapsibleSection
            title="Movement detail"
            subtitle="Zones and heatmap for this session"
            defaultOpen
            persistKey="gps-completed-detail"
          >
            <GpsMovementZones zones={completedSession.zones} />
            <GpsHeatmap heatmap={completedSession.heatmap} />
          </CollapsibleSection>
        </Section>
      ) : null}

      {!completedSession && previewZones.length > 0 ? (
        <CollapsibleSection
          title={t('gps:latestAnalysis')}
          subtitle="Zones and heatmap from your latest session"
          persistKey="gps-latest-analysis"
        >
          <GpsMovementZones zones={previewZones} />
          {previewHeatmap ? <GpsHeatmap heatmap={previewHeatmap} /> : null}
        </CollapsibleSection>
      ) : null}

      <Section title={t('gps:history')} gap="md">
        {isLoading ? (
          <SkeletonLoader variant="card" count={2} />
        ) : (
          <>
            <GpsSessionHistory sessions={historySessions} />
            {sessions.length > 3 ? (
              <Button
                variant="ghost"
                size="sm"
                onPress={() => setShowFullHistory((current) => !current)}
                className="self-start"
              >
                {showFullHistory
                  ? 'Show less'
                  : `${t('common:seeMore')} · ${sessions.length - 3}`}
              </Button>
            ) : null}
          </>
        )}
      </Section>
    </Screen>
  );
}

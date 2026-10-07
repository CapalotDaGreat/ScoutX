import { useState } from 'react';
import { View } from 'react-native';
import { CollapsibleSection } from '@/components/layout/CollapsibleSection';
import { Screen } from '@/components/layout/Screen';
import { Section } from '@/components/layout/Section';
import { SkeletonLoader } from '@/components/feedback/SkeletonLoader';
import { Button } from '@/components/primitives/Button';
import { ChoiceChip } from '@/components/primitives/ChoiceChip';
import { Text } from '@/components/primitives/Text';
import { GpsHeatmap } from '@/features/gps/components/GpsHeatmap';
import { GpsLiveMetrics } from '@/features/gps/components/GpsLiveMetrics';
import { GpsIntelligenceCard } from '@/features/gps/components/GpsIntelligenceCard';
import { GpsRecordingControls } from '@/features/gps/components/GpsRecordingControls';
import { GpsSessionHistory } from '@/features/gps/components/GpsSessionHistory';
import { setDistanceUnit, useDistanceUnit } from '@/features/gps/hooks/useDistanceUnit';
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

  const latestSession = sessions[0] ?? null;
  const unit = useDistanceUnit();
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
        <View className="flex-row items-center gap-2">
          <Text variant="caption" color="secondary">{t('gps:units.label')}</Text>
          <ChoiceChip label={t('gps:units.km')} selected={unit === 'km'} onPress={() => void setDistanceUnit('km')} />
          <ChoiceChip label={t('gps:units.mi')} selected={unit === 'mi'} onPress={() => void setDistanceUnit('mi')} />
        </View>
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
            title={t('gps:movementDetail')}
            subtitle={t('gps:movementDetailSubtitle')}
            defaultOpen
            persistKey="gps-completed-detail"
          >
            <GpsIntelligenceCard session={completedSession} />
            <GpsHeatmap heatmap={completedSession.heatmap} />
          </CollapsibleSection>
        </Section>
      ) : null}

      {!completedSession && latestSession ? (
        <CollapsibleSection
          title={t('gps:latestAnalysis')}
          subtitle={t('gps:latestAnalysisSubtitle')}
          persistKey="gps-latest-analysis"
        >
          <GpsIntelligenceCard session={latestSession} />
          <GpsHeatmap heatmap={latestSession.heatmap} />
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
                  ? t('common:seeLess')
                  : `${t('common:seeMore')} · ${sessions.length - 3}`}
              </Button>
            ) : null}
          </>
        )}
      </Section>
    </Screen>
  );
}

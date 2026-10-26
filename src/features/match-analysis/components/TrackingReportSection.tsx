import { View } from 'react-native';
import { Badge } from '@/components/primitives/Badge';
import { Card } from '@/components/primitives/Card';
import { Heading } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';
import { TrackingReviewDeck } from '@/features/match-analysis/components/TrackingReviewDeck';
import {
  STATE_COLORS,
  coverageSegments,
  formatClock,
  minutes,
  physicalPresentation,
  shareOfAnalysed,
  type TrackingDoc,
  type TrackingIdentityState,
} from '@/features/match-analysis/services/trackingV3Service';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

const LEGEND: TrackingIdentityState[] = ['CONFIRMED_VISIBLE', 'LIKELY_VISIBLE', 'AMBIGUOUS', 'UNKNOWN', 'NON_MATCH_PERIOD'];
const PHYSICAL_KEYS = ['distanceObserved', 'workRate', 'peakSpeed', 'sprintCount', 'highSpeedRunCount'] as const;

/** Player-tracking report: identity coverage, timeline, review, on-ball and movement - every value with provenance. */
export function TrackingReportSection({ jobId, tracking }: { jobId: string; tracking: TrackingDoc }) {
  const { t } = useAppTranslation('matchAnalysis');
  const report = tracking.report;
  if (!report) {
    return (
      <Card>
        <Text>{t('tracking.processing')}</Text>
      </Card>
    );
  }
  const c = report.coverage;
  const total = Math.max(c.recordingSec, 1);
  const phys = physicalPresentation(report);
  const unavailable: Array<[string, string]> = [
    [t('tracking.unavailable.heatmap'), report.heatmap.reason ?? t('tracking.unavailable.calibration')],
    [t('tracking.unavailable.passAccuracy'), t('tracking.unavailable.passAccuracyWhy', { count: report.ball.unknownOutcomePasses })],
    [t('tracking.unavailable.defensive'), t('tracking.unavailable.notValidated')],
  ];

  return (
    <View className="gap-3">
      {tracking.stale ? (
        <Card variant="default">
          <Text color="warning">{tracking.pendingReason === 'worker_unavailable' ? t('tracking.stalePending') : t('tracking.stale')}</Text>
        </Card>
      ) : null}

      <Card className="gap-2">
        <Heading level={3}>{t('tracking.coverageTitle')}</Heading>
        <View className="flex-row flex-wrap gap-2">
          <Stat label={t('tracking.confirmed')} value={`${minutes(c.confirmedVisibleSec)} min`}
            sub={t('tracking.ofAnalysed', { pct: shareOfAnalysed(c.confirmedVisibleSec, c) })} badge={t('tracking.prov.verified')} />
          <Stat label={t('tracking.likely')} value={`${minutes(c.likelyVisibleSec)} min`} sub={t('tracking.likelySub')} badge={t('tracking.prov.likely')} />
          <Stat label={t('tracking.ambiguous')} value={`${minutes(c.ambiguousSec)} min`} sub={t('tracking.ambiguousSub')} />
          <Stat label={t('tracking.analysed')} value={`${minutes(c.analysedSec)} min`}
            sub={t('tracking.analysedSub', { recording: minutes(c.recordingSec), unobserved: minutes(c.unobservedSec) })} />
        </View>
        <View className="mt-1 h-3 flex-row overflow-hidden rounded-full" accessibilityLabel={t('tracking.coverageA11y')}>
          {coverageSegments(c).map((s) => <View key={s.key} style={{ flex: s.fraction, backgroundColor: s.color }} />)}
        </View>
        <Text variant="caption" color="secondary">{t('tracking.denominatorNote')}</Text>
      </Card>

      <Card className="gap-2">
        <Heading level={3}>{t('tracking.timelineTitle')}</Heading>
        <View className="h-6 flex-row overflow-hidden rounded-md">
          {report.stateStrip.map(([a, b, s]) => (
            <View key={`${a}-${s}`} style={{ flex: (b - a) / total, backgroundColor: STATE_COLORS[s] }} />
          ))}
        </View>
        <View className="flex-row flex-wrap gap-x-3 gap-y-1">
          {LEGEND.map((s) => (
            <View key={s} className="flex-row items-center gap-1">
              <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: STATE_COLORS[s] }} />
              <Text variant="caption">{t(`tracking.state.${s}`)}</Text>
            </View>
          ))}
        </View>
        {report.periods.map((p) => (
          <Text key={`${p.start}`} variant="caption" color="secondary">
            {formatClock(p.start)}-{formatClock(p.end)} · {t(`tracking.period.${p.kind}`)}{p.source === 'user' ? ` · ${t('tracking.period.byYou')}` : ''}
          </Text>
        ))}
      </Card>

      <TrackingReviewDeck jobId={jobId} report={report} updating={tracking.stale} />

      <Card className="gap-2">
        <View className="flex-row items-center gap-2">
          <Heading level={3}>{t('tracking.ballTitle')}</Heading>
          <Badge label={t('tracking.prov.unvalidated')} variant="warning" size="sm" />
        </View>
        <Text>{t('tracking.ballSummary', { contacts: report.ball.contacts, attempts: report.ball.passAttempts,
          completed: report.ball.completedPasses, incomplete: report.ball.incompletePasses, unknown: report.ball.unknownOutcomePasses })}</Text>
        {report.events.slice(0, 20).map((e) => (
          <Text key={`${e.type}-${e.start}`} variant="caption" color="secondary">
            {formatClock(e.start)} · {t(`tracking.event.${e.type}`)}{e.outcome ? ` · ${t(`tracking.outcome.${e.outcome}`)}` : ''}
          </Text>
        ))}
      </Card>

      <Card className="gap-2">
        <View className="flex-row items-center gap-2">
          <Heading level={3}>{t('tracking.movementTitle')}</Heading>
          <Badge label={t(`tracking.prov.${phys}`)} variant={phys === 'verified' ? 'success' : 'warning'} size="sm" />
        </View>
        {phys === 'unavailable' ? (
          <Text color="secondary">{report.physical.reason ?? t('tracking.unavailable.calibration')}</Text>
        ) : (
          <>
            {phys === 'experimental' ? <Text color="warning" variant="caption">{t('tracking.experimentalNote')}</Text> : null}
            {PHYSICAL_KEYS.map((k) => {
              const v = report.physical.values[k];
              if (!v) return null;
              return (
                <View key={k} className="flex-row justify-between">
                  <Text>{t(`tracking.metric.${k}`)}</Text>
                  <Text weight="semibold">{v.value ?? '—'} {v.unit === 'count' ? '' : v.unit}</Text>
                </View>
              );
            })}
          </>
        )}
      </Card>

      <Card className="gap-1">
        <Heading level={3}>{t('tracking.unavailableTitle')}</Heading>
        {unavailable.map(([k, why]) => (
          <Text key={k} variant="caption"><Text weight="semibold" variant="caption">{k}</Text> - {why}</Text>
        ))}
        <Text variant="caption" color="tertiary">
          {t('tracking.identityFootnote', { numbers: report.identity.numberSightings, answers: report.identity.confirmedByUser })}
        </Text>
      </Card>
    </View>
  );
}

function Stat({ label, value, sub, badge }: { label: string; value: string; sub: string; badge?: string }) {
  return (
    <View className="min-w-[140px] flex-1 border-b border-border py-2">
      <Text variant="caption" color="secondary">{label}</Text>
      <Text weight="bold" variant="body">{value}</Text>
      <Text variant="caption" color="tertiary">{sub}</Text>
      {badge ? <Badge label={badge} size="sm" className="mt-1 self-start" /> : null}
    </View>
  );
}

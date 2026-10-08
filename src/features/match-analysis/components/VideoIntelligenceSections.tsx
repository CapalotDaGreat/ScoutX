import { View } from 'react-native';
import { Card } from '@/components/primitives/Card';
import { Heading } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';
import {
  SECTION_REASONS,
  type ClipClaim,
  type MatchAnalysisJob,
  type ReportSection,
} from '@/features/match-analysis/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { CorrectionControls, CorrectionFootnote } from '@/features/match-analysis/components/CorrectionControls';
import { useAnalysisCorrections, type AnalysisCorrectionsApi } from '@/features/match-analysis/hooks/useAnalysisCorrections';

function clock(totalSec: number): string {
  const whole = Math.max(0, Math.round(totalSec));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function availabilityColor(availability: ReportSection['availability']): 'success' | 'secondary' | 'warning' {
  if (availability === 'AVAILABLE') return 'success';
  if (availability === 'LIMITED') return 'warning';
  return 'secondary';
}

function ClaimList({ title, claims }: { title: string; claims: ClipClaim[] }) {
  if (claims.length === 0) return null;
  return (
    <View className="gap-1">
      <Text weight="semibold">{title}</Text>
      {claims.map((claim) => (
        <Text key={`${claim.timestampSec}-${claim.text}`} variant="body-sm">
          • {claim.text} <Text variant="caption" color="secondary">({clock(claim.timestampSec)})</Text>
        </Text>
      ))}
    </View>
  );
}

export function ReportSectionsCard({ sections }: { sections: ReportSection[] }) {
  const { t } = useAppTranslation('matchAnalysis');
  if (sections.length === 0) return null;
  return (
    <Card variant="default" padding="lg" className="gap-2" testID="report-sections">
      <Heading level={3}>{t('video.sectionsTitle')}</Heading>
      {sections.map((section) => (
        <View key={section.id} className="flex-row items-start justify-between gap-3 border-b border-border pb-2 last:border-0">
          <View className="flex-1">
            <Text weight="semibold">{t(`video.section.${section.id}`)}</Text>
            {(SECTION_REASONS as readonly string[]).includes(section.reason) ? (
              <Text variant="caption" color="secondary">
                {t(`video.reason.${section.reason}`)}
              </Text>
            ) : null}
          </View>
          <Text variant="caption" weight="semibold" color={availabilityColor(section.availability)}>
            {t(`video.availability.${section.availability}`)}
          </Text>
        </View>
      ))}
    </Card>
  );
}

export function ClipReviewCard({ job }: { job: MatchAnalysisJob }) {
  const { t } = useAppTranslation('matchAnalysis');
  const clip = job.report?.clip;
  if (!clip) return null;
  const visible = clip.targetVisible === 'yes';
  return (
    <Card variant="default" padding="lg" className="gap-3" testID="clip-review">
      <Heading level={3}>{t('video.clip.title')}</Heading>
      <Text variant="caption" color="secondary">
        {t('video.clip.confidence', { level: t(`video.clip.${clip.confidence}`) })} · {t('video.clip.frames', { count: clip.frameCount })}
      </Text>
      {clip.whatHappened ? <ClaimList title={t('video.clip.whatHappened')} claims={[clip.whatHappened]} /> : null}
      <ClaimList title={t('video.clip.observable')} claims={clip.observable} />
      {clip.notObservable.length > 0 ? (
        <View className="gap-1">
          <Text weight="semibold">{t('video.clip.notObservable')}</Text>
          {clip.notObservable.map((item) => (
            <Text key={item} variant="body-sm" color="secondary">
              • {item}
            </Text>
          ))}
        </View>
      ) : null}
      {!visible ? (
        <Text variant="body-sm" color="secondary">
          {t('video.clip.notVisible')}
        </Text>
      ) : null}
      <ClaimList title={t('video.clip.technique')} claims={clip.technicalExecution} />
      {clip.decision ? (
        <View className="gap-1">
          <Text weight="semibold">{t('video.clip.decision')}</Text>
          <Text variant="body-sm">{clip.decision.situation}</Text>
          <Text variant="body-sm">{t('video.decisionChosen', { chosen: clip.decision.chosen })}</Text>
          <Text variant="body-sm" color="secondary">
            {t('video.decisionAlternative', { alternative: clip.decision.alternative })}
          </Text>
          {clip.decision.learningPoint ? <Text variant="body-sm">{clip.decision.learningPoint}</Text> : null}
        </View>
      ) : null}
      <ClaimList title={t('video.clip.worked')} claims={clip.whatWorked} />
      <ClaimList title={t('video.clip.improve')} claims={clip.improve} />
      {clip.drill ? (
        <View className="gap-1">
          <Text weight="semibold">{t('video.clip.drill')}</Text>
          <Text variant="body-sm">{clip.drill.objective}</Text>
          <Text variant="body-sm">{clip.drill.drill}</Text>
          <Text variant="caption" color="secondary">
            {clip.drill.repetitions} · {clip.drill.successCriteria}
          </Text>
        </View>
      ) : null}
      {clip.goalkeeper ? (
        <View className="gap-1">
          <Text weight="semibold">{t('video.clip.goalkeeper')}</Text>
          {[clip.goalkeeper.positioning, clip.goalkeeper.setPosition, clip.goalkeeper.handling, clip.goalkeeper.distribution]
            .filter((line) => line.trim().length > 0)
            .map((line) => (
              <Text key={line} variant="body-sm">
                • {line}
              </Text>
            ))}
        </View>
      ) : null}
    </Card>
  );
}

export function OpportunitiesCard({ job }: { job: MatchAnalysisJob }) {
  const { t } = useAppTranslation('matchAnalysis');
  const opportunities = job.report?.opportunities ?? [];
  const decisions = job.report?.decisionMoments ?? [];
  if (opportunities.length === 0 && decisions.length === 0) return null;
  return (
    <Card variant="default" padding="lg" className="gap-3">
      {opportunities.length > 0 ? (
        <View className="gap-2">
          <Heading level={3}>{t('video.opportunitiesTitle')}</Heading>
          {opportunities.slice(0, 3).map((item) => (
            <View key={item.title} className="gap-1">
              <Text weight="semibold">{item.title}</Text>
              <Text variant="body-sm" color="secondary">
                {item.why}
              </Text>
              <Text variant="body-sm">{t('video.drill', { drill: item.drill })}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {decisions.length > 0 ? (
        <View className="gap-2">
          <Heading level={3}>{t('video.decisionsTitle')}</Heading>
          {decisions.map((item) => (
            <View key={`${item.timestampSec}-${item.situation}`} className="gap-1">
              <Text weight="semibold">
                {clock(item.timestampSec)} · {item.situation}
              </Text>
              <Text variant="body-sm">{t('video.decisionChosen', { chosen: item.chosen })}</Text>
              <Text variant="body-sm" color="secondary">
                {t('video.decisionAlternative', { alternative: item.alternative })}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

export function PossibleEventsCard({ job, corrections }: { job: MatchAnalysisJob; corrections?: AnalysisCorrectionsApi }) {
  const { t } = useAppTranslation('matchAnalysis');
  const events = job.report?.possibleEvents ?? [];
  if (events.length === 0) return null;
  return (
    <Card variant="default" padding="lg" className="gap-2" testID="possible-events">
      <Heading level={3}>{t('video.possibleEventsTitle')}</Heading>
      <Text variant="caption" color="secondary">
        {t('video.possibleEventsHint')}
      </Text>
      {events.slice(0, 20).map((event) => (
        <View key={event.id} className="gap-1 border-b border-border pb-2 last:border-0">
          <Text weight="semibold">
            {clock(event.timestampSec)} · {t(`eventType.${event.type}`)} ·{' '}
            {event.status === 'validated' ? t('video.validated') : t('video.needsReview')}
          </Text>
          {event.note ? (
            <Text variant="body-sm" color="secondary">
              {event.note}
            </Text>
          ) : null}
          {corrections ? <CorrectionControls api={corrections} kind="possible_event" targetId={event.id} /> : null}
        </View>
      ))}
      {corrections ? <CorrectionFootnote api={corrections} /> : null}
    </Card>
  );
}

/** What happened to the uploaded media, as recorded by the server after cleanup. */
export function MediaLifecycleNotice({ job }: { job: MatchAnalysisJob }) {
  const { t } = useAppTranslation('matchAnalysis');
  const lifecycle = job.mediaLifecycle;
  const versions = job.report?.versions;
  if (!lifecycle && !versions && job.mediaCleanupState !== 'pending' && job.mediaCleanupState !== 'retry_window') return null;
  return (
    <Card variant="default" padding="md" className="gap-1" testID="media-lifecycle">
      {lifecycle ? (
        <Text variant="body-sm" color="secondary">
          {t(`video.lifecycle.${lifecycle.source}`, { count: lifecycle.citedFramesKept })}
        </Text>
      ) : (
        <Text variant="body-sm" color="secondary">
          {t('video.lifecycle.pending')}
        </Text>
      )}
      {lifecycle && lifecycle.evidenceClips > 0 ? (
        <Text variant="body-sm" color="secondary">
          {t('video.lifecycle.clips', { count: lifecycle.evidenceClips })}
        </Text>
      ) : null}
      {versions ? (
        <Text variant="caption" color="secondary">
          {t('video.version', { version: versions.analysisVersion, pipeline: versions.pipelineVersion })}
        </Text>
      ) : null}
    </Card>
  );
}

export function VideoIntelligenceSections({ job }: { job: MatchAnalysisJob }) {
  const corrections = useAnalysisCorrections(job);
  return (
    <View className="gap-4">
      <ReportSectionsCard sections={job.report?.sections ?? []} />
      <ClipReviewCard job={job} />
      <OpportunitiesCard job={job} />
      <PossibleEventsCard job={job} corrections={corrections} />
      <MediaLifecycleNotice job={job} />
    </View>
  );
}

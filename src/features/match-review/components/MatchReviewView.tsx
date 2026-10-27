import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Badge } from '@/components/primitives/Badge';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { ChoiceChip } from '@/components/primitives/ChoiceChip';
import { Heading } from '@/components/primitives/Heading';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import { useStorageUrls } from '@/features/match-analysis/hooks/useTracking';
import { startPlayerAnalysis } from '@/features/match-analysis/services/trackingV3Service';
import {
  STATE_COLORS, formatClock, withDiscovery, type TrackingDiscoveryDoc, type TrackingDoc, type TrackingProgressDoc,
} from '@/features/match-analysis/services/trackingPresentation';
import { ReelRepository } from '@/features/reel-studio/repositories/ReelRepository';
import { useReviewT } from '../hooks/useReviewT';
import { answerQuestion, suggestedQuestions, type AskAnswer, type AskIntent } from '../services/ask';
import { positionGroup, type Insight } from '../services/coach';
import { developmentTrend, observationFrom } from '../services/development';
import { draftReel, presetAvailability, selectHighlights, type HighlightPreset } from '../services/highlights';
import { deriveJourney, type JourneyProblem } from '../services/journey';
import { buildMomentsView, toMomentCard, type MomentCard as MomentCardModel, type MomentCategory } from '../services/moments';
import { buildMatchReview, type MatchReview, type ReviewView } from '../services/review';
import { useNow, usePlaybackUrl } from '../hooks/useMatchReviewData';
import { AnalysisWorkspace } from './AnalysisWorkspace';
import { MomentCard } from './MomentCard';
import { MomentPlayerModal } from './MomentPlayerModal';

export type MatchReviewViewProps = {
  jobId: string;
  playerId: string;
  match: { date: string; opponent: string };
  position: string | null;
  job: { videoDownloadUrl?: string; videoStoragePath?: string; measuredDurationSec?: number; durationSec?: number; jerseyNumber?: string };
  tracking: TrackingDoc | null;
  progress: TrackingProgressDoc | null;
  /** 4.1: number sightings from the early discovery pass (playable before any report). */
  discovery?: TrackingDiscoveryDoc | null;
  goals: Array<{ id: string; title: string }>;
  initialSection?: 'moments' | 'review';
  initialView?: ReviewView;
  /** Opens this moment's player on mount (deep links). */
  initialMomentId?: string;
  onCreateGoal?: (insight: Insight) => Promise<void>;
  onOpenReel?: (reelId: string) => void;
  onGiveConsent?: () => void;
};

function SectionTitle({ children, badge }: { children: string; badge?: string }) {
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <Heading level={3}>{children}</Heading>
      {badge ? <Badge size="sm" variant="info" label={badge} /> : null}
    </View>
  );
}

function MomentRow({ items, urls, onOpen }: { items: MomentCardModel[]; urls: Record<string, string>; onOpen: (m: MomentCardModel) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 2 }}>
      {items.map((m) => <MomentCard key={m.id} moment={m} imageUrl={m.imagePath ? urls[m.imagePath] : null} onPress={onOpen} />)}
    </ScrollView>
  );
}

function InsightCard({ insight, moments, onOpen, onCreateGoal }: { insight: Insight; moments: MomentCardModel[];
  onOpen: (m: MomentCardModel) => void; onCreateGoal?: (i: Insight) => Promise<void> }) {
  const t = useReviewT();
  const [added, setAdded] = useState(false);
  const base = `review.coach.${insight.topic}.${insight.kind}`;
  const params = insight.params as Record<string, number>;
  const linked = moments.filter((m) => insight.momentIds.includes(m.id));
  return (
    <View className="gap-2 rounded-lg border border-border px-3 py-3" testID={`insight-${insight.id}`}>
      <Text weight="semibold">{t(`${base}.what`, params)}</Text>
      <View className="gap-1">
        <Text variant="caption" weight="semibold" color="secondary">
          {t(insight.kind === 'observation' ? 'review.label.interpretation' : 'review.label.whyItMatters')}
        </Text>
        <Text variant="body-sm">{t(`${base}.why`, params)}</Text>
      </View>
      <View className="gap-1">
        <Text variant="caption" weight="semibold" color="secondary">{t('review.label.doDifferently')}</Text>
        <Text variant="body-sm">{t(`${base}.do`, params)}</Text>
      </View>
      {insight.drill ? (
        <View className="gap-1">
          <Text variant="caption" weight="semibold" color="secondary">{t('review.label.howToPractise')}</Text>
          <Text variant="body-sm" weight="semibold">
            {t(`review.drill.${insight.drill.id}.name`)} · {t('review.drill.minutes', { minutes: insight.drill.minutes })}
          </Text>
          <Text variant="body-sm">{t(`review.drill.${insight.drill.id}.how`)}</Text>
        </View>
      ) : null}
      {(insight.clips ?? []).length > 0 ? (
        <View className="gap-1">
          <Text variant="caption" weight="semibold" color="secondary">{t('review.label.whereToSee')}</Text>
          <View className="flex-row flex-wrap gap-2">
            {(insight.clips ?? []).map((c) => (
              <Button key={c.start} size="sm" variant="secondary" onPress={() => onOpen(clipCard(c))}>{`▶ ${formatClock(c.start)}`}</Button>
            ))}
          </View>
        </View>
      ) : null}
      {linked.length > 0 ? (
        <View className="gap-1">
          <Text variant="caption" weight="semibold" color="secondary">{t('review.label.whereToSee')}</Text>
          <View className="flex-row flex-wrap gap-2">
            {linked.map((m) => (
              <Button key={m.id} size="sm" variant="secondary" onPress={() => onOpen(m)}
                accessibilityLabel={t('review.moments.open', { kind: t(`review.moments.kind.${m.titleKey}`), time: formatClock(m.actionAt) })}>
                {`▶ ${formatClock(m.actionAt)}`}
              </Button>
            ))}
          </View>
        </View>
      ) : null}
      <Text variant="caption" color="tertiary">{t('review.label.evidence')}: {t(`review.moments.evidence.${insight.evidence}`)}</Text>
      {onCreateGoal && insight.kind === 'improve' ? (
        added ? <Text variant="caption" color="secondary">{t('review.focus.goalAdded')}</Text> : (
          <Button size="sm" variant="ghost" onPress={() => void onCreateGoal(insight).then(() => setAdded(true)).catch(() => undefined)}>
            {t('review.focus.addGoal')}
          </Button>
        )
      ) : null}
    </View>
  );
}

/** A watchable time range (e.g. an off-ball episode) as a player-ready card without an outline. */
function clipCard(c: { start: number; end: number }): MomentCardModel {
  const start = Math.max(0, c.start - 1);
  const end = Math.min(start + 20, Math.max(c.end + 1, start + 4));
  return toMomentCard({ id: `c_${Math.round(c.start * 10)}`, kind: 'spell', kinds: ['spell'], start: c.start, end: c.end,
    clipStart: start, clipEnd: end, identityState: 'CONFIRMED_VISIBLE', candidate: false, indicator: [] });
}

function StoryStrip({ review }: { review: MatchReview }) {
  const t = useReviewT();
  const color = { confirmed: STATE_COLORS.CONFIRMED_VISIBLE, likely: STATE_COLORS.LIKELY_VISIBLE, not_seen: STATE_COLORS.UNKNOWN, no_play: STATE_COLORS.NON_MATCH_PERIOD };
  const pattern = { confirmed: '■', likely: '▣', not_seen: '□', no_play: '·' };
  return (
    <View className="gap-2">
      <View className="flex-row overflow-hidden rounded-md" style={{ height: 22 }}>
        {review.story.map((b) => (
          <View key={b.start} style={{ flex: b.end - b.start, backgroundColor: color[b.state] }} className="items-center justify-center" accessible
            accessibilityLabel={`${t('review.story.bucket', { from: formatClock(b.start), to: formatClock(b.end), state: t(`review.story.${b.state}`) })}. ${t('review.story.moments', { count: b.momentIds.length })}`}>
            {b.momentIds.length > 0 ? <Text variant="caption" weight="bold">{b.momentIds.length}</Text> : null}
          </View>
        ))}
      </View>
      <View className="flex-row flex-wrap gap-3">
        {(['confirmed', 'likely', 'not_seen', 'no_play'] as const).map((k) => (
          <Text key={k} variant="caption" color="secondary">{pattern[k]} {t(`review.story.${k}`)}</Text>
        ))}
      </View>
    </View>
  );
}

function AskCard({ review, tracking, position, onOpen }: { review: MatchReview; tracking: TrackingDoc; position: string | null; onOpen: (m: MomentCardModel) => void }) {
  const t = useReviewT();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  const report = tracking.report;
  const ask = (q: string) => setAnswer(answerQuestion(q, report, { position }));
  const askIntent = (intent: AskIntent) => {
    const q = t(`review.ask.q.${intent}`);
    setQuestion(q);
    setAnswer({ ...answerQuestion(q, report, { position }), intent });
  };
  const suggestions = answer ? answer.followUps : suggestedQuestions(report);
  void review;
  return (
    <View className="gap-3">
      <View className="flex-row items-end gap-2">
        <View className="flex-1">
          <Input value={question} onChangeText={setQuestion} placeholder={t('review.ask.placeholder')} accessibilityLabel={t('review.section.ask')}
            onSubmitEditing={() => ask(question)} returnKeyType="send" testID="ask-input" />
        </View>
        <Button onPress={() => ask(question)} disabled={!question.trim()} testID="ask-send">{t('review.ask.send')}</Button>
      </View>
      {answer ? (
        <View className="gap-2 rounded-lg bg-background-secondary px-3 py-3" accessibilityLiveRegion="polite" testID="ask-answer">
          <Text variant="body-sm">{t(`review.ask.a.${answer.key}`, answer.params)}</Text>
          {answer.insight ? (
            <Text variant="body-sm" weight="semibold">{t(`review.coach.${answer.insight.topic}.${answer.insight.kind}.what`, answer.insight.params as Record<string, number>)}</Text>
          ) : null}
          {answer.moments.length > 0 ? (
            <View className="flex-row flex-wrap gap-2">
              {answer.moments.map((m) => (
                <Button key={m.id} size="sm" variant="secondary" onPress={() => onOpen(m)}>{`▶ ${formatClock(m.actionAt)}`}</Button>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
      {suggestions.length > 0 ? (
        <View className="gap-2">
          {answer ? <Text variant="caption" color="secondary">{t('review.ask.followUp')}</Text> : null}
          <View className="flex-row flex-wrap gap-2">
            {suggestions.map((intent) => (
              <ChoiceChip key={intent} label={t(`review.ask.q.${intent}`)} selected={false} onPress={() => askIntent(intent)} />
            ))}
          </View>
        </View>
      ) : null}
      <Text variant="caption" color="tertiary">{t('review.ask.disclosure')}</Text>
    </View>
  );
}

function HighlightsCard({ jobId, playerId, moments, position, title, onOpenReel }: { jobId: string; playerId: string; moments: MomentCardModel[];
  position: string | null; title: string; onOpenReel?: (reelId: string) => void }) {
  const t = useReviewT();
  const presets = presetAvailability(moments, positionGroup(position));
  const firstAvailable = presets.find((p) => p.available)?.preset ?? 'my_match';
  const [preset, setPreset] = useState<HighlightPreset>(firstAvailable);
  const [custom, setCustom] = useState<string[]>([]);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const clips = selectHighlights(moments, preset, 60, custom);
  const total = Math.round(clips.reduce((a, c) => a + (c.outSec - c.inSec), 0));
  const save = async () => {
    setState('saving');
    try {
      const reel = draftReel(playerId, jobId, preset, clips, `${t(`review.highlights.preset.${preset}`)} · ${title}`, new Date(), `reel_${Date.now()}`);
      const saved = await ReelRepository.getInstance().saveReel(reel);
      setState('saved');
      onOpenReel?.(saved.id);
    } catch {
      setState('failed');
    }
  };
  return (
    <View className="gap-3">
      <Text variant="caption" color="secondary">{t('review.highlights.intro')}</Text>
      <View className="flex-row flex-wrap gap-2">
        {presets.map((p) => (
          <ChoiceChip key={p.preset} label={t(`review.highlights.preset.${p.preset}`)} selected={preset === p.preset}
            disabled={!p.available} onPress={() => setPreset(p.preset)} />
        ))}
      </View>
      {presets.filter((p) => !p.available && p.reason).map((p) => (
        <Text key={p.preset} variant="caption" color="tertiary">
          {t(`review.highlights.preset.${p.preset}`)}: {t(`review.highlights.unavailable.${p.reason}`)}
        </Text>
      ))}
      {preset === 'custom' ? (
        <View className="gap-2">
          <Text variant="caption" color="secondary">{t('review.highlights.selectHint')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {moments.map((m) => (
              <MomentCard key={m.id} moment={m} width={132} selected={custom.includes(m.id)}
                onPress={() => setCustom((c) => (c.includes(m.id) ? c.filter((x) => x !== m.id) : [...c, m.id]))} />
            ))}
          </ScrollView>
        </View>
      ) : null}
      {clips.length > 0 ? (
        <>
          <Text variant="body-sm" weight="semibold">{t('review.highlights.summary', { count: clips.length, sec: total })}</Text>
          <Button variant="secondary" loading={state === 'saving'} disabled={state === 'saved'} onPress={() => void save()} testID="review-save-reel">
            {t('review.highlights.create')}
          </Button>
        </>
      ) : null}
      {state === 'saved' ? <Text variant="caption" color="secondary">{t('review.highlights.created')}</Text> : null}
      {state === 'failed' ? <Text variant="caption" color="error" accessibilityRole="alert">{t('review.highlights.failed')}</Text> : null}
    </View>
  );
}

/** The player-first Match Review (Video Intelligence 4.0). */
export function MatchReviewView(props: MatchReviewViewProps) {
  const { jobId, playerId, match, position, job, tracking: trackingDoc, progress, discovery, goals, initialSection, initialView, initialMomentId,
    onCreateGoal, onOpenReel, onGiveConsent } = props;
  const t = useReviewT();
  const now = useNow();
  const [view, setView] = useState<ReviewView>(initialView ?? 'simple');
  const [filter, setFilter] = useState<MomentCategory | 'all'>('all');
  const [showAll, setShowAll] = useState(initialSection === 'moments');
  const [open, setOpen] = useState<MomentCardModel | null>(null);
  const [startBusy, setStartBusy] = useState(false);
  const [startError, setStartError] = useState(false);
  // Discovery sightings join the report's moments (a sighting already shown by a confirmed report
  // moment is not repeated); before any report exists they are shown on their own.
  const tracking = useMemo<TrackingDoc | null>(() => (trackingDoc?.report
    ? { ...trackingDoc, report: withDiscovery(trackingDoc.report, discovery?.moments) } : trackingDoc), [trackingDoc, discovery]);
  const earlyCards = useMemo(() => (trackingDoc?.report ? [] : (discovery?.moments ?? []).map(toMomentCard)), [trackingDoc, discovery]);
  const journey = useMemo(() => deriveJourney(progress, tracking, now, discovery?.moments.length ?? 0), [progress, tracking, now, discovery]);
  const review = useMemo(() => buildMatchReview(tracking, view, { position, goals }), [tracking, view, position, goals]);
  const momentsView = useMemo(() => buildMomentsView(tracking?.report ?? null, filter), [tracking, filter]);
  const allCards = useMemo(() => { const v = buildMomentsView(tracking?.report ?? null); return [...v.moments, ...v.needsReview]; }, [tracking]);
  const urls = useStorageUrls([...allCards, ...earlyCards].map((m) => m.imagePath));
  const playback = usePlaybackUrl(job);
  const report = tracking?.report ?? null;
  const recordingSec = report?.coverage.recordingSec ?? job.measuredDurationSec ?? job.durationSec ?? 0;

  useEffect(() => {
    if (initialSection === 'moments') setShowAll(true);
  }, [initialSection]);
  useEffect(() => {
    if (initialMomentId) setOpen([...allCards, ...earlyCards].find((m) => m.id === initialMomentId) ?? null);
  }, [initialMomentId, allCards, earlyCards]);

  const start = async () => {
    setStartBusy(true);
    setStartError(false);
    try {
      await startPlayerAnalysis(jobId);
    } catch {
      setStartError(true);
    } finally {
      setStartBusy(false);
    }
  };
  const onProblemAction = (action: JourneyProblem['action']) => {
    if (action === 'resume' || action === 'wait') void start();
    else if (action === 'give_consent') onGiveConsent?.();
  };

  if (!journey && !review) {
    return (
      <Card padding="lg" className="gap-3" testID="review-start">
        <Heading level={3}>{t('review.start.title')}</Heading>
        <Text variant="body-sm" color="secondary">{t('review.start.body')}</Text>
        <Button onPress={() => void start()} loading={startBusy}>{startBusy ? t('review.start.starting') : t('review.start.action')}</Button>
        {startError ? <Text variant="caption" color="error" accessibilityRole="alert">{t('review.start.failed')}</Text> : null}
      </Card>
    );
  }

  const trend = developmentTrend([observationFrom(jobId, match.date, tracking)].filter((o): o is NonNullable<typeof o> => o !== null));
  const showWorkspace = journey && (!journey.complete || journey.problem);
  const has = (s: MatchReview['sections'][number]) => review?.sections.includes(s) ?? false;

  return (
    <View className="gap-4" testID="match-review">
      {showWorkspace ? <AnalysisWorkspace journey={journey} onProblemAction={onProblemAction} busy={startBusy}
        number={job.jerseyNumber ?? null} /> : null}

      {!review && earlyCards.length > 0 ? (
        <Card padding="lg" className="gap-2" testID="review-early-moments">
          <SectionTitle badge={t('review.preliminaryBadge')}>{t('review.moments.earlyTitle')}</SectionTitle>
          <Text variant="caption" color="secondary">{t('review.moments.earlyBody')}</Text>
          <MomentRow items={earlyCards} urls={urls} onOpen={setOpen} />
        </Card>
      ) : null}

      {review ? (
        <>
          <View className="flex-row flex-wrap items-center gap-2" accessibilityRole="radiogroup" accessibilityLabel={t('review.view.label')}>
            {(['simple', 'detailed', 'scout'] as const).map((v) => (
              <ChoiceChip key={v} label={t(`review.view.${v}`)} selected={view === v} onPress={() => setView(v)} />
            ))}
            {tracking?.stale ? <Badge size="sm" variant="warning" label={t('review.updating')} /> : null}
          </View>

          {/* A Hero */}
          <View className="gap-2 border-l-4 border-accent py-2 pl-4" testID="review-hero">
            <View className="flex-row flex-wrap items-center gap-2">
              <Heading level={2}>{t(`review.hero.${review.hero.tone}`)}</Heading>
              {review.status === 'partial' ? <Badge size="sm" variant="info" label={t('review.preliminaryBadge')} /> : null}
            </View>
            <Text variant="caption" color="secondary">{`${match.date} · ${match.opponent}`}</Text>
            <View className="flex-row flex-wrap gap-2">
              <Badge variant="success" label={t('review.hero.confirmedMoments', { count: review.hero.confirmedMoments })} />
              {review.hero.reviewMoments > 0 ? <Badge variant="warning" label={t('review.hero.reviewMoments', { count: review.hero.reviewMoments })} /> : null}
            </View>
            <Text variant="body-sm" color="secondary">
              {t('review.hero.seen', { seen: review.hero.seenMin, confirmed: review.hero.confirmedMin, analysed: review.hero.analysedMin })}
            </Text>
            {review.status === 'partial' && review.hero.analysedUntilSec !== null ? (
              <Text variant="caption" color="secondary">{t('review.hero.partial', { until: formatClock(review.hero.analysedUntilSec) })}</Text>
            ) : null}
          </View>

          {/* Identity review lives where the moments are: answer while watching */}
          {view !== 'scout' && review.moments.needsReview.length > 0 ? (
            <Card padding="lg" className="gap-2" testID="review-needs-review">
              <SectionTitle>{t('review.section.needsReview')}</SectionTitle>
              <Text variant="caption" color="secondary">{t('review.moments.needsReviewIntro')}</Text>
              <MomentRow items={review.moments.needsReview} urls={urls} onOpen={setOpen} />
            </Card>
          ) : null}

          {/* B Match story */}
          {has('story') ? (
            <Card padding="lg" className="gap-2">
              <SectionTitle>{t('review.section.story')}</SectionTitle>
              <StoryStrip review={review} />
            </Card>
          ) : null}

          {/* C Best moments + My moments */}
          <Card padding="lg" className="gap-3" testID="review-moments">
            <SectionTitle>{t('review.section.best')}</SectionTitle>
            {review.best.length > 0 ? <MomentRow items={review.best} urls={urls} onOpen={setOpen} /> : (
              <Text variant="body-sm" color="secondary">{review.moments.needsReview.length > 0 ? t('review.moments.noneConfirmed') : t('review.moments.emptyBody')}</Text>
            )}
            {review.moments.moments.length > review.best.length || showAll ? (
              <Button size="sm" variant="link" onPress={() => setShowAll((s) => !s)} accessibilityState={{ expanded: showAll }}>
                {`${t('review.section.moments')} (${review.moments.moments.length})`}
              </Button>
            ) : null}
            {showAll ? (
              <View className="gap-2">
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  <ChoiceChip label={t('review.moments.all')} selected={filter === 'all'} onPress={() => setFilter('all')} />
                  {review.moments.categories.map((c) => (
                    <ChoiceChip key={c.id} label={`${t(`review.moments.category.${c.id}`)} (${c.count})`} selected={filter === c.id} onPress={() => setFilter(c.id)} />
                  ))}
                </ScrollView>
                {momentsView.moments.length > 0 ? <MomentRow items={momentsView.moments} urls={urls} onOpen={setOpen} />
                  : <Text variant="body-sm" color="secondary">{t('review.moments.empty')}</Text>}
              </View>
            ) : null}
          </Card>

          {/* D / E coaching */}
          {has('well') && review.well.length > 0 ? (
            <Card padding="lg" className="gap-3">
              <SectionTitle>{t('review.section.well')}</SectionTitle>
              {review.well.map((i) => <InsightCard key={i.id} insight={i} moments={allCards} onOpen={setOpen} />)}
            </Card>
          ) : null}
          {has('improve') && (review.improve.length > 0 || review.limitations.length > 0) ? (
            <Card padding="lg" className="gap-3">
              <SectionTitle>{t('review.section.improve')}</SectionTitle>
              {review.improve.map((i) => <InsightCard key={i.id} insight={i} moments={allCards} onOpen={setOpen} onCreateGoal={onCreateGoal} />)}
              {review.limitations.map((i) => <InsightCard key={i.id} insight={i} moments={allCards} onOpen={setOpen} />)}
            </Card>
          ) : null}

          {view !== 'scout' && review.observations.length > 0 ? (
            <Card padding="lg" className="gap-3" testID="review-offball">
              <SectionTitle>{t('review.section.offball')}</SectionTitle>
              {review.observations.map((i) => <InsightCard key={i.id} insight={i} moments={allCards} onOpen={setOpen} />)}
            </Card>
          ) : null}

          {/* H Next match focus */}
          {has('focus') ? (
            <Card padding="lg" className="gap-2" testID="review-focus">
              <SectionTitle>{t('review.section.focus')}</SectionTitle>
              {review.focus?.kind === 'skill' ? (
                <>
                  <Text weight="semibold">{t('review.focus.skill', { topic: t(`review.topic.${review.focus.topic}`) })}</Text>
                  {review.focus.drill ? <Text variant="body-sm">{`${t(`review.drill.${review.focus.drill.id}.name`)}: ${t(`review.drill.${review.focus.drill.id}.how`)}`}</Text> : null}
                  {review.focus.matchesGoalId ? (
                    <Text variant="caption" color="secondary">{t('review.focus.matchesGoal', { title: goals.find((g) => g.id === (review.focus?.kind === 'skill' ? review.focus.matchesGoalId : ''))?.title ?? '' })}</Text>
                  ) : null}
                </>
              ) : review.focus?.kind === 'recording' ? (
                <Text variant="body-sm">{t(`review.tip.${review.focus.tip}`)}</Text>
              ) : <Text variant="body-sm" color="secondary">{t('review.focus.none')}</Text>}
            </Card>
          ) : null}

          {view !== 'scout' ? (
            <Card padding="lg" className="gap-3">
              <SectionTitle>{t('review.section.highlights')}</SectionTitle>
              <HighlightsCard jobId={jobId} playerId={playerId} moments={allCards} position={position}
                title={`${match.date} vs ${match.opponent}`} onOpenReel={onOpenReel} />
            </Card>
          ) : null}

          {/* F Analysis details */}
          {has('details') ? (
            <Card padding="lg" className="gap-2" testID="review-details">
              <SectionTitle>{t('review.section.details')}</SectionTitle>
              {([
                ['analysed', review.details.coverage.analysedSec], ['confirmed', review.details.coverage.confirmedVisibleSec],
                ['likely', review.details.coverage.likelyVisibleSec], ['ambiguous', review.details.coverage.ambiguousSec],
                ['notIdentified', review.details.coverage.notIdentifiedSec], ['unobserved', review.details.coverage.unobservedSec],
                ['nonMatch', review.details.coverage.nonMatchSec + review.details.coverage.offPitchSec],
              ] as const).map(([k, sec]) => (
                <View key={k} className="flex-row justify-between">
                  <Text variant="body-sm" color="secondary">{t(`review.details.${k}`)}</Text>
                  <Text variant="body-sm" weight="semibold">{t('review.details.minutes', { value: (sec / 60).toFixed(1) })}</Text>
                </View>
              ))}
              <View className="flex-row justify-between"><Text variant="body-sm" color="secondary">{t('review.details.sightings')}</Text><Text variant="body-sm" weight="semibold">{review.details.numberSightings}</Text></View>
              <View className="flex-row justify-between"><Text variant="body-sm" color="secondary">{t('review.details.confirmedByUser')}</Text><Text variant="body-sm" weight="semibold">{review.details.confirmedByUser}</Text></View>
              <View className="flex-row justify-between"><Text variant="body-sm" color="secondary">{t('review.details.ballEvents')}</Text><Text variant="body-sm" weight="semibold">{review.details.ballEventsMeasured}</Text></View>
              <Text variant="body-sm">{t(review.details.physical === 'verified' ? 'review.details.physicalVerified' : 'review.details.physicalNot')}</Text>
              {review.limitations.length > 0 ? (
                <View className="gap-1">
                  <Text variant="caption" weight="semibold" color="secondary">{t('review.details.limitations')}</Text>
                  {review.limitations.map((i) => <Text key={i.id} variant="caption" color="secondary">{`• ${t(`review.coach.${i.topic}.limitation.what`, i.params as Record<string, number>)}`}</Text>)}
                </View>
              ) : null}
              <Text variant="caption" color="tertiary">{`${t('review.details.engine')}: ${review.details.engineVersion}`}</Text>
              <Text variant="caption" color="tertiary">{t('review.details.aiDisclosure')}</Text>
            </Card>
          ) : null}

          {view !== 'scout' ? (
            <Card padding="lg" className="gap-2">
              <SectionTitle>{t('review.section.development')}</SectionTitle>
              {trend.points.length >= 2 ? trend.points.map((p) => (
                <Text key={p.jobId} variant="body-sm">{t('review.development.point', { date: p.date, value: p.actionsPer10 })}</Text>
              )) : <Text variant="body-sm" color="secondary">{t('review.development.notEnough')}</Text>}
              {trend.excluded.map((e) => (
                <Text key={e.jobId} variant="caption" color="tertiary">
                  {t('review.development.excludedLine', { date: e.jobId === jobId ? match.date : e.jobId, reason: t(`review.development.excluded.${e.reason}`) })}
                </Text>
              ))}
            </Card>
          ) : null}

          {/* G Ask */}
          {has('ask') && tracking ? (
            <Card padding="lg" className="gap-2" testID="review-ask">
              <SectionTitle>{t('review.section.ask')}</SectionTitle>
              <AskCard review={review} tracking={tracking} position={position} onOpen={setOpen} />
            </Card>
          ) : null}
        </>
      ) : null}

      <MomentPlayerModal visible={open !== null} onClose={() => setOpen(null)} jobId={jobId} moment={open}
        videoUrl={playback.url} videoSize={report?.videoSize ?? null} recordingSec={recordingSec}
        onSaveClip={async (m, c) => {
          const reel = draftReel(playerId, jobId, 'custom', [{ momentId: m.id, inSec: c.clipStart, outSec: c.clipEnd, evidence: m.evidence }],
            `${t(`review.moments.kind.${m.titleKey}`)} · ${formatClock(m.actionAt)} · ${match.opponent}`, new Date(), `reel_${Date.now()}`);
          await ReelRepository.getInstance().saveReel(reel);
        }} />
    </View>
  );
}

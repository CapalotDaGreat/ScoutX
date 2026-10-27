import { useEffect, useMemo, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Modal } from '@/components/feedback/Modal';
import { Badge } from '@/components/primitives/Badge';
import { Button } from '@/components/primitives/Button';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import { readKeyedValue, writeKeyedValue } from '@/data/scopedAsyncStorage';
import {
  answerTrackingQuestion,
  undoTrackingAnswer,
  type TrackingAnswer,
} from '@/features/match-analysis/services/trackingV3Service';
import { formatClock } from '@/features/match-analysis/services/trackingPresentation';
import { useReviewT } from '../hooks/useReviewT';
import { triggerHaptic } from '@/utils/haptics';
import { adjustClip, indicatorAt, type MomentCard } from '../services/moments';
import { EVIDENCE_BADGE } from './MomentCard';

const NOTES_KEY = 'pitchproof.momentNotes.v1';
const FRAME_STEP = 0.1;

export type MomentPlayerModalProps = {
  visible: boolean;
  onClose: () => void;
  jobId: string;
  moment: MomentCard | null;
  /** Signed playback URL of the source; null = source no longer stored. */
  videoUrl: string | null;
  videoSize: { width: number; height: number } | null;
  recordingSec: number;
};

/** Contain-fit rectangle of the video inside its view. */
function fitRect(view: { w: number; h: number }, video: { width: number; height: number } | null) {
  if (!video || view.w <= 0 || view.h <= 0) return null;
  const s = Math.min(view.w / video.width, view.h / video.height);
  return { x: (view.w - video.width * s) / 2, y: (view.h - video.height * s) / 2, w: video.width * s, h: video.height * s };
}

/**
 * Plays one moment: starts at the clip, loops inside it, slow motion and 0.1 s frame steps, the
 * followed player outlined, "Is this you?" on uncertain moments, and a private note.
 */
export function MomentPlayerModal({ visible, onClose, jobId, moment, videoUrl, videoSize, recordingSec }: MomentPlayerModalProps) {
  const t = useReviewT();
  const [clip, setClip] = useState<{ clipStart: number; clipEnd: number } | null>(null);
  const [loop, setLoop] = useState(true);
  const [slow, setSlow] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [view, setView] = useState({ w: 0, h: 0 });
  const [answered, setAnswered] = useState<TrackingAnswer | null>(null);
  const [answerBusy, setAnswerBusy] = useState(false);
  const [answerError, setAnswerError] = useState(false);
  const [note, setNote] = useState('');
  const [noteSaved, setNoteSaved] = useState(false);

  const player = useVideoPlayer(visible && videoUrl ? videoUrl : null, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0.1;
  });

  useEffect(() => {
    if (!moment || !visible) return;
    setClip({ clipStart: moment.clipStart, clipEnd: moment.clipEnd });
    setAnswered(null);
    setAnswerError(false);
    setNoteSaved(false);
    setTime(moment.clipStart);
    void readKeyedValue<string>(NOTES_KEY, `${jobId}:${moment.id}`).then((n) => setNote(n ?? '')).catch(() => setNote(''));
  }, [jobId, moment, visible]);

  useEffect(() => {
    if (!clip || !videoUrl || !visible) return;
    player.currentTime = clip.clipStart;
    player.play();
    setPlaying(true);
  }, [clip?.clipStart, videoUrl, visible]);

  useEffect(() => {
    player.playbackRate = slow ? 0.5 : 1;
  }, [player, slow]);

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    setTime(currentTime);
    if (!clip || currentTime < clip.clipEnd) return;
    if (loop) player.currentTime = clip.clipStart;
    else {
      player.pause();
      setPlaying(false);
    }
  });

  const rect = fitRect(view, videoSize);
  const box = useMemo(() => (moment ? indicatorAt(moment.indicator, time) : null), [moment, time]);

  if (!moment) return null;
  const kind = t(`review.moments.kind.${moment.titleKey}`);

  const step = (delta: number) => {
    player.pause();
    setPlaying(false);
    const next = Math.max(0, player.currentTime + delta);
    player.currentTime = next;
    setTime(next);
  };

  const answer = async (value: TrackingAnswer) => {
    setAnswerBusy(true);
    setAnswerError(false);
    try {
      await answerTrackingQuestion(jobId, moment.id, value);
      void triggerHaptic('light').catch(() => undefined);
      setAnswered(value);
    } catch {
      setAnswerError(true);
    } finally {
      setAnswerBusy(false);
    }
  };

  return (
    <Modal visible={visible} onClose={onClose} title={t('review.player.title', { kind, time: formatClock(moment.actionAt) })} size="fullscreen">
      <View className="gap-3">
        {videoUrl ? (
          <View className="overflow-hidden rounded-xl bg-black" style={{ height: 240 }}
            onLayout={(e: LayoutChangeEvent) => setView({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
            <VideoView player={player} style={{ width: '100%', height: 240 }} contentFit="contain" nativeControls={false} />
            {box && rect ? (
              <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
                style={{ position: 'absolute', left: rect.x + box.x * rect.w, top: rect.y + box.y * rect.h,
                  width: box.w * rect.w, height: box.h * rect.h, borderWidth: 2, borderColor: '#FFD400', borderRadius: 4 }} />
            ) : null}
          </View>
        ) : (
          <View className="items-center justify-center rounded-xl bg-background-secondary px-4" style={{ height: 160 }}>
            <Text variant="body-sm" color="secondary" className="text-center">{t('review.player.unavailable')}</Text>
          </View>
        )}
        <View className="flex-row flex-wrap items-center gap-2">
          <Badge size="sm" variant={EVIDENCE_BADGE[moment.evidence]} label={t(`review.moments.evidence.${moment.evidence}`)} />
          <Text variant="caption" color="secondary">{formatClock(time)} · {formatClock(clip?.clipStart ?? 0)}–{formatClock(clip?.clipEnd ?? 0)}</Text>
        </View>
        {videoUrl ? (
          <>
            <Text variant="caption" color="tertiary">{t('review.player.indicator')}</Text>
            <View className="flex-row flex-wrap gap-2">
              <Button size="sm" onPress={() => { if (playing) { player.pause(); setPlaying(false); } else { player.play(); setPlaying(true); } }}
                accessibilityLabel={playing ? t('review.player.pause') : t('review.player.play')} testID="moment-play">
                {playing ? t('review.player.pause') : t('review.player.play')}
              </Button>
              <Button size="sm" variant="secondary" onPress={() => step(-FRAME_STEP)}>{t('review.player.stepBack')}</Button>
              <Button size="sm" variant="secondary" onPress={() => step(FRAME_STEP)}>{t('review.player.stepForward')}</Button>
              <Button size="sm" variant="secondary" accessibilityState={{ selected: slow }} onPress={() => setSlow((s) => !s)}>
                {slow ? t('review.player.normal') : t('review.player.slow')}
              </Button>
              <Button size="sm" variant="ghost" accessibilityState={{ selected: loop }} onPress={() => setLoop((l) => !l)}>
                {loop ? t('review.player.loopOn') : t('review.player.loopOff')}
              </Button>
              <Button size="sm" variant="ghost" onPress={() => { if (clip) { player.currentTime = clip.clipStart; player.play(); setPlaying(true); } }}>
                {t('review.player.replay')}
              </Button>
            </View>
            <View className="flex-row flex-wrap gap-2">
              <Button size="sm" variant="link" onPress={() => clip && setClip(adjustClip(clip, -2, 0, recordingSec))}>{t('review.player.startEarlier')}</Button>
              <Button size="sm" variant="link" onPress={() => clip && setClip(adjustClip(clip, 0, 2, recordingSec))}>{t('review.player.endLater')}</Button>
            </View>
          </>
        ) : null}

        {moment.askIdentity ? (
          <View className="gap-2 rounded-md border border-border px-3 py-3" testID="moment-identity">
            <Text weight="semibold">{t('review.player.isThisYou')}</Text>
            <Text variant="caption" color="secondary">{t('review.moments.needsReviewIntro')}</Text>
            {answered ? (
              <View className="flex-row flex-wrap items-center gap-2">
                <Text variant="body-sm">{t('review.player.answered')}</Text>
                <Button size="sm" variant="link" disabled={answerBusy}
                  onPress={() => { setAnswerBusy(true); void undoTrackingAnswer(jobId).then(() => setAnswered(null)).catch(() => setAnswerError(true)).finally(() => setAnswerBusy(false)); }}>
                  {t('review.player.undo')}
                </Button>
              </View>
            ) : (
              <View className="flex-row flex-wrap gap-2">
                <Button size="sm" onPress={() => void answer('yes')} disabled={answerBusy} testID="moment-answer-yes">{t('review.player.yes')}</Button>
                <Button size="sm" variant="destructive" onPress={() => void answer('not_me')} disabled={answerBusy}>{t('review.player.notMe')}</Button>
                <Button size="sm" variant="ghost" onPress={() => void answer('unsure')} disabled={answerBusy}>{t('review.player.notSure')}</Button>
                <Button size="sm" variant="ghost" onPress={() => void answer('skip')} disabled={answerBusy}>{t('review.player.skip')}</Button>
              </View>
            )}
            {answerError ? <Text variant="caption" color="error" accessibilityRole="alert">{t('review.player.answerError')}</Text> : null}
          </View>
        ) : null}

        <View className="gap-2">
          <Input label={t('review.player.note')} placeholder={t('review.player.notePlaceholder')} value={note}
            onChangeText={(v) => { setNote(v.slice(0, 500)); setNoteSaved(false); }} multiline />
          <View className="flex-row items-center gap-3">
            <Button size="sm" variant="secondary" onPress={() => {
              void writeKeyedValue(NOTES_KEY, `${jobId}:${moment.id}`, note.trim()).then(() => setNoteSaved(true)).catch(() => undefined);
            }}>{t('review.player.saveNote')}</Button>
            {noteSaved ? <Text variant="caption" color="secondary">{t('review.player.noteSaved')}</Text> : null}
          </View>
        </View>
        <Button variant="ghost" onPress={onClose}>{t('review.player.close')}</Button>
      </View>
    </Modal>
  );
}

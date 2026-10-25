import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { Modal } from '@/components/feedback/Modal';
import { useSnackbar } from '@/components/feedback/Snackbar';
import { Button } from '@/components/primitives/Button';
import { ChoiceChip } from '@/components/primitives/ChoiceChip';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import {
  buildQuickMatchDefaults,
  formatMatchResult,
  hasMeaningfulMatchInput,
  parseMatchResult,
  recentCompetitions,
  repeatLastMatchContext,
  shiftIsoDate,
  todayIsoDate,
  validateMatchLogForm,
  type MatchLogFormState,
  type MatchLogNumericField,
  type MatchLogValidationError,
  type MatchResultOutcome,
} from '@/features/player-statistics/models/MatchLogModel';
import { type MatchLogPayload, type PlayerMatchStatistics } from '@/features/player-statistics/types';
import { matchLogDraftStore, workflowEvents } from '@/features/today/services/workflowStores';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { toUserMessage } from '@/utils/userFacingError';

export type LogMatchModalProps = {
  visible: boolean;
  saving?: boolean;
  onClose: () => void;
  onSave: (payload: MatchLogPayload) => Promise<unknown>;
  /** Used for smart defaults (last competition/position/minutes) and duplicate-draft detection. */
  previousMatches?: PlayerMatchStatistics[];
  profilePosition?: string;
  /** Drafts are stored per user; without a user nothing is persisted. */
  userId?: string | null;
  /** When set, a saved match offers follow-ups instead of closing straight away. */
  onNextStep?: (step: MatchNextStep, payload: MatchLogPayload) => void;
};

export type MatchNextStep = 'analyze' | 'uploadVideo' | 'addGoal';

type Translate = ReturnType<typeof useAppTranslation>['t'];

const MINUTE_PRESETS = ['90', '70', '45', '30'];
const AUTOSAVE_DELAY_MS = 800;

function sameMatch(form: MatchLogFormState, match: PlayerMatchStatistics): boolean {
  return (
    match.date.slice(0, 10) === form.date &&
    match.opponent.trim().toLowerCase() === form.opponent.trim().toLowerCase()
  );
}

function fieldLabel(t: Translate, field: MatchLogNumericField): string {
  switch (field) {
    case 'minutes':
      return t('statistics:quickMatch.minutes');
    case 'goals':
      return t('statistics:quickMatch.goals');
    case 'assists':
      return t('statistics:quickMatch.assists');
    case 'shots':
      return t('statistics:quickMatch.shots');
    case 'tackles':
      return t('statistics:quickMatch.tackles');
    case 'yellowCards':
      return t('statistics:quickMatch.yellowCards');
    case 'redCards':
      return t('statistics:quickMatch.redCards');
    case 'passAccuracy':
      return t('statistics:quickMatch.passAccuracy');
    case 'matchRating':
      return t('statistics:quickMatch.matchRating');
  }
}

function validationMessage(t: Translate, error: MatchLogValidationError): string {
  switch (error.code) {
    case 'opponent_required':
      return t('statistics:quickMatch.errors.opponentRequired');
    case 'competition_required':
      return t('statistics:quickMatch.errors.competitionRequired');
    case 'minutes_required':
      return t('statistics:quickMatch.errors.minutesRequired');
    case 'date_invalid':
      return t('statistics:quickMatch.errors.dateInvalid');
    case 'date_future':
      return t('statistics:quickMatch.errors.dateFuture');
    case 'not_a_number':
      return t('statistics:quickMatch.errors.notANumber', { field: fieldLabel(t, error.field) });
    case 'not_whole':
      return t('statistics:quickMatch.errors.notWhole', { field: fieldLabel(t, error.field) });
    case 'out_of_range':
      return t('statistics:quickMatch.errors.outOfRange', {
        field: fieldLabel(t, error.field),
        min: error.min,
        max: error.max,
      });
  }
}

function FieldLabel({ children }: { children: string }) {
  return (
    <Text variant="label" className="mb-2">
      {children}
    </Text>
  );
}

/**
 * Quick Match: the six essentials (opponent, date, competition, position, minutes, result)
 * fit on one screen with one-tap choices. Extra stats are opt-in and stay "not recorded"
 * when left empty. Progress is autosaved locally and never written to the server until saved.
 */
export function LogMatchModal({
  visible,
  saving = false,
  onClose,
  onSave,
  previousMatches = [],
  profilePosition = '',
  userId = null,
  onNextStep,
}: LogMatchModalProps) {
  const { t, i18n } = useAppTranslation(['statistics', 'common']);
  const { showSnackbar } = useSnackbar();

  const [form, setForm] = useState<MatchLogFormState>(() =>
    buildQuickMatchDefaults(previousMatches, profilePosition),
  );
  const [baseline, setBaseline] = useState<MatchLogFormState>(form);
  const [submitting, setSubmitting] = useState(false);
  const [showMoreStats, setShowMoreStats] = useState(false);
  const [customDate, setCustomDate] = useState(false);
  const [restoredAt, setRestoredAt] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [savedPayload, setSavedPayload] = useState<MatchLogPayload | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formRef = useRef(form);
  formRef.current = form;

  const isSaving = saving || submitting;
  const competitions = useMemo(() => recentCompetitions(previousMatches), [previousMatches]);
  const today = todayIsoDate();
  const yesterday = shiftIsoDate(today, -1);
  const { outcome, score } = parseMatchResult(form.result);

  const formatTime = useCallback(
    (iso: string) => {
      const date = new Date(iso);
      return Number.isNaN(date.getTime())
        ? ''
        : new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit' }).format(date);
    },
    [i18n.language],
  );

  // Initialise on open: restore a valid draft unless that match was already logged.
  useEffect(() => {
    if (!visible) {
      setReady(false);
      return;
    }
    let cancelled = false;
    const defaults = buildQuickMatchDefaults(previousMatches, profilePosition);
    setBaseline(defaults);
    setSavedAt(null);
    setRestoredAt(null);
    setShowMoreStats(false);
    setSavedPayload(null);
    void (async () => {
      const draft = userId ? await matchLogDraftStore.load(userId).catch(() => null) : null;
      if (cancelled) {
        return;
      }
      if (draft && previousMatches.some((match) => sameMatch(draft.data, match))) {
        await matchLogDraftStore.clear(userId ?? '').catch(() => undefined);
        workflowEvents.emit();
        setForm(defaults);
      } else if (draft) {
        setForm(draft.data);
        setRestoredAt(draft.savedAt);
        setSavedAt(draft.savedAt);
        setCustomDate(draft.data.date !== todayIsoDate() && draft.data.date !== shiftIsoDate(todayIsoDate(), -1));
      } else {
        setForm(defaults);
        setCustomDate(false);
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // Only re-initialise when the modal opens, not on every profile update while it is open.
  }, [visible, userId]);

  const persistDraft = useCallback(
    async (state: MatchLogFormState) => {
      if (!userId) {
        return;
      }
      try {
        if (hasMeaningfulMatchInput(state, baseline)) {
          setSavedAt(await matchLogDraftStore.save(userId, state));
        } else {
          await matchLogDraftStore.clear(userId);
          setSavedAt(null);
        }
        workflowEvents.emit();
      } catch (draftError) {
        if (__DEV__) {
          console.warn('[QuickMatch] Draft could not be stored', draftError);
        }
      }
    },
    [baseline, userId],
  );

  useEffect(() => {
    if (!visible || !ready) {
      return;
    }
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
    }
    autosaveTimer.current = setTimeout(() => void persistDraft(form), AUTOSAVE_DELAY_MS);
    return () => {
      if (autosaveTimer.current) {
        clearTimeout(autosaveTimer.current);
      }
    };
  }, [form, persistDraft, ready, visible]);

  const setField = <Key extends keyof MatchLogFormState>(key: Key, value: MatchLogFormState[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const setResult = (nextOutcome: MatchResultOutcome | null, nextScore: string) => {
    setField('result', formatMatchResult(nextOutcome, nextScore));
  };

  const handleClose = () => {
    if (savedPayload) {
      setSavedPayload(null);
      onClose();
      return;
    }
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    if (ready) {
      void persistDraft(formRef.current);
    }
    onClose();
  };

  const handleDiscardDraft = () => {
    const discarded = formRef.current;
    setForm(baseline);
    setRestoredAt(null);
    setSavedAt(null);
    if (userId) {
      void matchLogDraftStore
        .clear(userId)
        .then(() => workflowEvents.emit())
        .catch(() => undefined);
    }
    showSnackbar({
      message: t('statistics:quickMatch.draftDiscarded'),
      actionLabel: t('common:undo'),
      onAction: () => {
        setForm(discarded);
        void persistDraft(discarded);
      },
    });
  };

  const handleSave = async () => {
    const validation = validateMatchLogForm(form);
    if (!validation.valid) {
      Alert.alert(t('statistics:quickMatch.validationTitle'), validationMessage(t, validation.error));
      return;
    }

    setSubmitting(true);
    try {
      await onSave(validation.payload);
      if (autosaveTimer.current) {
        clearTimeout(autosaveTimer.current);
        autosaveTimer.current = null;
      }
      if (userId) {
        await matchLogDraftStore.clear(userId).catch(() => undefined);
      }
      setReady(false);
      workflowEvents.emit();
      showSnackbar({ message: t('statistics:quickMatch.saved', { opponent: validation.payload.opponent }) });
      if (onNextStep) {
        setSavedPayload(validation.payload);
      } else {
        onClose();
      }
    } catch (err) {
      if (autosaveTimer.current) {
        clearTimeout(autosaveTimer.current);
        autosaveTimer.current = null;
      }
      await persistDraft(form);
      Alert.alert(
        t('statistics:quickMatch.saveFailedTitle'),
        `${toUserMessage(err, t('statistics:quickMatch.saveFailed'))}\n\n${t('statistics:quickMatch.draftKept')}`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  const chooseNext = (step: MatchNextStep) => {
    if (!savedPayload) return;
    const payload = savedPayload;
    setSavedPayload(null);
    onClose();
    onNextStep?.(step, payload);
  };

  const lastMatch = previousMatches.length > 0 ? [...previousMatches].sort((a, b) => b.date.localeCompare(a.date))[0] : null;

  if (savedPayload) {
    return (
      <Modal
        visible={visible}
        onClose={handleClose}
        title={t('statistics:quickMatch.nextTitle')}
        footer={
          <Button variant="secondary" onPress={handleClose}>
            {t('statistics:quickMatch.next.later')}
          </Button>
        }
      >
        <View className="gap-3 p-4" testID="match-next-steps">
          <Text color="secondary">{t('statistics:quickMatch.nextBody', { opponent: savedPayload.opponent })}</Text>
          <Button variant="accent" onPress={() => chooseNext('analyze')}>
            {t('statistics:quickMatch.next.analyze')}
          </Button>
          <Button variant="secondary" onPress={() => chooseNext('uploadVideo')}>
            {t('statistics:quickMatch.next.uploadVideo')}
          </Button>
          <Button variant="secondary" onPress={() => chooseNext('addGoal')}>
            {t('statistics:quickMatch.next.addGoal')}
          </Button>
        </View>
      </Modal>
    );
  }

  const footer = (
    <View className="gap-2">
      {savedAt ? (
        <Text variant="caption" color="tertiary" className="text-center" accessibilityLiveRegion="polite">
          {t('statistics:quickMatch.draftSaved', { time: formatTime(savedAt) })}
        </Text>
      ) : null}
      <View className="flex-row flex-wrap gap-3">
        <Button variant="secondary" className="min-w-[120px] flex-1 py-2" onPress={handleClose} disabled={isSaving}>
          {t('common:cancel')}
        </Button>
        <Button
          variant="accent"
          className="min-w-[120px] flex-1 py-2"
          onPress={() => void handleSave()}
          loading={isSaving}
          disabled={!ready}
        >
          {t('statistics:quickMatch.save')}
        </Button>
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      onClose={handleClose}
      title={t('statistics:quickMatch.title')}
      size="fullscreen"
      footer={footer}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        <View className="gap-5">
          {restoredAt ? (
            <View className="gap-2 rounded-lg border border-border bg-surface p-3">
              <Text variant="caption" color="secondary">
                {t('statistics:quickMatch.draftRestored', { time: formatTime(restoredAt) })}
              </Text>
              <Button size="sm" variant="ghost" onPress={handleDiscardDraft}>
                {t('statistics:quickMatch.discardDraft')}
              </Button>
            </View>
          ) : (
            <Text variant="caption" color="secondary">
              {t('statistics:quickMatch.intro')}
            </Text>
          )}

          {lastMatch ? (
            <Button
              size="sm"
              variant="ghost"
              accessibilityHint={t('statistics:quickMatch.repeatHint')}
              onPress={() => {
                const next = repeatLastMatchContext(previousMatches, form);
                if (next) setForm(next);
              }}
            >
              {t('statistics:quickMatch.repeatLast', { opponent: lastMatch.opponent })}
            </Button>
          ) : null}

          <Input
            label={t('statistics:quickMatch.opponent')}
            value={form.opponent}
            onChangeText={(value) => setField('opponent', value)}
            placeholder={t('statistics:quickMatch.opponentPlaceholder')}
            autoCapitalize="words"
            returnKeyType="done"
          />

          <View>
            <FieldLabel>{t('statistics:quickMatch.date')}</FieldLabel>
            <View className="flex-row flex-wrap gap-2">
              <ChoiceChip
                label={t('statistics:quickMatch.today')}
                selected={!customDate && form.date === today}
                onPress={() => {
                  setCustomDate(false);
                  setField('date', today);
                }}
              />
              <ChoiceChip
                label={t('statistics:quickMatch.yesterday')}
                selected={!customDate && form.date === yesterday}
                onPress={() => {
                  setCustomDate(false);
                  setField('date', yesterday);
                }}
              />
              <ChoiceChip
                label={t('statistics:quickMatch.otherDate')}
                selected={customDate}
                onPress={() => setCustomDate(true)}
              />
            </View>
            {customDate ? (
              <Input
                className="mt-2"
                accessibilityLabel={t('statistics:quickMatch.dateInputLabel')}
                hint={t('statistics:quickMatch.dateInputLabel')}
                value={form.date}
                onChangeText={(value) => setField('date', value)}
                placeholder={today}
                keyboardType="numbers-and-punctuation"
              />
            ) : null}
          </View>

          <View>
            <FieldLabel>{t('statistics:quickMatch.competition')}</FieldLabel>
            {competitions.length > 0 ? (
              <View className="mb-2 flex-row flex-wrap gap-2">
                {competitions.map((name) => (
                  <ChoiceChip
                    key={name}
                    label={name}
                    selected={form.competition.trim().toLowerCase() === name.toLowerCase()}
                    onPress={() => setField('competition', name)}
                  />
                ))}
              </View>
            ) : null}
            <Input
              accessibilityLabel={t('statistics:quickMatch.competition')}
              value={form.competition}
              onChangeText={(value) => setField('competition', value)}
              placeholder={t('statistics:quickMatch.competitionPlaceholder')}
            />
          </View>

          <Input
            label={t('statistics:quickMatch.position')}
            value={form.position}
            onChangeText={(value) => setField('position', value)}
            placeholder={t('statistics:quickMatch.positionPlaceholder')}
          />

          <View>
            <FieldLabel>{t('statistics:quickMatch.minutes')}</FieldLabel>
            <View className="mb-2 flex-row flex-wrap gap-2">
              {MINUTE_PRESETS.map((preset) => (
                <ChoiceChip
                  key={preset}
                  label={preset}
                  selected={form.minutes === preset}
                  onPress={() => setField('minutes', preset)}
                />
              ))}
            </View>
            <Input
              accessibilityLabel={t('statistics:quickMatch.minutes')}
              value={form.minutes}
              onChangeText={(value) => setField('minutes', value)}
              keyboardType="number-pad"
              placeholder="90"
            />
          </View>

          <View>
            <FieldLabel>{t('statistics:quickMatch.result')}</FieldLabel>
            <View className="mb-2 flex-row flex-wrap gap-2">
              <ChoiceChip
                label={t('statistics:quickMatch.win')}
                selected={outcome === 'W'}
                onPress={() => setResult(outcome === 'W' ? null : 'W', score)}
              />
              <ChoiceChip
                label={t('statistics:quickMatch.draw')}
                selected={outcome === 'D'}
                onPress={() => setResult(outcome === 'D' ? null : 'D', score)}
              />
              <ChoiceChip
                label={t('statistics:quickMatch.loss')}
                selected={outcome === 'L'}
                onPress={() => setResult(outcome === 'L' ? null : 'L', score)}
              />
            </View>
            <Input
              label={t('statistics:quickMatch.score')}
              value={score}
              onChangeText={(value) => setResult(outcome, value)}
              placeholder={t('statistics:quickMatch.scorePlaceholder')}
              keyboardType="numbers-and-punctuation"
            />
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1">
              <Input
                label={t('statistics:quickMatch.goals')}
                value={form.goals}
                onChangeText={(value) => setField('goals', value)}
                keyboardType="number-pad"
              />
            </View>
            <View className="flex-1">
              <Input
                label={t('statistics:quickMatch.assists')}
                value={form.assists}
                onChangeText={(value) => setField('assists', value)}
                keyboardType="number-pad"
              />
            </View>
          </View>

          <Button
            variant="ghost"
            onPress={() => setShowMoreStats((current) => !current)}
            accessibilityState={{ expanded: showMoreStats }}
          >
            {showMoreStats ? t('statistics:quickMatch.fewerStats') : t('statistics:quickMatch.moreStats')}
          </Button>

          {showMoreStats ? (
            <View className="gap-4 border-t border-border pt-4">
              <Text variant="caption" color="secondary">
                {t('statistics:quickMatch.notRecordedHint')}
              </Text>
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Input
                    label={t('statistics:quickMatch.passAccuracy')}
                    value={form.passAccuracy}
                    onChangeText={(value) => setField('passAccuracy', value)}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View className="flex-1">
                  <Input
                    label={t('statistics:quickMatch.matchRating')}
                    value={form.matchRating}
                    onChangeText={(value) => setField('matchRating', value)}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Input
                    label={t('statistics:quickMatch.shots')}
                    value={form.shots}
                    onChangeText={(value) => setField('shots', value)}
                    keyboardType="number-pad"
                  />
                </View>
                <View className="flex-1">
                  <Input
                    label={t('statistics:quickMatch.tackles')}
                    value={form.tackles}
                    onChangeText={(value) => setField('tackles', value)}
                    keyboardType="number-pad"
                  />
                </View>
              </View>
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Input
                    label={t('statistics:quickMatch.yellowCards')}
                    value={form.yellowCards}
                    onChangeText={(value) => setField('yellowCards', value)}
                    keyboardType="number-pad"
                  />
                </View>
                <View className="flex-1">
                  <Input
                    label={t('statistics:quickMatch.redCards')}
                    value={form.redCards}
                    onChangeText={(value) => setField('redCards', value)}
                    keyboardType="number-pad"
                  />
                </View>
              </View>
              <View>
                <FieldLabel>{t('statistics:quickMatch.cleanSheet')}</FieldLabel>
                <View className="flex-row flex-wrap gap-2">
                  <ChoiceChip
                    label={t('common:yes')}
                    selected={form.cleanSheet}
                    onPress={() => setField('cleanSheet', true)}
                  />
                  <ChoiceChip
                    label={t('common:no')}
                    selected={!form.cleanSheet}
                    onPress={() => setField('cleanSheet', false)}
                  />
                </View>
              </View>
              <Input
                label={t('statistics:quickMatch.notes')}
                value={form.notes}
                onChangeText={(value) => setField('notes', value)}
                placeholder={t('statistics:quickMatch.notesPlaceholder')}
                multiline
                numberOfLines={4}
                inputClassName="min-h-[100px] text-top"
              />
            </View>
          ) : null}
        </View>
      </ScrollView>
    </Modal>
  );
}

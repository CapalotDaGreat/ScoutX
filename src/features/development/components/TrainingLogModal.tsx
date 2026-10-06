import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/primitives/Button';
import { ChoiceChip } from '@/components/primitives/ChoiceChip';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import { validateTrainingDraft } from '@/features/development/models/DevelopmentModels';
import {
  TRAINING_SESSION_TYPES,
  type GoalProgressSummary,
  type TrainingSessionDraft,
  type TrainingSessionType,
} from '@/features/development/types';
import { todayIsoDate } from '@/features/player-statistics/models/MatchLogModel';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { toUserMessage } from '@/utils/userFacingError';

export type TrainingLogModalProps = {
  visible: boolean;
  saving?: boolean;
  goals: GoalProgressSummary[];
  presetType?: TrainingSessionType;
  onClose: () => void;
  onSave: (draft: TrainingSessionDraft) => Promise<unknown>;
};

type Translate = ReturnType<typeof useAppTranslation>['t'];

function typeLabel(t: Translate, type: TrainingSessionType): string {
  switch (type) {
    case 'team':
      return t('development:training.types.team');
    case 'individual':
      return t('development:training.types.individual');
    case 'gym':
      return t('development:training.types.gym');
    case 'recovery':
      return t('development:training.types.recovery');
    case 'match_prep':
      return t('development:training.types.match_prep');
    case 'other':
      return t('development:training.types.other');
  }
}

function emptyDraft(presetType?: TrainingSessionType): TrainingSessionDraft {
  return {
    type: presetType ?? 'individual',
    date: todayIsoDate(),
    durationMin: null,
    focus: '',
    goalIds: [],
    notes: '',
    reflection: null,
  };
}

export function TrainingLogModal({ visible, saving, goals, presetType, onClose, onSave }: TrainingLogModalProps) {
  const { t } = useAppTranslation(['development', 'common', 'errors']);
  const [draft, setDraft] = useState<TrainingSessionDraft>(() => emptyDraft(presetType));
  const [durationText, setDurationText] = useState('');
  const [wentWell, setWentWell] = useState('');
  const [improve, setImprove] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setDraft(emptyDraft(presetType));
    setDurationText('');
    setWentWell('');
    setImprove('');
    setError(null);
  }, [visible, presetType]);

  const footer = useMemo(
    () => (
      <View className="flex-row gap-3">
        <Button variant="secondary" className="flex-1" onPress={onClose} disabled={saving}>
          {t('common:cancel')}
        </Button>
        <Button
          className="flex-1"
          loading={saving}
          onPress={() => {
            const duration = durationText.trim() ? Number(durationText) : null;
            const next: TrainingSessionDraft = {
              ...draft,
              durationMin: duration !== null && Number.isFinite(duration) ? duration : draft.durationMin,
              reflection:
                wentWell.trim() || improve.trim()
                  ? { wentWell: wentWell.trim(), improve: improve.trim() }
                  : null,
            };
            const problem = validateTrainingDraft(next);
            if (problem) {
              setError(
                problem === 'invalid_date'
                  ? t('development:training.errors.invalidDate')
                  : problem === 'invalid_duration'
                    ? t('development:training.errors.invalidDuration')
                    : t('development:training.errors.focusRequired'),
              );
              return;
            }
            setError(null);
            void onSave(next)
              .then(() => {
                onClose();
              })
              .catch((caught: unknown) => setError(toUserMessage(caught, t('errors:generic'))));
          }}
        >
          {t('development:training.save')}
        </Button>
      </View>
    ),
    [draft, durationText, improve, onClose, onSave, saving, t, wentWell],
  );

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title={t('development:training.newTitle')}
      size="sheet"
      footer={footer}
    >
      <ScrollView className="px-5 py-4" keyboardShouldPersistTaps="handled">
        <View className="gap-4">
          <View>
            <Text variant="label" className="mb-2">
              {t('development:training.typeLabel')}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {TRAINING_SESSION_TYPES.map((type) => (
                <ChoiceChip
                  key={type}
                  label={typeLabel(t, type)}
                  selected={draft.type === type}
                  onPress={() => setDraft((current) => ({ ...current, type }))}
                />
              ))}
            </View>
          </View>

          <Input
            label={t('development:training.dateLabel')}
            value={draft.date}
            onChangeText={(date) => setDraft((current) => ({ ...current, date }))}
            placeholder="YYYY-MM-DD"
            keyboardType="numbers-and-punctuation"
          />

          <Input
            label={t('development:training.durationLabel')}
            value={durationText}
            onChangeText={setDurationText}
            keyboardType="number-pad"
            placeholder="60"
            hint={t('development:training.durationHint')}
          />

          <Input
            label={t('development:training.focusLabel')}
            value={draft.focus}
            onChangeText={(focus) => setDraft((current) => ({ ...current, focus }))}
            placeholder={t('development:training.focusPlaceholder')}
          />

          {goals.length > 0 ? (
            <View>
              <Text variant="label" className="mb-2">
                {t('development:training.goalsLabel')}
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {goals.map((summary) => (
                  <ChoiceChip
                    key={summary.goal.id}
                    label={summary.goal.title}
                    selected={draft.goalIds.includes(summary.goal.id)}
                    onPress={() =>
                      setDraft((current) => ({
                        ...current,
                        goalIds: current.goalIds.includes(summary.goal.id)
                          ? current.goalIds.filter((id) => id !== summary.goal.id)
                          : [...current.goalIds, summary.goal.id],
                      }))
                    }
                  />
                ))}
              </View>
            </View>
          ) : null}

          <Input
            label={t('development:training.notesLabel')}
            value={draft.notes}
            onChangeText={(notes) => setDraft((current) => ({ ...current, notes }))}
            placeholder={t('development:training.notesPlaceholder')}
            multiline
            numberOfLines={3}
            inputClassName="min-h-[80px] text-top"
          />

          <Input
            label={t('development:training.wentWell')}
            value={wentWell}
            onChangeText={setWentWell}
            placeholder={t('development:training.wentWellPlaceholder')}
          />
          <Input
            label={t('development:training.improve')}
            value={improve}
            onChangeText={setImprove}
            placeholder={t('development:training.improvePlaceholder')}
          />

          {error ? (
            <Text color="error" variant="caption">
              {error}
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </Modal>
  );
}

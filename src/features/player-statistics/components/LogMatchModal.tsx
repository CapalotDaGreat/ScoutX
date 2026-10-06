import { useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/primitives/Button';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import {
  defaultMatchLogFormState,
  type MatchLogFormState,
  validateMatchLogForm,
} from '@/features/player-statistics/models/MatchLogModel';
import { type MatchLogPayload } from '@/features/player-statistics/types';
import { toUserMessage } from '@/utils/userFacingError';

export type LogMatchModalProps = {
  visible: boolean;
  saving?: boolean;
  onClose: () => void;
  onSave: (payload: MatchLogPayload) => Promise<unknown>;
};

function updateField<Key extends keyof MatchLogFormState>(
  state: MatchLogFormState,
  key: Key,
  value: MatchLogFormState[Key],
): MatchLogFormState {
  return {
    ...state,
    [key]: value,
  };
}

export function LogMatchModal({
  visible,
  saving = false,
  onClose,
  onSave,
}: LogMatchModalProps) {
  const [form, setForm] = useState<MatchLogFormState>(defaultMatchLogFormState);
  const [submitting, setSubmitting] = useState(false);
  const isSaving = saving || submitting;

  useEffect(() => {
    if (visible) {
      setForm(defaultMatchLogFormState);
    }
  }, [visible]);

  const setField = <Key extends keyof MatchLogFormState>(
    key: Key,
    value: MatchLogFormState[Key],
  ) => {
    setForm((current) => updateField(current, key, value));
  };

  const handleSave = async () => {
    const validation = validateMatchLogForm(form);

    if (!validation.valid) {
      Alert.alert('Validation Error', validation.message);
      return;
    }

    setSubmitting(true);
    try {
      await onSave(validation.payload);
      onClose();
    } catch (err) {
      Alert.alert('Error', toUserMessage(err, 'Failed to save match.'));
    } finally {
      setSubmitting(false);
    }
  };

  const footer = (
    <View className="flex-row gap-3">
      <Button variant="secondary" className="flex-1" onPress={onClose} disabled={isSaving}>
        Cancel
      </Button>
      <Button variant="accent" className="flex-1" onPress={() => void handleSave()} loading={isSaving}>
        Save Match
      </Button>
    </View>
  );

  return (
    <Modal visible={visible} onClose={onClose} title="Log Match" size="fullscreen" footer={footer}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        <View className="gap-4">
          <Input
            label="Opponent"
            value={form.opponent}
            onChangeText={(value) => setField('opponent', value)}
            placeholder="Rivergate United"
          />
          <Input
            label="Competition"
            value={form.competition}
            onChangeText={(value) => setField('competition', value)}
            placeholder="League"
          />
          <Input
            label="Match Date"
            value={form.date}
            onChangeText={(value) => setField('date', value)}
            placeholder="2026-07-02"
          />
          <Input
            label="Result"
            value={form.result}
            onChangeText={(value) => setField('result', value)}
            placeholder="W 2-1"
          />
          <Input
            label="Minutes Played"
            value={form.minutes}
            onChangeText={(value) => setField('minutes', value)}
            keyboardType="number-pad"
          />
          <Input
            label="Match Rating"
            value={form.matchRating}
            onChangeText={(value) => setField('matchRating', value)}
            keyboardType="decimal-pad"
          />
          <Input
            label="Goals"
            value={form.goals}
            onChangeText={(value) => setField('goals', value)}
            keyboardType="number-pad"
          />
          <Input
            label="Assists"
            value={form.assists}
            onChangeText={(value) => setField('assists', value)}
            keyboardType="number-pad"
          />
          <Input
            label="Shots"
            value={form.shots}
            onChangeText={(value) => setField('shots', value)}
            keyboardType="number-pad"
          />
          <Input
            label="Pass Accuracy"
            value={form.passAccuracy}
            onChangeText={(value) => setField('passAccuracy', value)}
            keyboardType="decimal-pad"
            rightIcon={<Text variant="caption">%</Text>}
          />
          <Input
            label="Tackles"
            value={form.tackles}
            onChangeText={(value) => setField('tackles', value)}
            keyboardType="number-pad"
          />
          <View>
            <Text variant="label" className="mb-1">
              Clean Sheet
            </Text>
            <View className="flex-row gap-2">
              <Button
                variant={form.cleanSheet ? 'accent' : 'secondary'}
                className="flex-1"
                onPress={() => setField('cleanSheet', true)}
              >
                Yes
              </Button>
              <Button
                variant={!form.cleanSheet ? 'accent' : 'secondary'}
                className="flex-1"
                onPress={() => setField('cleanSheet', false)}
              >
                No
              </Button>
            </View>
          </View>
          <Input
            label="Yellow Cards"
            value={form.yellowCards}
            onChangeText={(value) => setField('yellowCards', value)}
            keyboardType="number-pad"
          />
          <Input
            label="Red Cards"
            value={form.redCards}
            onChangeText={(value) => setField('redCards', value)}
            keyboardType="number-pad"
          />
          <Input
            label="Notes"
            value={form.notes}
            onChangeText={(value) => setField('notes', value)}
            placeholder="Add scouting notes, tactical context or fitness observations..."
            multiline
            numberOfLines={4}
            inputClassName="min-h-[100px] text-top"
          />
        </View>
      </ScrollView>
    </Modal>
  );
}

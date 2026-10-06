import { useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/primitives/Button';
import { Dropdown } from '@/components/primitives/Dropdown';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import { ReportRatingField } from '@/features/scouting-reports/components/ReportRatingField';
import {
  FORMATION_OPTIONS,
  PLAYING_STYLE_OPTIONS,
} from '@/features/scouting-reports/constants';
import {
  formatMultilineList,
  parseMultilineList,
  scoutingReportToDraft,
} from '@/features/scouting-reports/models/ScoutingReportModel';
import {
  type ScoutingReport,
  type ScoutingReportDraft,
  createEmptyScoutingReportDraft,
} from '@/features/scouting-reports/types';
import { toUserMessage } from '@/utils/userFacingError';

export type ScoutingReportEditorModalProps = {
  visible: boolean;
  playerName: string;
  report?: ScoutingReport | null;
  saving?: boolean;
  onClose: () => void;
  onSave: (draft: ScoutingReportDraft) => Promise<void>;
  onDelete?: (reportId: string) => Promise<void>;
};

export function ScoutingReportEditorModal({
  visible,
  playerName,
  report,
  saving = false,
  onClose,
  onSave,
  onDelete,
}: ScoutingReportEditorModalProps) {
  const [draft, setDraft] = useState<ScoutingReportDraft>(createEmptyScoutingReportDraft(playerName));
  const [strengthsText, setStrengthsText] = useState('');
  const [weaknessesText, setWeaknessesText] = useState('');

  useEffect(() => {
    if (!visible) {
      return;
    }

    if (report) {
      const nextDraft = scoutingReportToDraft(report);
      setDraft(nextDraft);
      setStrengthsText(formatMultilineList(nextDraft.strengths));
      setWeaknessesText(formatMultilineList(nextDraft.weaknesses));
      return;
    }

    const empty = createEmptyScoutingReportDraft(playerName);
    setDraft(empty);
    setStrengthsText('');
    setWeaknessesText('');
  }, [playerName, report, visible]);

  const updateRating = (key: keyof ScoutingReportDraft['ratings'], value: number | null) => {
    setDraft((current) => ({
      ...current,
      ratings: { ...current.ratings, [key]: value },
    }));
  };

  const handleSave = async () => {
    const payload: ScoutingReportDraft = {
      ...draft,
      strengths: parseMultilineList(strengthsText),
      weaknesses: parseMultilineList(weaknessesText),
    };

    if (payload.strengths.length === 0) {
      Alert.alert('Validation', 'Add at least one strength.');
      return;
    }

    try {
      await onSave(payload);
      onClose();
    } catch (error) {
      Alert.alert('Error', toUserMessage(error, 'Could not save report.'));
    }
  };

  const handleDelete = () => {
    if (!report || !onDelete) {
      return;
    }

    Alert.alert('Delete Report', 'This scouting report will be permanently removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void onDelete(report.id)
            .then(onClose)
            .catch((error: unknown) => {
              Alert.alert('Error', toUserMessage(error, 'Could not delete report.'));
            });
        },
      },
    ]);
  };

  const footer = (
    <View className="gap-3">
      {report && onDelete ? (
        <Button variant="destructive" onPress={handleDelete} disabled={saving}>
          Delete Report
        </Button>
      ) : null}
      <View className="flex-row gap-3">
        <Button variant="secondary" className="flex-1" onPress={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="accent" className="flex-1" onPress={() => void handleSave()} loading={saving}>
          Save Report
        </Button>
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title={report ? 'Edit Scouting Report' : 'New Scouting Report'}
      size="sheet"
      footer={footer}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-4">
          <Text variant="body-sm" color="secondary">
            Evaluating {playerName}
          </Text>

          <Text variant="label" color="secondary">
            Headline Ratings
          </Text>
          <View className="flex-row gap-3">
            <ReportRatingField
              label="Overall Rating"
              value={draft.ratings.overall}
              onChange={(value) => updateRating('overall', value)}
              emphasis
              className="flex-1"
            />
            <ReportRatingField
              label="Potential Rating"
              value={draft.ratings.potential}
              onChange={(value) => updateRating('potential', value)}
              emphasis
              className="flex-1"
            />
          </View>

          <Text variant="label" color="secondary">
            Ability Profile
          </Text>
          <View className="flex-row flex-wrap gap-3">
            <ReportRatingField
              label="Technical"
              value={draft.ratings.technicalAbility}
              onChange={(value) => updateRating('technicalAbility', value)}
              className="min-w-[47%] flex-1"
            />
            <ReportRatingField
              label="Tactical"
              value={draft.ratings.tacticalIntelligence}
              onChange={(value) => updateRating('tacticalIntelligence', value)}
              className="min-w-[47%] flex-1"
            />
            <ReportRatingField
              label="Physical"
              value={draft.ratings.physicalAbility}
              onChange={(value) => updateRating('physicalAbility', value)}
              className="min-w-[47%] flex-1"
            />
            <ReportRatingField
              label="Mentality"
              value={draft.ratings.mentality}
              onChange={(value) => updateRating('mentality', value)}
              className="min-w-[47%] flex-1"
            />
          </View>

          <Input
            label="Strengths"
            value={strengthsText}
            onChangeText={setStrengthsText}
            placeholder="One strength per line"
            multiline
            numberOfLines={4}
            inputClassName="min-h-[90px] text-top"
            hint="Line-separated list"
          />
          <Input
            label="Weaknesses"
            value={weaknessesText}
            onChangeText={setWeaknessesText}
            placeholder="One weakness per line"
            multiline
            numberOfLines={3}
            inputClassName="min-h-[70px] text-top"
          />
          <Input
            label="Recommendations"
            value={draft.recommendations}
            onChangeText={(value) => setDraft((current) => ({ ...current, recommendations: value }))}
            placeholder="Trial recommendation, follow-up timeline, club fit..."
            multiline
            numberOfLines={3}
            inputClassName="min-h-[70px] text-top"
          />
          <Dropdown
            label="Suitable Playing Style"
            value={draft.suitablePlayingStyle}
            onChange={(value) =>
              setDraft((current) => ({ ...current, suitablePlayingStyle: value }))
            }
            options={PLAYING_STYLE_OPTIONS.map((option) => ({ label: option, value: option }))}
          />
          <Dropdown
            label="Suggested Formation"
            value={draft.suggestedFormation}
            onChange={(value) =>
              setDraft((current) => ({ ...current, suggestedFormation: value }))
            }
            options={FORMATION_OPTIONS.map((option) => ({ label: option, value: option }))}
          />
          <Input
            label="Scout Notes"
            value={draft.scoutNotes}
            onChangeText={(value) => setDraft((current) => ({ ...current, scoutNotes: value }))}
            placeholder="Detailed observations, context, and match-specific notes..."
            multiline
            numberOfLines={5}
            inputClassName="min-h-[110px] text-top"
          />
        </View>
      </ScrollView>
    </Modal>
  );
}

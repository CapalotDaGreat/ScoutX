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
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
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
  const { t } = useAppTranslation(['scout', 'common', 'errors']);
  const [draft, setDraft] = useState<ScoutingReportDraft>(createEmptyScoutingReportDraft(playerName));
  const [strengthsText, setStrengthsText] = useState('');
  const [weaknessesText, setWeaknessesText] = useState('');
  const [concernsText, setConcernsText] = useState('');

  useEffect(() => {
    if (!visible) {
      return;
    }

    if (report) {
      const nextDraft = scoutingReportToDraft(report);
      setDraft(nextDraft);
      setStrengthsText(formatMultilineList(nextDraft.strengths));
      setWeaknessesText(formatMultilineList(nextDraft.weaknesses));
      setConcernsText(formatMultilineList(nextDraft.concerns));
      return;
    }

    const empty = createEmptyScoutingReportDraft(playerName);
    setDraft(empty);
    setStrengthsText('');
    setWeaknessesText('');
    setConcernsText('');
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
      concerns: parseMultilineList(concernsText),
    };

    if (payload.strengths.length === 0) {
      Alert.alert(t('reports.editor.validationTitle'), t('reports.editor.strengthRequired'));
      return;
    }

    try {
      await onSave(payload);
      onClose();
    } catch (error) {
      Alert.alert(t('common:errorTitle'), toUserMessage(error, t('reports.editor.saveFailed')));
    }
  };

  const handleDelete = () => {
    if (!report || !onDelete) {
      return;
    }

    Alert.alert(t('reports.editor.deleteTitle'), t('reports.editor.deleteMessage'), [
      { text: t('common:cancel'), style: 'cancel' },
      {
        text: t('common:delete'),
        style: 'destructive',
        onPress: () => {
          void onDelete(report.id)
            .then(onClose)
            .catch((error: unknown) => {
              Alert.alert(t('common:errorTitle'), toUserMessage(error, t('reports.editor.deleteFailed')));
            });
        },
      },
    ]);
  };

  const footer = (
    <View className="gap-3">
      {report && onDelete ? (
        <Button variant="destructive" onPress={handleDelete} disabled={saving}>
          {t('reports.editor.deleteReport')}
        </Button>
      ) : null}
      <View className="flex-row gap-3">
        <Button variant="secondary" className="flex-1" onPress={onClose} disabled={saving}>
          {t('common:cancel')}
        </Button>
        <Button variant="accent" className="flex-1" onPress={() => void handleSave()} loading={saving}>
          {t('reports.editor.saveReport')}
        </Button>
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title={report ? t('reports.editor.editTitle') : t('reports.editor.newTitle')}
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
            {t('reports.editor.evaluating', { playerName })}
          </Text>

          <Text variant="label" color="secondary">
            {t('reports.editor.headlineRatings')}
          </Text>
          <View className="flex-row gap-3">
            <ReportRatingField
              label={t('reports.editor.overallRating')}
              value={draft.ratings.overall}
              onChange={(value) => updateRating('overall', value)}
              emphasis
              className="flex-1"
            />
            <ReportRatingField
              label={t('reports.editor.potentialRating')}
              value={draft.ratings.potential}
              onChange={(value) => updateRating('potential', value)}
              emphasis
              className="flex-1"
            />
          </View>

          <Text variant="label" color="secondary">
            {t('reports.editor.abilityProfile')}
          </Text>
          <View className="flex-row flex-wrap gap-3">
            <ReportRatingField
              label={t('reports.editor.technical')}
              value={draft.ratings.technicalAbility}
              onChange={(value) => updateRating('technicalAbility', value)}
              className="min-w-[47%] flex-1"
            />
            <ReportRatingField
              label={t('reports.editor.tactical')}
              value={draft.ratings.tacticalIntelligence}
              onChange={(value) => updateRating('tacticalIntelligence', value)}
              className="min-w-[47%] flex-1"
            />
            <ReportRatingField
              label={t('reports.editor.physical')}
              value={draft.ratings.physicalAbility}
              onChange={(value) => updateRating('physicalAbility', value)}
              className="min-w-[47%] flex-1"
            />
            <ReportRatingField
              label={t('reports.editor.mentality')}
              value={draft.ratings.mentality}
              onChange={(value) => updateRating('mentality', value)}
              className="min-w-[47%] flex-1"
            />
          </View>

          <Input
            label={t('reports.editor.strengths')}
            value={strengthsText}
            onChangeText={setStrengthsText}
            placeholder={t('reports.editor.strengthsPlaceholder')}
            multiline
            numberOfLines={4}
            inputClassName="min-h-[90px] text-top"
            hint={t('reports.editor.strengthsHint')}
          />
          <Input
            label={t('reports.editor.weaknesses')}
            value={weaknessesText}
            onChangeText={setWeaknessesText}
            placeholder={t('reports.editor.weaknessesPlaceholder')}
            multiline
            numberOfLines={3}
            inputClassName="min-h-[70px] text-top"
          />
          <Input
            label={t('reports.editor.concerns')}
            value={concernsText}
            onChangeText={setConcernsText}
            placeholder={t('reports.editor.concernsPlaceholder')}
            multiline
            numberOfLines={3}
            inputClassName="min-h-[70px] text-top"
          />
          <Input
            label={t('reports.editor.roleFit')}
            value={draft.roleFit}
            onChangeText={(value) => setDraft((current) => ({ ...current, roleFit: value }))}
            placeholder={t('reports.editor.roleFitPlaceholder')}
          />
          <Dropdown
            label={t('reports.editor.recommendation')}
            value={draft.recommendation ?? 'insufficient_evidence'}
            onChange={(value) =>
              setDraft((current) => ({
                ...current,
                recommendation: value as ScoutingReportDraft['recommendation'],
              }))
            }
            options={[
              { label: t('intelligence.recommendation.insufficient_evidence'), value: 'insufficient_evidence' },
              { label: t('intelligence.recommendation.monitor'), value: 'monitor' },
              { label: t('intelligence.recommendation.invite'), value: 'invite' },
              { label: t('intelligence.recommendation.trial'), value: 'trial' },
              { label: t('intelligence.recommendation.pass'), value: 'pass' },
            ]}
          />
          <Dropdown
            label={t('reports.editor.playingStyle')}
            value={draft.suitablePlayingStyle}
            onChange={(value) =>
              setDraft((current) => ({ ...current, suitablePlayingStyle: value }))
            }
            options={PLAYING_STYLE_OPTIONS.map((option) => ({ label: option, value: option }))}
          />
          <Dropdown
            label={t('reports.editor.formation')}
            value={draft.suggestedFormation}
            onChange={(value) =>
              setDraft((current) => ({ ...current, suggestedFormation: value }))
            }
            options={FORMATION_OPTIONS.map((option) => ({ label: option, value: option }))}
          />
          <Input
            label={t('reports.editor.scoutNotes')}
            value={draft.scoutNotes}
            onChangeText={(value) => setDraft((current) => ({ ...current, scoutNotes: value }))}
            placeholder={t('reports.editor.scoutNotesPlaceholder')}
            multiline
            numberOfLines={5}
            inputClassName="min-h-[110px] text-top"
          />
        </View>
      </ScrollView>
    </Modal>
  );
}

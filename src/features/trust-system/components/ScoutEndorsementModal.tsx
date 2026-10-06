import { useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/primitives/Button';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import { parseMultilineList } from '@/features/scouting-reports/models/ScoutingReportModel';
import { type TrustRecommendation, type TrustRecommendationDraft } from '@/features/trust-system/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type ScoutEndorsementModalProps = {
  visible: boolean;
  playerName: string;
  endorsement?: TrustRecommendation | null;
  saving?: boolean;
  onClose: () => void;
  onSave: (draft: TrustRecommendationDraft) => Promise<void>;
  onDelete?: (recommendationId: string) => Promise<void>;
};

function createEmptyDraft(): TrustRecommendationDraft {
  return {
    type: 'scout_endorsement',
    relationship: '',
    headline: '',
    body: '',
    skills: [],
    yearsKnown: null,
    featured: false,
    authorTitle: 'Talent Scout',
    authorOrganization: 'ScoutX Network',
  };
}

export function ScoutEndorsementModal({
  visible,
  playerName,
  endorsement,
  saving = false,
  onClose,
  onSave,
  onDelete,
}: ScoutEndorsementModalProps) {
  const { t } = useAppTranslation(['trust', 'common']);
  const [relationship, setRelationship] = useState('');
  const [headline, setHeadline] = useState('');
  const [body, setBody] = useState('');
  const [skillsText, setSkillsText] = useState('');
  const [authorTitle, setAuthorTitle] = useState('Talent Scout');
  const [authorOrganization, setAuthorOrganization] = useState('ScoutX Network');
  const [yearsKnown, setYearsKnown] = useState('');

  useEffect(() => {
    if (!visible) {
      return;
    }

    if (endorsement) {
      setRelationship(endorsement.relationship);
      setHeadline(endorsement.headline);
      setBody(endorsement.body);
      setSkillsText(endorsement.skills.join('\n'));
      setAuthorTitle(endorsement.authorTitle);
      setAuthorOrganization(endorsement.authorOrganization);
      setYearsKnown(endorsement.yearsKnown ? String(endorsement.yearsKnown) : '');
      return;
    }

    const empty = createEmptyDraft();
    setRelationship('');
    setHeadline('');
    setBody('');
    setSkillsText('');
    setAuthorTitle(empty.authorTitle);
    setAuthorOrganization(empty.authorOrganization);
    setYearsKnown('');
  }, [endorsement, visible]);

  const handleSave = async () => {
    if (!relationship.trim() || !body.trim()) {
      Alert.alert(t('endorsement.missingTitle'), t('endorsement.missingMessage'));
      return;
    }

    const parsedYears = yearsKnown.trim() ? Number(yearsKnown) : null;
    const draft: TrustRecommendationDraft = {
      type: 'scout_endorsement',
      relationship: relationship.trim(),
      headline: headline.trim(),
      body: body.trim(),
      skills: parseMultilineList(skillsText),
      yearsKnown: Number.isFinite(parsedYears) ? parsedYears : null,
      featured: endorsement?.featured ?? false,
      authorTitle: authorTitle.trim(),
      authorOrganization: authorOrganization.trim(),
    };

    await onSave(draft);
    onClose();
  };

  const handleDelete = () => {
    if (!endorsement || !onDelete) {
      return;
    }

    Alert.alert(t('endorsement.removeTitle'), t('endorsement.removeMessage'), [
      { text: t('common:cancel'), style: 'cancel' },
      {
        text: t('common:remove'),
        style: 'destructive',
        onPress: () => {
          void onDelete(endorsement.id).then(onClose);
        },
      },
    ]);
  };

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title={endorsement ? t('endorsement.editTitle') : t('endorsement.addTitle')}
    >
      <ScrollView className="max-h-[70vh]" keyboardShouldPersistTaps="handled">
        <View className="gap-4 pb-4">
          <Text variant="body-sm" color="secondary">
            {t('endorsement.forPlayer', { playerName })}
          </Text>
          <Input
            label={t('endorsement.yourTitle')}
            value={authorTitle}
            onChangeText={setAuthorTitle}
            placeholder={t('endorsement.yourTitlePlaceholder')}
          />
          <Input
            label={t('endorsement.organization')}
            value={authorOrganization}
            onChangeText={setAuthorOrganization}
            placeholder={t('endorsement.organizationPlaceholder')}
          />
          <Input
            label={t('endorsement.relationship')}
            value={relationship}
            onChangeText={setRelationship}
            placeholder={t('endorsement.relationshipPlaceholder')}
          />
          <Input
            label={t('endorsement.headline')}
            value={headline}
            onChangeText={setHeadline}
            placeholder={t('endorsement.headlinePlaceholder')}
          />
          <Input
            label={t('endorsement.body')}
            value={body}
            onChangeText={setBody}
            placeholder={t('endorsement.bodyPlaceholder')}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            className="min-h-[120px]"
          />
          <Input
            label={t('endorsement.skills')}
            value={skillsText}
            onChangeText={setSkillsText}
            placeholder={'Progressive passing\nPress resistance'}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            className="min-h-[96px]"
          />
          <Input
            label={t('endorsement.yearsKnown')}
            value={yearsKnown}
            onChangeText={setYearsKnown}
            keyboardType="number-pad"
            placeholder="2"
          />

          <View className="flex-row gap-2">
            {endorsement && onDelete ? (
              <Button variant="ghost" onPress={handleDelete} disabled={saving} className="flex-1">
                {t('common:remove')}
              </Button>
            ) : null}
            <Button variant="secondary" onPress={onClose} disabled={saving} className="flex-1">
              {t('common:cancel')}
            </Button>
            <Button variant="accent" onPress={() => void handleSave()} loading={saving} className="flex-1">
              {t('common:save')}
            </Button>
          </View>

          <Text variant="caption" color="secondary">
            {t('endorsement.footerNote')}
          </Text>
        </View>
      </ScrollView>
    </Modal>
  );
}

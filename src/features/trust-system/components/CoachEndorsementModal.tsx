import { useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/primitives/Button';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import { ENDORSEMENT_CATEGORIES } from '@/features/public-portfolio/constants';
import { type TrustRecommendation, type TrustRecommendationDraft } from '@/features/trust-system/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type CoachEndorsementModalProps = {
  visible: boolean;
  playerName: string;
  endorsement?: TrustRecommendation | null;
  saving?: boolean;
  onClose: () => void;
  onSave: (draft: TrustRecommendationDraft) => Promise<void>;
};

function createCoachDraft(category: string): TrustRecommendationDraft {
  return {
    type: 'coach_recommendation',
    category,
    relationship: '',
    headline: '',
    body: '',
    skills: [category],
    yearsKnown: null,
    featured: true,
    authorTitle: '',
    authorOrganization: '',
  };
}

export function CoachEndorsementModal({
  visible,
  playerName,
  endorsement,
  saving = false,
  onClose,
  onSave,
}: CoachEndorsementModalProps) {
  const { t } = useAppTranslation(['trust', 'common']);
  const [category, setCategory] = useState<string>(ENDORSEMENT_CATEGORIES[0]);
  const [relationship, setRelationship] = useState('');
  const [headline, setHeadline] = useState('');
  const [body, setBody] = useState('');
  const [authorTitle, setAuthorTitle] = useState('');
  const [authorOrganization, setAuthorOrganization] = useState('');
  const [yearsKnown, setYearsKnown] = useState('');

  useEffect(() => {
    if (!visible) {
      return;
    }

    if (endorsement) {
      setCategory(endorsement.category ?? ENDORSEMENT_CATEGORIES[0]);
      setRelationship(endorsement.relationship);
      setHeadline(endorsement.headline);
      setBody(endorsement.body);
      setAuthorTitle(endorsement.authorTitle);
      setAuthorOrganization(endorsement.authorOrganization);
      setYearsKnown(endorsement.yearsKnown ? String(endorsement.yearsKnown) : '');
      return;
    }

    const empty = createCoachDraft(ENDORSEMENT_CATEGORIES[0]);
    setCategory(empty.category ?? ENDORSEMENT_CATEGORIES[0]);
    setRelationship('');
    setHeadline('');
    setBody('');
    setAuthorTitle(empty.authorTitle);
    setAuthorOrganization('');
    setYearsKnown('');
  }, [endorsement, visible]);

  const handleSave = async () => {
    if (!relationship.trim() || !body.trim() || !authorOrganization.trim()) {
      Alert.alert(t('endorsement.missingTitle'), t('coachEndorsement.missingMessage'));
      return;
    }

    await onSave({
      type: 'coach_recommendation',
      category,
      relationship: relationship.trim(),
      headline: headline.trim(),
      body: body.trim(),
      skills: [category],
      yearsKnown: yearsKnown ? Number(yearsKnown) : null,
      featured: true,
      authorTitle: authorTitle.trim(),
      authorOrganization: authorOrganization.trim(),
    });
    onClose();
  };

  return (
    <Modal visible={visible} onClose={onClose} title={t('coachEndorsement.title')} size="lg">
      <ScrollView contentContainerClassName="gap-4 pb-4">
        <Text variant="body-sm" color="secondary">
          {t('coachEndorsement.intro', { playerName })}
        </Text>

        <View className="flex-row flex-wrap gap-2">
          {ENDORSEMENT_CATEGORIES.map((item) => (
            <Button
              key={item}
              variant={category === item ? 'accent' : 'secondary'}
              size="sm"
              accessibilityState={{ selected: category === item }}
              onPress={() => setCategory(item)}
            >
              {t(`category.${item}`)}
            </Button>
          ))}
        </View>

        <Input
          label={t('coachEndorsement.role')}
          value={authorTitle}
          onChangeText={setAuthorTitle}
          placeholder={t('coachEndorsement.rolePlaceholder')}
        />
        <Input
          label={t('coachEndorsement.organization')}
          value={authorOrganization}
          onChangeText={setAuthorOrganization}
        />
        <Input
          label={t('endorsement.relationship')}
          value={relationship}
          onChangeText={setRelationship}
          placeholder="U17 head coach, 2024–2026"
        />
        <Input
          label={t('coachEndorsement.yearsKnown')}
          value={yearsKnown}
          onChangeText={setYearsKnown}
          keyboardType="number-pad"
        />
        <Input
          label={t('endorsement.headline')}
          value={headline}
          onChangeText={setHeadline}
          placeholder={t('coachEndorsement.headlinePlaceholder')}
        />
        <Input
          label={t('coachEndorsement.body')}
          value={body}
          onChangeText={setBody}
          multiline
          numberOfLines={6}
          placeholder={t('coachEndorsement.bodyPlaceholder')}
        />

        <View className="flex-row gap-2">
          <Button variant="secondary" className="flex-1" onPress={onClose}>
            {t('common:cancel')}
          </Button>
          <Button variant="accent" className="flex-1" loading={saving} onPress={() => void handleSave()}>
            {t('coachEndorsement.publish')}
          </Button>
        </View>
      </ScrollView>
    </Modal>
  );
}

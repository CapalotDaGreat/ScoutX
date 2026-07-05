import { useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/primitives/Button';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import { ENDORSEMENT_CATEGORIES } from '@/features/public-portfolio/constants';
import { type TrustRecommendation, type TrustRecommendationDraft } from '@/features/trust-system/types';

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
    authorTitle: 'Head Coach',
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
  const [category, setCategory] = useState<string>(ENDORSEMENT_CATEGORIES[0]);
  const [relationship, setRelationship] = useState('');
  const [headline, setHeadline] = useState('');
  const [body, setBody] = useState('');
  const [authorTitle, setAuthorTitle] = useState('Head Coach');
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
      Alert.alert('Missing fields', 'Club, relationship context, and recommendation text are required.');
      return;
    }

    await onSave({
      type: 'coach_recommendation',
      category,
      relationship: relationship.trim(),
      headline: headline.trim() || `${category} endorsement`,
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
    <Modal visible={visible} onClose={onClose} title="Coach endorsement" size="lg">
      <ScrollView contentContainerClassName="gap-4 pb-4">
        <Text variant="body-sm" color="secondary">
          Write a verified-style recommendation for {playerName}. Players cannot edit your words.
        </Text>

        <View className="flex-row flex-wrap gap-2">
          {ENDORSEMENT_CATEGORIES.map((item) => (
            <Button
              key={item}
              variant={category === item ? 'accent' : 'secondary'}
              size="sm"
              onPress={() => setCategory(item)}
            >
              {item}
            </Button>
          ))}
        </View>

        <Input label="Your role" value={authorTitle} onChangeText={setAuthorTitle} />
        <Input label="Club / academy" value={authorOrganization} onChangeText={setAuthorOrganization} />
        <Input
          label="Relationship context"
          value={relationship}
          onChangeText={setRelationship}
          placeholder="U17 head coach, 2024–2026"
        />
        <Input
          label="Years worked together"
          value={yearsKnown}
          onChangeText={setYearsKnown}
          keyboardType="number-pad"
        />
        <Input label="Headline" value={headline} onChangeText={setHeadline} placeholder="Standout professionalism" />
        <Input
          label="Recommendation"
          value={body}
          onChangeText={setBody}
          multiline
          numberOfLines={6}
          placeholder="Alex consistently demonstrates exceptional tactical awareness..."
        />

        <View className="flex-row gap-2">
          <Button variant="secondary" className="flex-1" onPress={onClose}>
            Cancel
          </Button>
          <Button variant="accent" className="flex-1" loading={saving} onPress={() => void handleSave()}>
            Publish endorsement
          </Button>
        </View>
      </ScrollView>
    </Modal>
  );
}

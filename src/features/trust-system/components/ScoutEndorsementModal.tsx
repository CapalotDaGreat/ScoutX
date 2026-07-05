import { useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/primitives/Button';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import { parseMultilineList } from '@/features/scouting-reports/models/ScoutingReportModel';
import { type TrustRecommendation, type TrustRecommendationDraft } from '@/features/trust-system/types';

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
      Alert.alert('Missing fields', 'Relationship context and endorsement body are required.');
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

    Alert.alert('Remove endorsement', 'This endorsement will be permanently removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
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
      title={endorsement ? 'Edit Scout Endorsement' : 'Add Scout Endorsement'}
    >
      <ScrollView className="max-h-[70vh]" keyboardShouldPersistTaps="handled">
        <View className="gap-4 pb-4">
          <Text variant="body-sm" color="secondary">
            Professional endorsement for {playerName}
          </Text>
          <Input
            label="Your title"
            value={authorTitle}
            onChangeText={setAuthorTitle}
            placeholder="Senior Talent Scout"
          />
          <Input
            label="Organization"
            value={authorOrganization}
            onChangeText={setAuthorOrganization}
            placeholder="ScoutX Network"
          />
          <Input
            label="Relationship context"
            value={relationship}
            onChangeText={setRelationship}
            placeholder="Observed across 8 competitive matches"
          />
          <Input
            label="Headline"
            value={headline}
            onChangeText={setHeadline}
            placeholder="High-ceiling wide forward for top-five league projects"
          />
          <Input
            label="Endorsement"
            value={body}
            onChangeText={setBody}
            placeholder="Share your professional assessment..."
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            className="min-h-[120px]"
          />
          <Input
            label="Highlighted skills (one per line)"
            value={skillsText}
            onChangeText={setSkillsText}
            placeholder={'Progressive passing\nPress resistance'}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            className="min-h-[96px]"
          />
          <Input
            label="Years known (optional)"
            value={yearsKnown}
            onChangeText={setYearsKnown}
            keyboardType="number-pad"
            placeholder="2"
          />

          <View className="flex-row gap-2">
            {endorsement && onDelete ? (
              <Button variant="ghost" onPress={handleDelete} disabled={saving} className="flex-1">
                Remove
              </Button>
            ) : null}
            <Button variant="secondary" onPress={onClose} disabled={saving} className="flex-1">
              Cancel
            </Button>
            <Button variant="accent" onPress={() => void handleSave()} loading={saving} className="flex-1">
              Save
            </Button>
          </View>

          <Text variant="caption" color="secondary">
            Coach recommendations are submitted by verified club staff. Scouts can publish endorsements
            visible on the player trust profile.
          </Text>
        </View>
      </ScrollView>
    </Modal>
  );
}

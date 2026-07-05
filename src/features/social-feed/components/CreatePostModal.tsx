import { useState } from 'react';
import { View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/primitives/Button';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import { useCreatePost } from '@/features/social-feed/hooks/useCreatePost';
import { type SocialPost } from '@/features/social-feed/types';

export type CreatePostModalProps = {
  visible: boolean;
  onClose: () => void;
  onOptimistic: (post: SocialPost) => void;
  onComplete: (post: SocialPost) => void;
};

type ComposerType = SocialPost['type'];

export function CreatePostModal({
  visible,
  onClose,
  onOptimistic,
  onComplete,
}: CreatePostModalProps) {
  const { createPost, isCreating, uploadProgress, error } = useCreatePost();
  const [type, setType] = useState<ComposerType>('text');
  const [text, setText] = useState('');
  const [imageUri, setImageUri] = useState<string | undefined>();
  const [positionNeeded, setPositionNeeded] = useState('');
  const [ageGroup, setAgeGroup] = useState('');
  const [location, setLocation] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');

  const reset = () => {
    setType('text');
    setText('');
    setImageUri(undefined);
    setPositionNeeded('');
    setAgeGroup('');
    setLocation('');
    setScheduledAt('');
  };

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      setType('photo');
    }
  };

  const handleSubmit = async () => {
    try {
      await createPost(
        {
          type,
          text: text.trim() || undefined,
          imageUri,
          trialDetails:
            type === 'trial_invite'
              ? {
                  positionNeeded,
                  ageGroup,
                  location,
                  scheduledAt: scheduledAt || new Date().toISOString(),
                }
              : undefined,
        },
        onOptimistic,
        onComplete,
      );
      reset();
      onClose();
    } catch {
      // error surfaced via hook
    }
  };

  return (
    <Modal visible={visible} onClose={onClose} title="Create post" size="lg">
      <View className="gap-4">
        <View className="flex-row flex-wrap gap-2">
          {(['text', 'photo', 'clip', 'trial_invite'] as ComposerType[]).map((option) => (
            <Button
              key={option}
              variant={type === option ? 'secondary' : 'ghost'}
              size="sm"
              onPress={() => setType(option)}
            >
              {option.replace('_', ' ')}
            </Button>
          ))}
        </View>

        <Input
          label="Caption"
          value={text}
          onChangeText={setText}
          multiline
          numberOfLines={3}
          placeholder="Share an update with the community"
        />

        {type === 'photo' ? (
          <Button variant="secondary" onPress={() => void handlePickImage()}>
            {imageUri ? 'Change photo' : 'Pick photo'}
          </Button>
        ) : null}

        {type === 'trial_invite' ? (
          <View className="gap-3">
            <Input label="Position needed" value={positionNeeded} onChangeText={setPositionNeeded} />
            <Input label="Age group" value={ageGroup} onChangeText={setAgeGroup} />
            <Input label="Location" value={location} onChangeText={setLocation} />
            <Input
              label="Date & time (ISO)"
              value={scheduledAt}
              onChangeText={setScheduledAt}
              placeholder="2026-07-10T14:00:00.000Z"
            />
          </View>
        ) : null}

        {isCreating && uploadProgress > 0 ? (
          <Text variant="caption" color="secondary">
            Uploading {Math.round(uploadProgress * 100)}%
          </Text>
        ) : null}

        {error ? (
          <Text variant="caption" color="error">
            {error}
          </Text>
        ) : null}

        <Button variant="accent" loading={isCreating} onPress={() => void handleSubmit()}>
          Publish
        </Button>
      </View>
    </Modal>
  );
}

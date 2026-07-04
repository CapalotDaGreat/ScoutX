import { useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/primitives/Button';
import { Dropdown } from '@/components/primitives/Dropdown';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import { VIDEO_CATEGORY_OPTIONS } from '@/features/highlight-videos/constants';
import { type HighlightVideo, type VideoCategory } from '@/features/highlight-videos/types';

export type HighlightVideoEditorModalProps = {
  visible: boolean;
  initialVideo?: Partial<HighlightVideo>;
  saving?: boolean;
  title?: string;
  onClose: () => void;
  onSubmit: (video: Omit<HighlightVideo, 'id' | 'videoUrl' | 'thumbnailUrl' | 'storagePath' | 'thumbnailStoragePath' | 'fileSizeBytes' | 'uploadStatus' | 'uploadError' | 'createdAt' | 'updatedAt' | 'analysis'>) => void;
};

const defaultDraft = {
  title: '',
  description: '',
  tags: [] as string[],
  category: 'skills' as VideoCategory,
  match: '',
  opponent: '',
  competition: '',
  date: new Date().toISOString(),
  durationSec: 0,
  featured: false,
  sortOrder: 0,
};

export function HighlightVideoEditorModal({
  visible,
  initialVideo,
  saving = false,
  title = 'Add Highlight Video',
  onClose,
  onSubmit,
}: HighlightVideoEditorModalProps) {
  const [draft, setDraft] = useState(defaultDraft);
  const [tagsInput, setTagsInput] = useState('');

  useEffect(() => {
    if (visible) {
      setDraft({
        title: initialVideo?.title ?? '',
        description: initialVideo?.description ?? '',
        tags: initialVideo?.tags ?? [],
        category: initialVideo?.category ?? 'skills',
        match: initialVideo?.match ?? '',
        opponent: initialVideo?.opponent ?? '',
        competition: initialVideo?.competition ?? '',
        date: initialVideo?.date ?? new Date().toISOString(),
        durationSec: initialVideo?.durationSec ?? 0,
        featured: initialVideo?.featured ?? false,
        sortOrder: initialVideo?.sortOrder ?? 0,
      });
      setTagsInput((initialVideo?.tags ?? []).join(', '));
    }
  }, [initialVideo, visible]);

  const handleSubmit = () => {
    if (!draft.title.trim()) {
      Alert.alert('Validation', 'Title is required.');
      return;
    }

    const tags = tagsInput
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);

    onSubmit({
      ...draft,
      tags,
      match: draft.match || undefined,
      opponent: draft.opponent || undefined,
      competition: draft.competition || undefined,
      description: draft.description || undefined,
    });
  };

  const footer = (
    <View className="flex-row gap-3">
      <Button variant="secondary" className="flex-1" onPress={onClose} disabled={saving}>
        Cancel
      </Button>
      <Button variant="accent" className="flex-1" onPress={handleSubmit} loading={saving}>
        Save
      </Button>
    </View>
  );

  return (
    <Modal visible={visible} onClose={onClose} title={title} size="sheet" footer={footer}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-4">
          <Input
            label="Title"
            value={draft.title}
            onChangeText={(value) => setDraft((current) => ({ ...current, title: value }))}
            placeholder="Match-winning free kick"
          />
          <Input
            label="Description"
            value={draft.description}
            onChangeText={(value) => setDraft((current) => ({ ...current, description: value }))}
            placeholder="What makes this clip special for scouts?"
            multiline
            numberOfLines={3}
            inputClassName="min-h-[80px] text-top"
          />
          <Dropdown
            label="Category"
            value={draft.category}
            onChange={(value) => setDraft((current) => ({ ...current, category: value as VideoCategory }))}
            options={VIDEO_CATEGORY_OPTIONS}
          />
          <Input
            label="Tags"
            value={tagsInput}
            onChangeText={setTagsInput}
            placeholder="set-piece, clutch, vision"
            hint="Comma-separated tags"
          />
          <Input
            label="Match"
            value={draft.match}
            onChangeText={(value) => setDraft((current) => ({ ...current, match: value }))}
            placeholder="Northstar FC vs Rangers"
          />
          <Input
            label="Opponent"
            value={draft.opponent}
            onChangeText={(value) => setDraft((current) => ({ ...current, opponent: value }))}
            placeholder="Rangers"
          />
          <Input
            label="Competition"
            value={draft.competition}
            onChangeText={(value) => setDraft((current) => ({ ...current, competition: value }))}
            placeholder="Primera División"
          />
          <Input
            label="Date (ISO)"
            value={draft.date}
            onChangeText={(value) => setDraft((current) => ({ ...current, date: value }))}
            placeholder="2025-03-18T00:00:00.000Z"
          />
          <View className="flex-row gap-2">
            <Button
              variant={draft.featured ? 'accent' : 'secondary'}
              className="flex-1"
              onPress={() => setDraft((current) => ({ ...current, featured: !current.featured }))}
            >
              {draft.featured ? 'Featured ✓' : 'Set as Featured'}
            </Button>
          </View>
          <Text variant="caption" color="secondary">
            AI analysis metadata is reserved for a future release and will attach automatically once enabled.
          </Text>
        </View>
      </ScrollView>
    </Modal>
  );
}

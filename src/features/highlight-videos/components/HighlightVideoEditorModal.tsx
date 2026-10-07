import { useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/primitives/Button';
import { Dropdown } from '@/components/primitives/Dropdown';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import { VIDEO_CATEGORIES } from '@/features/highlight-videos/constants';
import { type HighlightVideo, type VideoCategory } from '@/features/highlight-videos/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

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
  title,
  onClose,
  onSubmit,
}: HighlightVideoEditorModalProps) {
  const { t } = useAppTranslation(['media', 'common', 'validation']);
  const [draft, setDraft] = useState(defaultDraft);
  const [tagsInput, setTagsInput] = useState('');
  const modalTitle = title ?? t('editor.addTitle');

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
      Alert.alert(t('validation:fieldRequired'), t('editor.titleRequired'));
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
        {t('common:cancel')}
      </Button>
      <Button variant="accent" className="flex-1" onPress={handleSubmit} loading={saving}>
        {t('common:save')}
      </Button>
    </View>
  );

  return (
    <Modal visible={visible} onClose={onClose} title={modalTitle} size="sheet" footer={footer}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-4">
          <Input
            label={t('editor.title')}
            value={draft.title}
            onChangeText={(value) => setDraft((current) => ({ ...current, title: value }))}
            placeholder={t('editor.titlePlaceholder')}
          />
          <Input
            label={t('editor.description')}
            value={draft.description}
            onChangeText={(value) => setDraft((current) => ({ ...current, description: value }))}
            placeholder={t('editor.descriptionPlaceholder')}
            multiline
            numberOfLines={3}
            inputClassName="min-h-[80px] text-top"
          />
          <Dropdown
            label={t('editor.category')}
            value={draft.category}
            onChange={(value) => setDraft((current) => ({ ...current, category: value as VideoCategory }))}
            options={VIDEO_CATEGORIES.map((category) => ({ value: category, label: t(`media:category.${category}`) }))}
          />
          <Input
            label={t('editor.tags')}
            value={tagsInput}
            onChangeText={setTagsInput}
            placeholder={t('editor.tagsPlaceholder')}
            hint={t('editor.tagsHint')}
          />
          <Input
            label={t('editor.match')}
            value={draft.match}
            onChangeText={(value) => setDraft((current) => ({ ...current, match: value }))}
            placeholder={t('editor.matchPlaceholder')}
          />
          <Input
            label={t('editor.opponent')}
            value={draft.opponent}
            onChangeText={(value) => setDraft((current) => ({ ...current, opponent: value }))}
            placeholder={t('editor.opponentPlaceholder')}
          />
          <Input
            label={t('editor.competition')}
            value={draft.competition}
            onChangeText={(value) => setDraft((current) => ({ ...current, competition: value }))}
            placeholder={t('editor.competitionPlaceholder')}
          />
          <Input
            label={t('editor.dateIso')}
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
              {draft.featured ? t('editor.featured') : t('editor.setFeatured')}
            </Button>
          </View>
          <Text variant="caption" color="secondary">
            {t('editor.analysisReserved')}
          </Text>
        </View>
      </ScrollView>
    </Modal>
  );
}

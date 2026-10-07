import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/primitives/Button';
import { Input } from '@/components/primitives/Input';
import { Dropdown } from '@/components/primitives/Dropdown';
import { type RecruitmentFolder, type RecruitmentShortlistDraft } from '@/features/scout-recruitment/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type CreateRecruitmentShortlistModalProps = {
  visible: boolean;
  folders: RecruitmentFolder[];
  onClose: () => void;
  onCreate: (draft: RecruitmentShortlistDraft) => Promise<void>;
};

export function CreateRecruitmentShortlistModal({
  visible,
  folders,
  onClose,
  onCreate,
}: CreateRecruitmentShortlistModalProps) {
  const { t } = useAppTranslation('scout');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [folderId, setFolderId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const folderOptions = useMemo(
    () => [
      { label: t('pipelineUi.noFolder'), value: '' },
      ...folders.map((folder) => ({ label: folder.name, value: folder.id })),
    ],
    [folders, t],
  );

  const handleCreate = async () => {
    if (!name.trim()) {
      return;
    }
    setIsSubmitting(true);
    try {
      await onCreate({
        name: name.trim(),
        description: description.trim(),
        folderId: folderId || null,
      });
      setName('');
      setDescription('');
      setFolderId(null);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} onClose={onClose} title={t('pipelineUi.createShortlist')} size="md">
      <View className="gap-4">
        <Input
          label={t('pipelineUi.shortlistName')}
          value={name}
          onChangeText={setName}
          placeholder={t('pipelineUi.shortlistPlaceholder')}
        />
        <Input
          label={t('pipelineUi.description')}
          value={description}
          onChangeText={setDescription}
          placeholder={t('pipelineUi.descriptionPlaceholder')}
        />
        <Dropdown
          label={t('pipelineUi.folder')}
          value={folderId ?? ''}
          options={folderOptions}
          onChange={(value) => setFolderId(value || null)}
        />
        <Button variant="accent" onPress={handleCreate} loading={isSubmitting} disabled={!name.trim()}>
          {t('pipelineUi.createShortlist')}
        </Button>
      </View>
    </Modal>
  );
}

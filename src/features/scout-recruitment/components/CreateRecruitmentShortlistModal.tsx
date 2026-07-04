import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/primitives/Button';
import { Input } from '@/components/primitives/Input';
import { Dropdown } from '@/components/primitives/Dropdown';
import { type RecruitmentFolder, type RecruitmentShortlistDraft } from '@/features/scout-recruitment/types';

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
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [folderId, setFolderId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const folderOptions = useMemo(
    () => [
      { label: 'No folder', value: '' },
      ...folders.map((folder) => ({ label: folder.name, value: folder.id })),
    ],
    [folders],
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
    <Modal visible={visible} onClose={onClose} title="Create Shortlist" size="md">
      <View className="gap-4">
        <Input
          label="Shortlist name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Summer Window"
        />
        <Input
          label="Description"
          value={description}
          onChangeText={setDescription}
          placeholder="Optional context for your team"
        />
        <Dropdown
          label="Folder"
          value={folderId ?? ''}
          options={folderOptions}
          onChange={(value) => setFolderId(value || null)}
        />
        <Button variant="accent" onPress={handleCreate} loading={isSubmitting} disabled={!name.trim()}>
          Create Shortlist
        </Button>
      </View>
    </Modal>
  );
}

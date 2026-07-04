import { useState } from 'react';
import { View } from 'react-native';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/primitives/Button';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import { RECRUITMENT_FOLDER_COLORS } from '@/features/scout-recruitment/constants';
import { type RecruitmentFolderDraft } from '@/features/scout-recruitment/types';
import { cn } from '@/utils/cn';
import { Pressable } from 'react-native';

export type CreateRecruitmentFolderModalProps = {
  visible: boolean;
  onClose: () => void;
  onCreate: (draft: RecruitmentFolderDraft) => Promise<void>;
};

export function CreateRecruitmentFolderModal({
  visible,
  onClose,
  onCreate,
}: CreateRecruitmentFolderModalProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(RECRUITMENT_FOLDER_COLORS[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      return;
    }
    setIsSubmitting(true);
    try {
      await onCreate({ name: name.trim(), color });
      setName('');
      setColor(RECRUITMENT_FOLDER_COLORS[0]);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} onClose={onClose} title="Create Folder" size="md">
      <View className="gap-4">
        <Input
          label="Folder name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Academy Targets"
        />

        <View className="gap-2">
          <Text variant="caption" color="secondary" className="uppercase">
            Color
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {RECRUITMENT_FOLDER_COLORS.map((option) => (
              <Pressable
                key={option}
                accessibilityRole="button"
                accessibilityState={{ selected: color === option }}
                onPress={() => setColor(option)}
                className={cn(
                  'h-9 w-9 rounded-full border-2',
                  color === option ? 'border-foreground' : 'border-transparent',
                )}
                style={{ backgroundColor: option }}
              />
            ))}
          </View>
        </View>

        <Button variant="accent" onPress={handleCreate} loading={isSubmitting} disabled={!name.trim()}>
          Create Folder
        </Button>
      </View>
    </Modal>
  );
}

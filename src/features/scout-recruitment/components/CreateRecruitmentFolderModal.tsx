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
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

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
  const { t } = useAppTranslation('scout');
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
    <Modal visible={visible} onClose={onClose} title={t('pipelineUi.createFolder')} size="md">
      <View className="gap-4">
        <Input
          label={t('pipelineUi.folderName')}
          value={name}
          onChangeText={setName}
          placeholder={t('pipelineUi.folderPlaceholder')}
        />

        <View className="gap-2">
          <Text variant="caption" color="secondary" className="uppercase">
            {t('pipelineUi.color')}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {RECRUITMENT_FOLDER_COLORS.map((option) => (
              <Pressable
                key={option}
                accessibilityRole="button"
                accessibilityLabel={t('pipelineUi.colorOption', { index: RECRUITMENT_FOLDER_COLORS.indexOf(option) + 1 })}
                accessibilityState={{ selected: color === option }}
                hitSlop={4}
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
          {t('pipelineUi.createFolder')}
        </Button>
      </View>
    </Modal>
  );
}

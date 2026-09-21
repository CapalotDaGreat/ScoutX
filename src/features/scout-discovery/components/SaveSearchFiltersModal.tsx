import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/primitives/Button';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { useTheme } from '@/theme';

export type SaveSearchFiltersModalProps = {
  visible: boolean;
  defaultName?: string;
  hasSearchQuery: boolean;
  onClose: () => void;
  onSave: (name: string, includeSearch: boolean) => void;
};

export function SaveSearchFiltersModal({
  visible,
  defaultName = '',
  hasSearchQuery,
  onClose,
  onSave,
}: SaveSearchFiltersModalProps) {
  const { t } = useAppTranslation(['scout', 'common']);
  const { colors } = useTheme();
  const [name, setName] = useState(defaultName);
  const [includeSearch, setIncludeSearch] = useState(hasSearchQuery);

  useEffect(() => {
    if (visible) {
      setName(defaultName);
      setIncludeSearch(hasSearchQuery);
    }
  }, [defaultName, hasSearchQuery, visible]);

  const trimmed = name.trim();
  const canSave = trimmed.length > 0;

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title={t('scout:search.saveFiltersTitle')}
      size="sm"
      footer={
        <View className="flex-row gap-3">
          <Button variant="secondary" className="flex-1" onPress={onClose}>
            {t('common:cancel')}
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            disabled={!canSave}
            onPress={() => {
              if (!canSave) {
                return;
              }
              onSave(trimmed, includeSearch);
            }}
          >
            {t('common:save')}
          </Button>
        </View>
      }
    >
      <View className="gap-4">
        <Text variant="body-sm" color="secondary">
          {t('scout:search.saveFiltersDescription')}
        </Text>
        <Input
          label={t('scout:search.filterNameLabel')}
          value={name}
          onChangeText={setName}
          placeholder={t('scout:search.filterNamePlaceholder')}
          autoFocus
          maxLength={40}
          returnKeyType="done"
          onSubmitEditing={() => {
            if (canSave) {
              onSave(trimmed, includeSearch);
            }
          }}
        />
        {hasSearchQuery ? (
          <View className="flex-row items-center justify-between gap-3 rounded-xl border border-border bg-surface-cool px-3 py-3">
            <View className="min-w-0 flex-1">
              <Text variant="label">{t('scout:search.includeSearchLabel')}</Text>
              <Text variant="body-sm" color="secondary" className="mt-0.5">
                {t('scout:search.includeSearchHint')}
              </Text>
            </View>
            <Switch
              value={includeSearch}
              onValueChange={setIncludeSearch}
              trackColor={{ false: colors.border, true: colors.gold }}
              thumbColor={colors.surface}
            />
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

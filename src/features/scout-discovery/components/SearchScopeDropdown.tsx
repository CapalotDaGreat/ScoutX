import { useMemo, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { Text } from '@/components/primitives/Text';
import { SEARCH_SCOPE_OPTIONS } from '@/features/scout-discovery/constants';
import { type DiscoverySearchScope } from '@/features/scout-discovery/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { useTheme } from '@/theme';
import { cn } from '@/utils/cn';

export type SearchScopeDropdownProps = {
  value: DiscoverySearchScope;
  onChange: (scope: DiscoverySearchScope) => void;
};

function useScopeLabel() {
  const { t } = useAppTranslation(['scout']);
  return (scope: DiscoverySearchScope): string => {
    switch (scope) {
      case 'name':
        return t('scout:search.scopeName');
      case 'club':
        return t('scout:search.scopeClub');
      case 'position':
        return t('scout:search.scopePosition');
      case 'nationality':
        return t('scout:search.scopeNationality');
      case 'league':
        return t('scout:search.scopeLeague');
      case 'all':
      default:
        return t('scout:search.scopeAll');
    }
  };
}

export function SearchScopeDropdown({ value, onChange }: SearchScopeDropdownProps) {
  const { t } = useAppTranslation(['scout', 'common']);
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const scopeLabel = useScopeLabel();

  const selectedLabel = useMemo(() => scopeLabel(value), [scopeLabel, value]);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('scout:search.scopeLabel')}
        accessibilityHint={t('scout:search.scopeHint')}
        onPress={() => setOpen(true)}
        className="h-11 min-w-[96px] flex-row items-center justify-between gap-1 rounded-full border border-border bg-surface px-3"
      >
        <Text variant="label" numberOfLines={1} className="max-w-[72px]">
          {selectedLabel}
        </Text>
        <ChevronDown size={16} color={colors.textSecondary} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common:cancel')}
          className="flex-1 bg-black/40"
          onPress={() => setOpen(false)}
        >
          <View className="mt-28 px-4">
            <Pressable
              onPress={(event) => event.stopPropagation()}
              className="overflow-hidden rounded-2xl border border-border bg-surface"
            >
              <View className="border-b border-divider px-4 py-3">
                <Text variant="label" color="secondary">
                  {t('scout:search.scopeLabel')}
                </Text>
              </View>
              {SEARCH_SCOPE_OPTIONS.map((option) => {
                const isActive = option === value;
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                    onPress={() => {
                      onChange(option);
                      setOpen(false);
                    }}
                    className={cn(
                      'px-4 py-3.5',
                      isActive ? 'bg-surface-cool' : 'bg-surface',
                    )}
                  >
                    <Text
                      variant="body"
                      color={isActive ? 'prestige' : 'primary'}
                      weight={isActive ? 'semibold' : 'regular'}
                    >
                      {scopeLabel(option)}
                    </Text>
                  </Pressable>
                );
              })}
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

import { Pressable, ScrollView, View } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { type RecruitmentFolder } from '@/features/scout-recruitment/types';
import { cn } from '@/utils/cn';
import { FolderPlus } from 'lucide-react-native';
import { useTheme } from '@/theme';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type RecruitmentFolderBarProps = {
  folders: RecruitmentFolder[];
  activeFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  onCreateFolder: () => void;
};

export function RecruitmentFolderBar({
  folders,
  activeFolderId,
  onSelectFolder,
  onCreateFolder,
}: RecruitmentFolderBarProps) {
  const { colors } = useTheme();
  const { t } = useAppTranslation('scout');

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between px-4">
        <Text variant="overline" color="secondary">
          {t('pipelineUi.folders')}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('pipelineUi.createFolder')}
          hitSlop={8}
          onPress={onCreateFolder}
          className="flex-row items-center gap-1 rounded-full border border-border px-2.5 py-1"
        >
          <FolderPlus size={14} color={colors.accent} />
          <Text variant="caption" className="font-sans-semibold text-accent">
            {t('pipelineUi.new')}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: activeFolderId === null }}
          onPress={() => onSelectFolder(null)}
          className={cn(
            'rounded-full border px-3 py-2',
            activeFolderId === null
              ? 'border-accent bg-accent-muted'
              : 'border-border bg-surface',
          )}
        >
          <Text
            variant="caption"
            className={cn(
              'font-sans-semibold',
              activeFolderId === null ? 'text-accent' : 'text-foreground-secondary',
            )}
          >
            {t('pipelineUi.allPlayers')}
          </Text>
        </Pressable>

        {folders.map((folder) => {
          const isActive = activeFolderId === folder.id;
          return (
            <Pressable
              key={folder.id}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              onPress={() => onSelectFolder(folder.id)}
              className={cn(
                'flex-row items-center gap-2 rounded-full border px-3 py-2',
                isActive
                  ? 'border-accent bg-accent-muted'
                  : 'border-border bg-surface',
              )}
            >
              <View className="h-2 w-2 rounded-full" style={{ backgroundColor: folder.color }} />
              <Text
                variant="caption"
                className={cn(
                  'font-sans-semibold',
                  isActive ? 'text-accent' : 'text-foreground-secondary',
                )}
              >
                {folder.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

import { Pressable, ScrollView, View } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { type RecruitmentFolder } from '@/features/scout-recruitment/types';
import { cn } from '@/utils/cn';
import { FolderPlus } from 'lucide-react-native';
import { useTheme } from '@/theme';

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

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between px-4">
        <Text variant="overline" color="secondary">
          Folders
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create folder"
          onPress={onCreateFolder}
          className="flex-row items-center gap-1 rounded-full border border-border px-2.5 py-1 dark:border-neutral-700"
        >
          <FolderPlus size={14} color={colors.accent} />
          <Text variant="caption" className="font-sans-semibold text-accent dark:text-green-400">
            New
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
          onPress={() => onSelectFolder(null)}
          className={cn(
            'rounded-full border px-3 py-2',
            activeFolderId === null
              ? 'border-accent bg-accent-muted dark:border-green-500 dark:bg-green-950'
              : 'border-border bg-surface dark:border-neutral-700 dark:bg-neutral-900',
          )}
        >
          <Text
            variant="caption"
            className={cn(
              'font-sans-semibold',
              activeFolderId === null ? 'text-accent dark:text-green-400' : 'text-foreground-secondary',
            )}
          >
            All Players
          </Text>
        </Pressable>

        {folders.map((folder) => {
          const isActive = activeFolderId === folder.id;
          return (
            <Pressable
              key={folder.id}
              accessibilityRole="button"
              onPress={() => onSelectFolder(folder.id)}
              className={cn(
                'flex-row items-center gap-2 rounded-full border px-3 py-2',
                isActive
                  ? 'border-accent bg-accent-muted dark:border-green-500 dark:bg-green-950'
                  : 'border-border bg-surface dark:border-neutral-700 dark:bg-neutral-900',
              )}
            >
              <View className="h-2 w-2 rounded-full" style={{ backgroundColor: folder.color }} />
              <Text
                variant="caption"
                className={cn(
                  'font-sans-semibold',
                  isActive ? 'text-accent dark:text-green-400' : 'text-foreground-secondary',
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

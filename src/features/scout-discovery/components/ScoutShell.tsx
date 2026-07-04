import { type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { cn } from '@/utils/cn';
import { Compass, GitCompare, Home, Kanban } from 'lucide-react-native';
import { useTheme } from '@/theme';

export type ScoutTab = 'dashboard' | 'discover' | 'compare' | 'pipeline';

export type ScoutShellProps = {
  activeTab: ScoutTab;
  onTabChange: (tab: ScoutTab) => void;
  compareCount: number;
  pipelineCount: number;
  children: ReactNode;
};

const tabs: Array<{ id: ScoutTab; label: string; icon: typeof Home }> = [
  { id: 'dashboard', label: 'Home', icon: Home },
  { id: 'discover', label: 'Discover', icon: Compass },
  { id: 'compare', label: 'Compare', icon: GitCompare },
  { id: 'pipeline', label: 'Pipeline', icon: Kanban },
];

export function ScoutShell({
  activeTab,
  onTabChange,
  compareCount,
  pipelineCount,
  children,
}: ScoutShellProps) {
  const { colors } = useTheme();

  return (
    <View className="flex-1">
      <View className="flex-1">{children}</View>
      <View className="border-t border-divider bg-surface px-2 pb-2 pt-2 dark:border-neutral-800 dark:bg-neutral-950">
        <View className="flex-row">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const badge =
              tab.id === 'pipeline' && pipelineCount > 0
                ? pipelineCount
                : tab.id === 'compare' && compareCount > 0
                  ? compareCount
                  : null;

            return (
              <Pressable
                key={tab.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                onPress={() => onTabChange(tab.id)}
                className="flex-1 items-center gap-1 rounded-lg px-2 py-2"
              >
                <View className="relative">
                  <Icon
                    size={20}
                    color={isActive ? colors.accent : colors.textSecondary}
                    strokeWidth={isActive ? 2.25 : 1.75}
                  />
                  {badge ? (
                    <View className="absolute -right-2 -top-1 min-w-[16px] rounded-full bg-accent px-1">
                      <Text variant="caption" className="text-center font-sans-bold text-white">
                        {badge > 9 ? '9+' : badge}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text
                  variant="caption"
                  className={cn(
                    'font-sans-semibold',
                    isActive ? 'text-accent dark:text-green-400' : 'text-foreground-secondary',
                  )}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

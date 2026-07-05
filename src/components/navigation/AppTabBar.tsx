import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type LucideIcon } from 'lucide-react-native';
import { Text } from '@/components/primitives/Text';
import { cn } from '@/utils/cn';
import { triggerHaptic } from '@/utils/haptics';
import { useTheme } from '@/theme';

export type AppTabBarItem<T extends string> = {
  id: T;
  label: string;
  icon: LucideIcon;
  badge?: number | null;
};

export type AppTabBarProps<T extends string> = {
  tabs: Array<AppTabBarItem<T>>;
  activeTab: T;
  onTabChange: (tab: T) => void;
  testID?: string;
};

function formatBadge(value: number): string {
  return value > 9 ? '9+' : String(value);
}

export function AppTabBar<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  testID,
}: AppTabBarProps<T>) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      testID={testID}
      className="border-t border-divider bg-surface px-2 pt-2 dark:border-neutral-800 dark:bg-neutral-950"
      style={{ paddingBottom: Math.max(insets.bottom, 8) }}
    >
      <View className="flex-row">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const badge = tab.badge && tab.badge > 0 ? tab.badge : null;

          return (
            <Pressable
              key={tab.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={tab.label}
              onPress={() => {
                void triggerHaptic('light');
                onTabChange(tab.id);
              }}
              className="min-h-[52px] flex-1 items-center justify-center gap-1 rounded-lg px-1 py-1.5"
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
                      {formatBadge(badge)}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text
                variant="caption"
                numberOfLines={1}
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
  );
}

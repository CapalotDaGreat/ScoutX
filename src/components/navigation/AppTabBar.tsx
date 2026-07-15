import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus, type LucideIcon } from 'lucide-react-native';
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
  /** When set, renders a center FAB between the first and second half of tabs. */
  onCenterAction?: () => void;
  centerActionLabel?: string;
  testID?: string;
};

function formatBadge(value: number): string {
  return value > 9 ? '9+' : String(value);
}

function TabItem<T extends string>({
  tab,
  isActive,
  onPress,
  accentColor,
  mutedColor,
}: {
  tab: AppTabBarItem<T>;
  isActive: boolean;
  onPress: () => void;
  accentColor: string;
  mutedColor: string;
}) {
  const Icon = tab.icon;
  const badge = tab.badge && tab.badge > 0 ? tab.badge : null;

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={tab.label}
      onPress={onPress}
      className="min-h-[52px] flex-1 items-center justify-center gap-1 rounded-lg px-1 py-1.5"
    >
      <View className="relative">
        <Icon
          size={20}
          color={isActive ? accentColor : mutedColor}
          strokeWidth={isActive ? 2.25 : 1.75}
        />
        {badge ? (
          <View className="absolute -right-2 -top-1 min-w-[16px] rounded-full bg-accent px-1">
            <Text variant="caption" className="text-center font-sans-bold text-accent-foreground">
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
          isActive ? 'text-accent' : 'text-foreground-secondary',
        )}
      >
        {tab.label}
      </Text>
    </Pressable>
  );
}

export function AppTabBar<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  onCenterAction,
  centerActionLabel = 'Log match',
  testID,
}: AppTabBarProps<T>) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const mid = Math.ceil(tabs.length / 2);
  const leftTabs = onCenterAction ? tabs.slice(0, mid) : tabs;
  const rightTabs = onCenterAction ? tabs.slice(mid) : [];

  return (
    <View
      testID={testID}
      className="border-t border-transparent bg-background px-2 pt-2"
      style={{ paddingBottom: Math.max(insets.bottom, 8) }}
    >
      <View className="flex-row items-end">
        {leftTabs.map((tab) => (
          <TabItem
            key={tab.id}
            tab={tab}
            isActive={activeTab === tab.id}
            accentColor={colors.accent}
            mutedColor={colors.textSecondary}
            onPress={() => {
              void triggerHaptic('light');
              onTabChange(tab.id);
            }}
          />
        ))}

        {onCenterAction ? (
          <View className="mx-1 w-16 items-center justify-end pb-1">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={centerActionLabel}
              onPress={() => {
                void triggerHaptic('medium');
                onCenterAction();
              }}
              className="-mt-7 h-14 w-14 items-center justify-center rounded-full bg-accent shadow-lg"
              style={{ elevation: 4 }}
            >
              <Plus size={28} color={colors.accentForeground} strokeWidth={2.5} />
            </Pressable>
          </View>
        ) : null}

        {rightTabs.map((tab) => (
          <TabItem
            key={tab.id}
            tab={tab}
            isActive={activeTab === tab.id}
            accentColor={colors.accent}
            mutedColor={colors.textSecondary}
            onPress={() => {
              void triggerHaptic('light');
              onTabChange(tab.id);
            }}
          />
        ))}
      </View>
    </View>
  );
}

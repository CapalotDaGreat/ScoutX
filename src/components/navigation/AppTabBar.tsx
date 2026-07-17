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
  return value > 99 ? '99+' : value > 9 ? '9+' : String(value);
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
  const badgeLabel = badge ? formatBadge(badge) : null;

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={
        badge ? `${tab.label}, ${badge} notifications` : tab.label
      }
      onPress={onPress}
      className="min-h-[56px] flex-1 items-center justify-center gap-1 rounded-xl px-1.5 py-2"
    >
      <View className="relative h-7 w-8 items-center justify-center overflow-visible">
        <Icon
          size={22}
          color={isActive ? accentColor : mutedColor}
          strokeWidth={isActive ? 2.25 : 1.75}
        />
        {badgeLabel ? (
          <View
            className={cn(
              'absolute -right-1 -top-0.5 items-center justify-center rounded-full bg-accent',
              badgeLabel.length > 1 ? 'min-w-[18px] px-1' : 'h-4 w-4',
            )}
          >
            <Text
              variant="caption"
              color="onAccent"
              weight="bold"
              className="text-center text-[9px] leading-[11px]"
            >
              {badgeLabel}
            </Text>
          </View>
        ) : null}
      </View>
      <Text
        variant="caption"
        numberOfLines={1}
        weight="medium"
        color={isActive ? 'prestige' : 'secondary'}
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
  /** Gold for selected tabs; emerald stays on the center FAB. */
  const tabAccent = colors.gold;

  const mid = Math.ceil(tabs.length / 2);
  const leftTabs = onCenterAction ? tabs.slice(0, mid) : tabs;
  const rightTabs = onCenterAction ? tabs.slice(mid) : [];

  return (
    <View
      testID={testID}
      className="border-t border-gold/20 bg-background px-2 pt-1.5"
      style={{
        backgroundColor: colors.background,
        paddingBottom: Math.max(insets.bottom, 10),
      }}
    >
      <View className="flex-row items-end overflow-visible">
        {leftTabs.map((tab) => (
          <TabItem
            key={tab.id}
            tab={tab}
            isActive={activeTab === tab.id}
            accentColor={tabAccent}
            mutedColor={colors.textSecondary}
            onPress={() => {
              void triggerHaptic('light');
              onTabChange(tab.id);
            }}
          />
        ))}

        {onCenterAction ? (
          <View className="mx-1 w-16 items-center justify-end pb-1.5">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={centerActionLabel}
              onPress={() => {
                void triggerHaptic('medium');
                onCenterAction();
              }}
              className="-mt-7 h-14 w-14 items-center justify-center rounded-full border-2 border-gold/50 bg-accent"
              style={{
                backgroundColor: colors.accent,
                elevation: 4,
                shadowColor: colors.gold,
                shadowOpacity: 0.28,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 4 },
              }}
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
            accentColor={tabAccent}
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

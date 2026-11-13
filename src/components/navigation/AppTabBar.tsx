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
  activeFill,
}: {
  tab: AppTabBarItem<T>;
  isActive: boolean;
  onPress: () => void;
  accentColor: string;
  mutedColor: string;
  activeFill: string;
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
      className="min-h-[64px] flex-1 items-center justify-center gap-1 py-1"
    >
      <View
        className="relative h-8 w-14 items-center justify-center overflow-visible rounded-full"
        style={isActive ? { backgroundColor: activeFill } : undefined}
      >
        <Icon
          size={22}
          color={isActive ? accentColor : mutedColor}
          strokeWidth={isActive ? 2.25 : 1.75}
        />
        {badgeLabel ? (
          <View
            className={cn(
              'absolute -right-1.5 -top-1 items-center justify-center rounded-full bg-accent',
              // 18 px circle with an 11 px numeral: the smallest size that stays legible; the count is also in the tab's name.
              badgeLabel.length > 1 ? 'h-[18px] min-w-[18px] px-1' : 'h-[18px] w-[18px]',
            )}
          >
            <Text
              variant="caption"
              color="onAccent"
              weight="bold"
              className="text-center text-[11px] leading-[13px]"
              maxFontSizeMultiplier={1.2}
            >
              {badgeLabel}
            </Text>
          </View>
        ) : null}
      </View>
      <Text
        variant="caption"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        className="h-4 w-full text-center text-[11.5px] leading-4"
        weight={isActive ? 'semibold' : 'medium'}
        color={isActive ? 'primary' : 'secondary'}
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
  const tabAccent = colors.accent;

  const mid = Math.ceil(tabs.length / 2);
  const leftTabs = onCenterAction ? tabs.slice(0, mid) : tabs;
  const rightTabs = onCenterAction ? tabs.slice(mid) : [];

  return (
    <View
      testID={testID}
      className="border-t border-divider bg-surface px-1 pt-1.5"
      style={{
        backgroundColor: colors.surface,
        paddingBottom: Math.max(insets.bottom, 8),
      }}
    >
      <View className="flex-row items-center overflow-visible">
        {/* The centre action is a button, not a tab, so each side is its own tab list. */}
        <View accessibilityRole="tablist" className="flex-1 flex-row items-center">
        {leftTabs.map((tab) => (
          <TabItem
            key={tab.id}
            tab={tab}
            isActive={activeTab === tab.id}
            accentColor={tabAccent}
            mutedColor={colors.textSecondary}
            activeFill={colors.accentMuted}
            onPress={() => {
              void triggerHaptic('light');
              onTabChange(tab.id);
            }}
          />
        ))}
        </View>

        {onCenterAction ? (
          <View className="w-14 items-center justify-center">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={centerActionLabel}
              onPress={() => {
                void triggerHaptic('medium');
                onCenterAction();
              }}
              className="h-[52px] w-[52px] items-center justify-center rounded-full bg-pitch active:opacity-90"
              style={{ backgroundColor: colors.pitch }}
            >
              <Plus size={26} color={colors.highlight} strokeWidth={2.5} />
            </Pressable>
          </View>
        ) : null}

        {rightTabs.length > 0 ? (
        <View accessibilityRole="tablist" className="flex-1 flex-row items-center">
        {rightTabs.map((tab) => (
          <TabItem
            key={tab.id}
            tab={tab}
            isActive={activeTab === tab.id}
            accentColor={tabAccent}
            mutedColor={colors.textSecondary}
            activeFill={colors.accentMuted}
            onPress={() => {
              void triggerHaptic('light');
              onTabChange(tab.id);
            }}
          />
        ))}
        </View>
        ) : null}
      </View>
    </View>
  );
}

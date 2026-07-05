import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import type { NavigationRoute, ParamListBase } from '@react-navigation/native';
import { AppTabBar, type AppTabBarItem } from '@/components/navigation/AppTabBar';

export type NavigationTabBarConfig<T extends string> = {
  tabs: Array<AppTabBarItem<T>>;
  resolveBadge?: (tabId: T) => number | null;
  testID?: string;
};

export function createNavigationTabBar<T extends string>(config: NavigationTabBarConfig<T>) {
  function NavigationTabBar({ state, navigation }: BottomTabBarProps) {
    const activeTab = state.routes[state.index]?.name as T;
    const tabs = config.tabs.map((tab) => ({
      ...tab,
      badge: config.resolveBadge?.(tab.id) ?? tab.badge ?? null,
    }));

    return (
      <AppTabBar
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(tabId) => {
          const route = state.routes.find(
            (item: NavigationRoute<ParamListBase, string>) => item.name === tabId,
          );
          if (!route) {
            return;
          }

          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!event.defaultPrevented) {
            navigation.navigate(tabId as never);
          }
        }}
        testID={config.testID}
      />
    );
  }

  return NavigationTabBar;
}

export function createDynamicNavigationTabBar<T extends string>(
  getConfig: () => NavigationTabBarConfig<T>,
) {
  function NavigationTabBar(props: BottomTabBarProps) {
    const TabBar = createNavigationTabBar(getConfig());
    return <TabBar {...props} />;
  }

  return NavigationTabBar;
}

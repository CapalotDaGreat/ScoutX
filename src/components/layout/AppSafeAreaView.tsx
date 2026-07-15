import { View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { useSafeAreaInsets, type Edge } from 'react-native-safe-area-context';
import { cn } from '@/utils/cn';

export type AppSafeAreaViewProps = ViewProps & {
  edges?: Edge[];
  className?: string;
  style?: StyleProp<ViewStyle>;
};

export function getSafeAreaPadding(
  insets: { top: number; bottom: number; left: number; right: number },
  edges: Edge[],
): ViewStyle {
  return {
    paddingTop: edges.includes('top') ? insets.top : 0,
    paddingBottom: edges.includes('bottom') ? insets.bottom : 0,
    paddingLeft: edges.includes('left') ? insets.left : 0,
    paddingRight: edges.includes('right') ? insets.right : 0,
  };
}

/** Safe-area padding via insets — avoids deprecated react-native SafeAreaView. */
export function AppSafeAreaView({
  edges = ['top', 'bottom', 'left', 'right'],
  className,
  style,
  children,
  ...props
}: AppSafeAreaViewProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      className={cn(className)}
      style={[getSafeAreaPadding(insets, edges), style]}
      {...props}
    >
      {children}
    </View>
  );
}

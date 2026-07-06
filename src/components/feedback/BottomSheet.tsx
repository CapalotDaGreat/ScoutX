import {
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  View,
  type ViewProps,
} from 'react-native';
import { Heading } from '@/components/primitives/Heading';
import { useTheme } from '@/theme';
import { cn } from '@/utils/cn';

export type BottomSheetRef = undefined;

export type BottomSheetProps = ViewProps & {
  children: ReactNode;
  title?: string;
  visible?: boolean;
  onClose?: () => void;
  showHandle?: boolean;
  contentClassName?: string;
};

export function BottomSheet({
  children,
  title,
  visible = false,
  onClose,
  showHandle = true,
  contentClassName,
  style,
  ...props
}: BottomSheetProps) {
  const { colors, isDark } = useTheme();
  const translateY = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) {
      return;
    }

    translateY.setValue(1);
    Animated.timing(translateY, {
      toValue: 0,
      duration: 220,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [translateY, visible]);

  if (!visible) {
    return null;
  }

  const handleClose = (): void => {
    Animated.timing(translateY, {
      toValue: 1,
      duration: 200,
      easing: Easing.in(Easing.ease),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        onClose?.();
      }
    });
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={handleClose}
    >
      <View className="flex-1 justify-end">
        <Pressable
          className="absolute inset-0"
          onPress={handleClose}
          style={{ backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.4)' }}
        />
        <Animated.View
          style={[
            {
              transform: [
                {
                  translateY: translateY.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 400],
                  }),
                },
              ],
            },
            style,
          ]}
          className="w-full rounded-t-2xl bg-surface p-4 pb-6"
          {...props}
        >
          {showHandle ? (
            <View className="mb-3 items-center">
              <View
                style={{
                  backgroundColor: colors.borderStrong,
                  height: 4,
                  width: 36,
                  borderRadius: 999,
                }}
              />
            </View>
          ) : null}
          {title ? (
            <Heading level={3} className="mb-4">
              {title}
            </Heading>
          ) : null}
          <View className={cn('flex-1', contentClassName)}>{children}</View>
        </Animated.View>
      </View>
    </Modal>
  );
}

export type BottomSheetContainerProps = {
  children: ReactNode;
};

export function BottomSheetContainer({ children }: BottomSheetContainerProps) {
  return <View className="absolute inset-0">{children}</View>;
}

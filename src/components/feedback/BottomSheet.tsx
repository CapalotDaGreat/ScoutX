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
import { useTheme, useThemeCssVars } from '@/theme';
import { motion } from '@/theme/tokens/motion';
import { cn } from '@/utils/cn';
import { useReducedMotion } from '@/hooks/useReducedMotion';

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
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const themeCssVars = useThemeCssVars();
  const translateY = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) {
      return;
    }

    translateY.setValue(1);
    Animated.timing(translateY, {
      toValue: 0,
      duration: reducedMotion ? 0 : motion.fast,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [translateY, visible, reducedMotion]);

  if (!visible) {
    return null;
  }

  const handleClose = (): void => {
    Animated.timing(translateY, {
      toValue: 1,
      duration: motion.instant,
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
      <View style={themeCssVars} className="flex-1 justify-end">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close sheet"
          className="absolute inset-0"
          onPress={handleClose}
          style={{ backgroundColor: colors.surfaceOverlay }}
        />
        <Animated.View
          style={[
            {
              backgroundColor: colors.surface,
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
          className="w-full rounded-t-2xl bg-surface px-5 pb-8 pt-3"
          {...props}
        >
          {showHandle ? (
            <View className="mb-4 items-center">
              <View
                style={{
                  backgroundColor: colors.borderStrong,
                  height: 4,
                  width: 40,
                  borderRadius: 999,
                }}
              />
            </View>
          ) : null}
          {title ? (
            <Heading level={3} className="mb-5">
              {title}
            </Heading>
          ) : null}
          <View className={cn('flex-1', contentClassName)}>{children}</View>
        </Animated.View>
      </View>
    </Modal>
  );
}

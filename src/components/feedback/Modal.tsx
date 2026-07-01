import { type ReactNode, useEffect } from 'react';
import {
  Modal as RNModal,
  Pressable,
  View,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { Heading } from '@/components/primitives/Heading';
import { useTheme } from '@/theme';
import { motion } from '@/theme/tokens/motion';
import { cn } from '@/utils/cn';
import { triggerHaptic } from '@/utils/haptics';

export type ModalSize = 'sm' | 'md' | 'lg' | 'sheet' | 'fullscreen';

export type ModalProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: ModalSize;
  showCloseButton?: boolean;
  closeOnBackdropPress?: boolean;
  footer?: ReactNode;
  className?: string;
};

const sizeWidth: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  sheet: 'w-full',
  fullscreen: 'w-full h-full',
};

export function Modal({
  visible,
  onClose,
  title,
  children,
  size = 'md',
  showCloseButton = true,
  closeOnBackdropPress = true,
  footer,
  className,
}: ModalProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const backdropOpacity = useSharedValue(0);
  const contentTranslateY = useSharedValue(24);

  useEffect(() => {
    if (visible) {
      backdropOpacity.value = withTiming(1, { duration: motion.fast });
      contentTranslateY.value = withTiming(0, { duration: motion.normal });
    } else {
      backdropOpacity.value = withTiming(0, { duration: motion.fast });
      contentTranslateY.value = withTiming(24, { duration: motion.fast });
    }
  }, [visible, backdropOpacity, contentTranslateY]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: contentTranslateY.value }],
  }));

  const handleClose = () => {
    void triggerHaptic('light');
    onClose();
  };

  const isSheet = size === 'sheet';
  const isFullscreen = size === 'fullscreen';

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <View className="flex-1 justify-end">
          <Animated.View
            style={backdropStyle}
            className="absolute inset-0 bg-black/40 dark:bg-black/60"
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close modal"
              className="flex-1"
              onPress={closeOnBackdropPress ? handleClose : undefined}
            />
          </Animated.View>

          <Animated.View
            style={[
              contentStyle,
              isSheet
                ? { maxHeight: height * 0.85, paddingBottom: insets.bottom }
                : isFullscreen
                  ? { paddingTop: insets.top, paddingBottom: insets.bottom }
                  : undefined,
            ]}
            className={cn(
              'mx-auto w-full',
              isSheet
                ? 'rounded-t-xl bg-surface dark:bg-neutral-900'
                : isFullscreen
                  ? 'flex-1 bg-background dark:bg-neutral-950'
                  : 'm-4 rounded-xl bg-surface dark:bg-neutral-900',
              !isSheet && !isFullscreen && sizeWidth[size],
              className,
            )}
          >
            {isSheet ? (
              <View className="items-center py-2">
                <View className="h-1 w-9 rounded-full bg-border-strong dark:bg-neutral-600" />
              </View>
            ) : null}

            {title || showCloseButton ? (
              <View className="flex-row items-center justify-between border-b border-divider px-4 py-4 dark:border-neutral-800">
                {title ? (
                  <Heading level={3} className="flex-1 pr-3">
                    {title}
                  </Heading>
                ) : (
                  <View className="flex-1" />
                )}
                {showCloseButton ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                    hitSlop={8}
                    onPress={handleClose}
                    className="h-8 w-8 items-center justify-center rounded-full bg-background-secondary dark:bg-neutral-800"
                  >
                    <X size={18} color={colors.textPrimary} strokeWidth={2} />
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            <View className={cn('flex-1', isSheet ? 'min-h-[200px]' : '')}>
              {children}
            </View>

            {footer ? (
              <View className="border-t border-divider px-4 py-4 dark:border-neutral-800">
                {footer}
              </View>
            ) : null}
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </RNModal>
  );
}

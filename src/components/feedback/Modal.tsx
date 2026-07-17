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
import { useTheme, useThemeCssVars } from '@/theme';
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
  const themeCssVars = useThemeCssVars();
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
  const sheetMaxHeight = height * 0.85;

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <View style={themeCssVars} className="flex-1">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          className="flex-1"
        >
          <View className="flex-1 justify-end">
          <Animated.View
            style={[backdropStyle, { backgroundColor: colors.surfaceOverlay }]}
            className="absolute inset-0"
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
              {
                backgroundColor: isFullscreen ? colors.background : colors.surface,
              },
              isSheet
                ? {
                    maxHeight: sheetMaxHeight,
                    paddingBottom: insets.bottom,
                  }
                : isFullscreen
                  ? { paddingTop: insets.top, paddingBottom: insets.bottom }
                  : undefined,
            ]}
            className={cn(
              'mx-auto w-full',
              isSheet
                ? 'rounded-t-xl bg-surface'
                : isFullscreen
                  ? 'flex-1 bg-background'
                  : 'm-4 rounded-xl bg-surface',
              !isSheet && !isFullscreen && sizeWidth[size],
              className,
            )}
          >
            <View
              className={cn(isSheet && 'max-h-full', isFullscreen && 'flex-1')}
              style={
                isSheet
                  ? { maxHeight: sheetMaxHeight - insets.bottom, flexShrink: 1 }
                  : undefined
              }
            >
              {isSheet ? (
                <View className="items-center py-2">
                  <View className="h-1 w-9 rounded-full bg-border-strong" />
                </View>
              ) : null}

              {title || showCloseButton ? (
                <View className="flex-row items-center justify-between border-b border-divider px-5 py-4">
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
                      hitSlop={10}
                      onPress={handleClose}
                      className="h-11 w-11 items-center justify-center rounded-full bg-background-secondary"
                    >
                      <X size={20} color={colors.textPrimary} strokeWidth={2} />
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              <View
                style={
                  isSheet
                    ? { maxHeight: sheetMaxHeight * 0.72, flexShrink: 1, minHeight: 0 }
                    : undefined
                }
                className={cn(isSheet ? 'min-h-[200px]' : 'flex-1')}
              >
                {children}
              </View>

              {footer ? (
                <View className="border-t border-divider px-4 py-4">
                  {footer}
                </View>
              ) : null}
            </View>
          </Animated.View>
        </View>
        </KeyboardAvoidingView>
      </View>
    </RNModal>
  );
}

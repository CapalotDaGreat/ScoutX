import {
  forwardRef,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { View } from 'react-native';
import BottomSheetLib, {
  BottomSheetBackdrop,
  BottomSheetView,
  type BottomSheetBackdropProps,
  type BottomSheetProps as LibBottomSheetProps,
} from '@gorhom/bottom-sheet';

export type BottomSheetRef = BottomSheetLib;
import { Heading } from '@/components/primitives/Heading';
import { useTheme } from '@/theme';
import { cn } from '@/utils/cn';

export type BottomSheetProps = Omit<
  LibBottomSheetProps,
  'children' | 'snapPoints' | 'backdropComponent'
> & {
  children: ReactNode;
  title?: string;
  snapPoints?: (string | number)[];
  onClose?: () => void;
  showHandle?: boolean;
  contentClassName?: string;
};

export const BottomSheet = forwardRef<BottomSheetLib, BottomSheetProps>(
  function BottomSheet(
    {
      children,
      title,
      snapPoints: snapPointsProp,
      onClose,
      showHandle = true,
      contentClassName,
      index = -1,
      enablePanDownToClose = true,
      ...props
    },
    ref,
  ) {
    const { colors, isDark } = useTheme();

    const snapPoints = useMemo(
      () => snapPointsProp ?? ['50%', '85%'],
      [snapPointsProp],
    );

    const renderBackdrop = useCallback(
      (backdropProps: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...backdropProps}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={isDark ? 0.6 : 0.4}
          pressBehavior="close"
        />
      ),
      [isDark],
    );

    return (
      <BottomSheetLib
        ref={ref}
        index={index}
        snapPoints={snapPoints}
        enablePanDownToClose={enablePanDownToClose}
        backdropComponent={renderBackdrop}
        handleIndicatorStyle={{
          backgroundColor: colors.borderStrong,
          width: 36,
          display: showHandle ? 'flex' : 'none',
        }}
        backgroundStyle={{
          backgroundColor: colors.surface,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
        }}
        onClose={onClose}
        {...props}
      >
        <BottomSheetView className={cn('flex-1 px-4', contentClassName)}>
          {title ? (
            <Heading level={3} className="mb-4">
              {title}
            </Heading>
          ) : null}
          {children}
        </BottomSheetView>
      </BottomSheetLib>
    );
  },
);

export type BottomSheetContainerProps = {
  children: ReactNode;
};

export function BottomSheetContainer({ children }: BottomSheetContainerProps) {
  return <View className="absolute inset-0">{children}</View>;
}

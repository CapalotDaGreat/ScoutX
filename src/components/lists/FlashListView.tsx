import { forwardRef, type ReactElement } from 'react';
import { FlashList, type FlashListProps } from '@shopify/flash-list';
import { View } from 'react-native';

export type FlashListViewProps<T> = FlashListProps<T> & {
  estimatedItemSize: number;
};

function FlashListViewInner<T>(
  { estimatedItemSize, ...props }: FlashListViewProps<T>,
  ref: React.Ref<FlashList<T>>,
) {
  return (
    <View className="min-h-[1px] flex-1">
      <FlashList
        ref={ref}
        estimatedItemSize={estimatedItemSize}
        showsVerticalScrollIndicator={false}
        {...props}
      />
    </View>
  );
}

export const FlashListView = forwardRef(FlashListViewInner) as <T>(
  props: FlashListViewProps<T> & { ref?: React.Ref<FlashList<T>> },
) => ReactElement | null;

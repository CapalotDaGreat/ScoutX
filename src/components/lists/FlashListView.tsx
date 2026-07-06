import { forwardRef, type ReactElement } from 'react';
import { FlashList, type FlashListProps, type FlashListRef } from '@shopify/flash-list';
import { View } from 'react-native';

export type FlashListViewProps<T> = FlashListProps<T>;

function FlashListViewInner<T>(
  props: FlashListViewProps<T>,
  ref: React.Ref<FlashListRef<T>>,
) {
  return (
    <View className="min-h-[1px] flex-1">
      <FlashList ref={ref} showsVerticalScrollIndicator={false} {...props} />
    </View>
  );
}

export const FlashListView = forwardRef(FlashListViewInner) as <T>(
  props: FlashListViewProps<T> & { ref?: React.Ref<FlashListRef<T>> },
) => ReactElement | null;

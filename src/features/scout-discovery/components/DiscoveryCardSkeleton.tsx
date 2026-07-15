import { View } from 'react-native';
import { Skeleton } from '@/components/feedback/SkeletonLoader';

export function DiscoveryCardSkeleton() {
  return (
    <View className="overflow-hidden rounded-2xl border border-border bg-surface">
      <Skeleton height={112} radius="none" />
      <View className="gap-3 p-4">
        <View className="flex-row gap-3">
          <Skeleton height={48} width={48} radius="full" />
          <View className="flex-1 gap-2">
            <Skeleton height={14} width="70%" radius="sm" />
            <Skeleton height={12} width="55%" radius="sm" />
            <Skeleton height={12} width="80%" radius="sm" />
          </View>
          <Skeleton height={56} width={56} radius="full" />
        </View>
        <View className="flex-row gap-2">
          <Skeleton height={24} className="flex-1" radius="sm" />
          <Skeleton height={24} className="flex-1" radius="sm" />
          <Skeleton height={24} className="flex-1" radius="sm" />
        </View>
        <View className="flex-row gap-1">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} height={20} width={20} radius="sm" />
          ))}
        </View>
      </View>
    </View>
  );
}

export type DiscoveryListSkeletonProps = {
  count?: number;
};

export function DiscoveryListSkeleton({ count = 4 }: DiscoveryListSkeletonProps) {
  return (
    <View className="gap-3 px-4">
      {Array.from({ length: count }).map((_, index) => (
        <DiscoveryCardSkeleton key={index} />
      ))}
    </View>
  );
}

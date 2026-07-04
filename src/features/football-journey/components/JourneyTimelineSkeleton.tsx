import { View } from 'react-native';
import { Skeleton, SkeletonCard } from '@/components/feedback/SkeletonLoader';

export function JourneyTimelineSkeleton() {
  return (
    <View className="gap-4">
      <View className="flex-row gap-2">
        <Skeleton height={32} width={72} radius="full" />
        <Skeleton height={32} width={96} radius="full" />
        <Skeleton height={32} width={80} radius="full" />
      </View>
      <SkeletonCard height={120} />
      <SkeletonCard height={120} />
      <SkeletonCard height={120} />
    </View>
  );
}

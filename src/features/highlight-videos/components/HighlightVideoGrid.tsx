import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { HighlightVideoCard } from '@/features/highlight-videos/components/HighlightVideoCard';
import { HighlightVideoCategoryFilter } from '@/features/highlight-videos/components/HighlightVideoCategoryFilter';
import { HighlightVideoFeatured } from '@/features/highlight-videos/components/HighlightVideoFeatured';
import { VIDEO_FILTER_ALL } from '@/features/highlight-videos/constants';
import { type VideoCategoryFilter } from '@/features/highlight-videos/constants';
import {
  filterVideosByCategory,
  getFeaturedHighlightVideo,
} from '@/features/highlight-videos/models/HighlightVideoModel';
import { type HighlightVideo, type HighlightVideoLibrary } from '@/features/highlight-videos/types';

export type HighlightVideoGridProps = {
  library: HighlightVideoLibrary;
  onVideoPress?: (video: HighlightVideo) => void;
  showFeatured?: boolean;
};

export function HighlightVideoGrid({
  library,
  onVideoPress,
  showFeatured = true,
}: HighlightVideoGridProps) {
  const [activeCategory, setActiveCategory] = useState<VideoCategoryFilter>(VIDEO_FILTER_ALL);

  const readyVideos = useMemo(
    () => library.videos.filter((video) => video.uploadStatus === 'ready'),
    [library.videos],
  );

  const featured = useMemo(() => getFeaturedHighlightVideo(library), [library]);

  const availableCategories = useMemo(() => {
    const categories = new Set(readyVideos.map((video) => video.category));
    return Array.from(categories);
  }, [readyVideos]);

  const filteredVideos = useMemo(() => {
    const withoutFeatured =
      featured && showFeatured
        ? readyVideos.filter((video) => video.id !== featured.id)
        : readyVideos;
    return filterVideosByCategory(withoutFeatured, activeCategory);
  }, [activeCategory, featured, readyVideos, showFeatured]);

  return (
    <View className="gap-4">
      {availableCategories.length > 1 ? (
        <HighlightVideoCategoryFilter
          activeCategory={activeCategory}
          availableCategories={availableCategories}
          onCategoryChange={setActiveCategory}
        />
      ) : null}

      {showFeatured && featured && activeCategory === VIDEO_FILTER_ALL ? (
        <HighlightVideoFeatured video={featured} onPress={onVideoPress} />
      ) : null}

      <View className="flex-row flex-wrap gap-3">
        {filteredVideos.map((video, index) => (
          <View key={video.id} className="w-[48%]">
            <HighlightVideoCard
              video={video}
              index={index}
              variant="compact"
              onPress={onVideoPress}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

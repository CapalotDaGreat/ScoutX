import { Image, Linking, Pressable, ScrollView, View } from 'react-native';
import { PlayCircle } from 'lucide-react-native';
import { Text } from '@/components/primitives/Text';
import { useTheme } from '@/theme';
import { type JourneyMedia } from '@/features/football-journey/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type JourneyEntryMediaProps = {
  media: JourneyMedia[];
};

export function JourneyEntryMedia({ media }: JourneyEntryMediaProps) {
  const { colors } = useTheme();
  const { t } = useAppTranslation('media');

  if (media.length === 0) {
    return null;
  }

  const openMedia = (item: JourneyMedia) => {
    void Linking.openURL(item.url);
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-2"
      className="-mx-1 mt-3"
    >
      {media.map((item, index) => {
        const imageUri = item.type === 'video' ? item.thumbnailUrl ?? item.url : item.url;

        return (
          <Pressable
            key={`${item.url}-${index}`}
            onPress={() => openMedia(item)}
            accessibilityRole="button"
            accessibilityLabel={
              item.caption || t(item.type === 'video' ? 'a11y.openVideo' : 'a11y.openPhoto')
            }
            className="overflow-hidden rounded-lg active:opacity-90"
          >
            <Image
              source={{ uri: imageUri }}
              className="h-28 w-40 bg-background-secondary"
              resizeMode="cover"
            />
            {item.type === 'video' ? (
              <View className="absolute inset-0 items-center justify-center bg-black/35">
                <PlayCircle size={32} color={colors.surface} />
              </View>
            ) : null}
            {item.caption ? (
              <View className="absolute bottom-0 left-0 right-0 bg-black/50 px-2 py-1">
                <Text variant="caption" className="text-white">
                  {item.caption}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

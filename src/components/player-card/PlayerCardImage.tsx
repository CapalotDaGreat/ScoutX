import { useState, type ReactNode } from 'react';
import { Image, View } from 'react-native';
import { playerImageKey } from './playerCardPresentation';

type Props = {
  playerId: string;
  uri: string;
  className: string;
  fallback: ReactNode;
};

function ImageAttempt({ uri, fallback }: Pick<Props, 'uri' | 'fallback'>) {
  const [failed, setFailed] = useState(false);
  return uri && !failed ? (
    <Image
      source={{ uri }}
      className="h-full w-full"
      resizeMode="cover"
      onError={() => setFailed(true)}
      accessibilityIgnoresInvertColors
    />
  ) : fallback;
}

/** Decorative identity imagery; the containing card provides the accessible name. */
export function PlayerCardImage({ playerId, uri, className, fallback }: Props) {
  return (
    <View className={className} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <ImageAttempt key={playerImageKey(playerId, uri)} uri={uri.trim()} fallback={fallback} />
    </View>
  );
}

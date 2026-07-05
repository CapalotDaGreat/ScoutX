import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { Text } from '@/components/primitives/Text';

/** Lightweight QR placeholder using a deterministic grid — avoids extra native deps. */
export function PortfolioQrCode({ value, size = 160 }: { value: string; size?: number }) {
  const cells = 11;
  const cellSize = size / cells;
  const bits = Array.from(value).reduce((sum, char) => sum + char.charCodeAt(0), 0);

  return (
    <View className="items-center gap-2">
      <Svg width={size} height={size}>
        {Array.from({ length: cells * cells }).map((_, index) => {
          const row = Math.floor(index / cells);
          const col = index % cells;
          const filled = (bits + row * 17 + col * 31 + index) % 3 !== 0;
          if (!filled) {
            return null;
          }
          return (
            <Rect
              key={`${row}-${col}`}
              x={col * cellSize}
              y={row * cellSize}
              width={cellSize}
              height={cellSize}
              fill="#111827"
            />
          );
        })}
      </Svg>
      <Text variant="caption" color="secondary" className="text-center">
        Scan to open portfolio
      </Text>
    </View>
  );
}

import QRCode from 'react-native-qrcode-svg';
import { View } from 'react-native';
import { Text } from '@/components/primitives/Text';

export function PortfolioQrCode({ value, size = 160 }: { value: string; size?: number }) {
  return (
    <View className="items-center gap-2">
      <QRCode value={value} size={size} />
      <Text variant="caption" color="secondary" className="text-center">
        Scan to open portfolio
      </Text>
    </View>
  );
}

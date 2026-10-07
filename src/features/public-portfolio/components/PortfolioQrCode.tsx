import QRCode from 'react-native-qrcode-svg';
import { View } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export function PortfolioQrCode({ value, size = 160 }: { value: string; size?: number }) {
  const { t } = useAppTranslation('portfolio');
  return (
    <View className="items-center gap-2">
      <QRCode value={value} size={size} />
      <Text variant="caption" color="secondary" className="text-center">
        {t('publicUi.scanQr')}
      </Text>
    </View>
  );
}

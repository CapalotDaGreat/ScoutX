import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/primitives/Button';
import { Heading } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export function SessionOfflineScreen({ onRetry }: { onRetry: () => Promise<void> }) {
  const { t } = useAppTranslation('auth');
  const { t: tCommon } = useAppTranslation('common');
  const [retrying, setRetrying] = useState(false);

  return (
    <SafeAreaView className="flex-1 bg-background" testID="session-offline">
      <View className="flex-1 items-center justify-center gap-4 px-6">
        <Heading level={2} className="text-center">{t('sessionOffline.title')}</Heading>
        <Text variant="body" color="secondary" className="text-center">
          {t('sessionOffline.body')}
        </Text>
        <Button
          onPress={() => {
            setRetrying(true);
            void onRetry().finally(() => setRetrying(false));
          }}
          loading={retrying}
          testID="session-offline-retry"
        >
          {tCommon('retry')}
        </Button>
      </View>
    </SafeAreaView>
  );
}

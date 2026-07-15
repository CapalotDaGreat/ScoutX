import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/primitives/Text';
import {
  isAppleLinkedToCurrentAccount,
  linkAppleToCurrentAccount,
} from '@/features/auth/services/appleAuthService';
import { AppleSignInButton, useAppleSignInAvailability } from '@/features/auth/components/AppleSignInButton';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export function LinkAppleAccountSection() {
  const { t } = useAppTranslation(['auth', 'settings']);
  const appleAvailable = useAppleSignInAvailability();
  const [isLinked, setIsLinked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    setIsLinked(isAppleLinkedToCurrentAccount());
  }, []);

  if (!appleAvailable) {
    return (
      <Text variant="body-sm" color="secondary">
        {t('auth:apple.unavailable')}
      </Text>
    );
  }

  if (isLinked) {
    return (
      <Text variant="body-sm" color="secondary">
        {t('auth:apple.alreadyLinked')}
      </Text>
    );
  }

  const handleLink = async () => {
    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await linkAppleToCurrentAccount();
      setIsLinked(true);
      setSuccessMessage(t('auth:apple.linkSuccess'));
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : t('auth:apple.linkFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View className="gap-3">
      <Text variant="body-sm" color="secondary">
        {t('auth:apple.linkDescription')}
      </Text>

      {error ? (
        <Text variant="body-sm" color="error">
          {error}
        </Text>
      ) : null}

      {successMessage ? (
        <Text variant="body-sm" color="accent">
          {successMessage}
        </Text>
      ) : null}

      <AppleSignInButton type="continue" disabled={isSubmitting} onPress={() => void handleLink()} />
    </View>
  );
}

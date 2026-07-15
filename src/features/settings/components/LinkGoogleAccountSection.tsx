import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/primitives/Text';
import {
  isGoogleLinkedToCurrentAccount,
  linkGoogleToCurrentAccount,
} from '@/features/auth/services/googleAuthService';
import { GoogleSignInButton, useGoogleSignInAvailability } from '@/features/auth/components/GoogleSignInButton';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export function LinkGoogleAccountSection() {
  const { t } = useAppTranslation('auth');
  const googleAvailable = useGoogleSignInAvailability();
  const [isLinked, setIsLinked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    setIsLinked(isGoogleLinkedToCurrentAccount());
  }, []);

  if (!googleAvailable) {
    return (
      <Text variant="body-sm" color="secondary">
        {t('google.unavailable')}
      </Text>
    );
  }

  if (isLinked) {
    return (
      <Text variant="body-sm" color="secondary">
        {t('google.alreadyLinked')}
      </Text>
    );
  }

  const handleLink = async () => {
    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await linkGoogleToCurrentAccount();
      setIsLinked(true);
      setSuccessMessage(t('google.linkSuccess'));
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : t('google.linkFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View className="gap-3">
      <Text variant="body-sm" color="secondary">
        {t('google.linkDescription')}
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

      <GoogleSignInButton loading={isSubmitting} disabled={isSubmitting} onPress={() => void handleLink()} />
    </View>
  );
}

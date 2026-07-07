import { Linking, View } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { getPrivacyPolicyUrl, getTermsOfServiceUrl } from '@/config/legal';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type LegalFooterLinksProps = {
  className?: string;
};

export function LegalFooterLinks({ className }: LegalFooterLinksProps) {
  const { t } = useAppTranslation('common');
  const privacyUrl = getPrivacyPolicyUrl();
  const termsUrl = getTermsOfServiceUrl();

  if (!privacyUrl && !termsUrl) {
    return null;
  }

  return (
    <View className={`flex-row flex-wrap items-center justify-center gap-x-2 gap-y-1 ${className ?? ''}`}>
      {privacyUrl ? (
        <Text
          variant="caption"
          color="secondary"
          onPress={() => void Linking.openURL(privacyUrl)}
        >
          {t('privacyPolicy')}
        </Text>
      ) : null}
      {privacyUrl && termsUrl ? (
        <Text variant="caption" color="secondary">
          ·
        </Text>
      ) : null}
      {termsUrl ? (
        <Text
          variant="caption"
          color="secondary"
          onPress={() => void Linking.openURL(termsUrl)}
        >
          {t('termsOfService')}
        </Text>
      ) : null}
    </View>
  );
}

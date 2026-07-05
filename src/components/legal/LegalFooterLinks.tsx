import { Linking, View } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { getPrivacyPolicyUrl, getTermsOfServiceUrl } from '@/config/legal';

export type LegalFooterLinksProps = {
  className?: string;
};

export function LegalFooterLinks({ className }: LegalFooterLinksProps) {
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
          Privacy Policy
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
          Terms of Service
        </Text>
      ) : null}
    </View>
  );
}

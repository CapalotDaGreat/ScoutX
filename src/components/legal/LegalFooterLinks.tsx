import { useState } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { LegalDocumentModal } from '@/features/legal/components/LegalDocumentModal';
import { type LegalDocumentId } from '@/features/legal/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type LegalFooterLinksProps = {
  className?: string;
};

/** Opens the bundled documents in-app, so they are readable before sign-up and offline. */
export function LegalFooterLinks({ className }: LegalFooterLinksProps) {
  const { t } = useAppTranslation('common');
  const [open, setOpen] = useState<LegalDocumentId | null>(null);

  return (
    <View className={`flex-row flex-wrap items-center justify-center gap-x-2 gap-y-1 ${className ?? ''}`}>
      <Text variant="caption" color="secondary" accessibilityRole="link" onPress={() => setOpen('privacy-policy')}>
        {t('privacyPolicy')}
      </Text>
      <Text variant="caption" color="secondary">
        ·
      </Text>
      <Text variant="caption" color="secondary" accessibilityRole="link" onPress={() => setOpen('terms-of-service')}>
        {t('termsOfService')}
      </Text>
      <LegalDocumentModal documentId={open} onClose={() => setOpen(null)} />
    </View>
  );
}

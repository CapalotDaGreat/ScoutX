import { View } from 'react-native';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type AccountUpgradePromptProps = {
  visible: boolean;
  onDismiss: () => void;
  onCreateAccount: () => void;
  onSignIn: () => void;
};

export function AccountUpgradePrompt({
  visible,
  onDismiss,
  onCreateAccount,
  onSignIn,
}: AccountUpgradePromptProps) {
  const { t } = useAppTranslation('auth');

  return (
    <Modal
      visible={visible}
      onClose={onDismiss}
      title={t('accountUpgrade.title')}
      size="md"
      footer={
        <View className="gap-3">
          <Button variant="accent" onPress={onCreateAccount}>
            {t('accountUpgrade.createAccount')}
          </Button>
          <Button variant="secondary" onPress={onSignIn}>
            {t('accountUpgrade.signIn')}
          </Button>
          <Button variant="ghost" onPress={onDismiss}>
            {t('accountUpgrade.later')}
          </Button>
        </View>
      }
    >
      <Text variant="body-sm" color="secondary">
        {t('accountUpgrade.description')}
      </Text>
    </Modal>
  );
}

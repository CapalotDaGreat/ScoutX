import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/primitives/Button';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import type { AccountDeletionUiError } from '@/features/auth/hooks/useAccountDeletion';
import type { ReauthMethod } from '@/features/auth/services/reauthService';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

const ERROR_KEYS = {
  failed: 'deletion.errors.failed',
  wrong_password: 'deletion.errors.wrongPassword',
  wrong_account: 'deletion.errors.wrongAccount',
  too_many_attempts: 'deletion.errors.tooManyAttempts',
} as const satisfies Record<AccountDeletionUiError, string>;

const PROVIDER_KEYS = {
  'apple.com': 'deletion.reauth.apple',
  'google.com': 'deletion.reauth.google',
} as const satisfies Record<Exclude<ReauthMethod, 'password'>, string>;

export function deletionErrorKey(error: AccountDeletionUiError) {
  return ERROR_KEYS[error];
}

type Props = {
  visible: boolean;
  methods: ReauthMethod[];
  busy: boolean;
  error: AccountDeletionUiError | null;
  onConfirm: (method: ReauthMethod, password?: string) => void;
  onCancel: () => void;
};

export function DeleteAccountReauthModal({ visible, methods, busy, error, onConfirm, onCancel }: Props) {
  const { t } = useAppTranslation('auth');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (!visible) setPassword('');
  }, [visible]);

  const hasPassword = methods.includes('password');
  const providers = methods.filter((method): method is Exclude<ReauthMethod, 'password'> => method !== 'password');

  return (
    <Modal visible={visible} onClose={onCancel} title={t('deletion.reauth.title')} size="md">
      <View className="gap-3" testID="delete-account-reauth">
        <Text variant="body-sm" color="secondary">
          {t('deletion.reauth.body')}
        </Text>
        {hasPassword ? (
          <>
            <Input
              label={t('deletion.reauth.passwordLabel')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="current-password"
              textContentType="password"
              editable={!busy}
              testID="delete-account-reauth-password"
            />
            <Button
              variant="destructive"
              loading={busy}
              disabled={busy || password.length === 0}
              onPress={() => onConfirm('password', password)}
              testID="delete-account-reauth-confirm"
            >
              {t('deletion.reauth.confirmPassword')}
            </Button>
          </>
        ) : null}
        {providers.map((method) => (
          <Button key={method} variant="secondary" loading={busy} disabled={busy} onPress={() => onConfirm(method)}>
            {t(PROVIDER_KEYS[method])}
          </Button>
        ))}
        {methods.length === 0 ? (
          <Text variant="body-sm" color="warning">
            {t('deletion.reauth.noMethod')}
          </Text>
        ) : null}
        {error ? (
          <Text variant="body-sm" color="error" testID="delete-account-reauth-error">
            {t(ERROR_KEYS[error])}
          </Text>
        ) : null}
        <Button variant="ghost" onPress={onCancel} disabled={busy}>
          {t('deletion.reauth.cancel')}
        </Button>
      </View>
    </Modal>
  );
}

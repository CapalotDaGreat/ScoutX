import { useState } from 'react';
import { Alert, Switch, View } from 'react-native';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { LegalFooterLinks } from '@/components/legal/LegalFooterLinks';
import { Card } from '@/components/primitives/Card';
import { deleteCurrentAccount } from '@/features/auth/services/accountService';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { useNotificationPreferences } from '@/features/notifications/hooks/useNotificationPreferences';
import { LanguageSettingsSection } from '@/features/settings/components/LanguageSettingsSection';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { type AuthRole } from '@/features/auth/types';

export type SettingsScreenProps = {
  onBack: () => void;
  onSignOut: () => void;
};

function formatRole(
  role: AuthRole | null | undefined,
  t: ReturnType<typeof useAppTranslation>['t'],
): string {
  if (!role || role === 'guest') {
    return t('guest', { ns: 'common' });
  }
  if (role === 'coach') {
    return t('scout', { ns: 'common' });
  }
  if (role === 'player') {
    return t('player', { ns: 'common' });
  }
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function SettingsScreen({ onBack, onSignOut }: SettingsScreenProps) {
  const { t } = useAppTranslation(['settings', 'common', 'auth', 'errors']);
  const { user, role } = useAuth();
  const {
    pushEnabled,
    hasToken,
    isLoading: notificationsLoading,
    isUpdating,
    setPushPreference,
  } = useNotificationPreferences(user?.uid);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDeleteAccount = () => {
    if (!user?.uid || user.isAnonymous) {
      return;
    }

    Alert.alert(t('deleteAccountTitle'), t('deleteAccountMessage'), [
      { text: t('cancel', { ns: 'common' }), style: 'cancel' },
      {
        text: t('delete', { ns: 'common' }),
        style: 'destructive',
        onPress: () => {
          setIsDeleting(true);
          setDeleteError(null);
          void deleteCurrentAccount(user.uid)
            .catch((error) => {
              setDeleteError(
                error instanceof Error ? error.message : t('errors:deleteAccount'),
              );
            })
            .finally(() => {
              setIsDeleting(false);
            });
        },
      },
    ]);
  };

  return (
    <Screen
      title={t('settings:title')}
      subtitle={t('settings:subtitle')}
      safeArea
      footer={
        <View className="gap-2">
          <Button variant="ghost" onPress={onSignOut}>
            {t('auth:signOut')}
          </Button>
          <Button variant="secondary" onPress={onBack} fullWidth>
            {t('common:back')}
          </Button>
        </View>
      }
    >
      <View className="gap-4">
        <Card variant="outlined" padding="md" className="gap-2">
          <Text variant="overline" color="secondary">
            {t('settings:account')}
          </Text>
          <Text weight="semibold">{user?.name ?? t('common:scoutXUser')}</Text>
          {user?.email ? (
            <Text variant="body-sm" color="secondary">
              {user.email}
            </Text>
          ) : null}
          <Text variant="caption" color="secondary">
            {t('common:roleLabel')} · {formatRole(role, t)}
          </Text>
        </Card>

        <Card variant="outlined" padding="md" className="gap-3">
          <Text variant="overline" color="secondary">
            {t('settings:language')}
          </Text>
          <LanguageSettingsSection />
        </Card>

        <Card variant="outlined" padding="md" className="gap-3">
          <Text variant="overline" color="secondary">
            {t('settings:notifications')}
          </Text>
          <Text variant="body-sm" color="secondary">
            {t('settings:notificationsDescription')}
          </Text>
          <View className="flex-row items-center justify-between gap-3">
            <View className="flex-1">
              <Text weight="semibold">{t('settings:pushNotifications')}</Text>
              <Text variant="caption" color="secondary">
                {notificationsLoading
                  ? t('settings:pushChecking')
                  : hasToken
                    ? t('settings:pushRegistered')
                    : t('settings:pushNotRegistered')}
              </Text>
            </View>
            <Switch
              value={pushEnabled && hasToken}
              disabled={notificationsLoading || isUpdating || !user?.uid}
              onValueChange={(value) => void setPushPreference(value)}
            />
          </View>
        </Card>

        <Card variant="outlined" padding="md" className="gap-2">
          <Text variant="overline" color="secondary">
            {t('settings:legal')}
          </Text>
          <LegalFooterLinks />
        </Card>

        {!user?.isAnonymous ? (
          <Card variant="outlined" padding="md" className="gap-3">
            <Text variant="overline" color="secondary">
              {t('settings:dangerZone')}
            </Text>
            <Text variant="body-sm" color="secondary">
              {t('settings:deleteAccountDescription')}
            </Text>
            {deleteError ? (
              <Text variant="body-sm" color="error">
                {deleteError}
              </Text>
            ) : null}
            <Button variant="ghost" loading={isDeleting} onPress={handleDeleteAccount}>
              {t('settings:deleteAccount')}
            </Button>
          </Card>
        ) : null}
      </View>
    </Screen>
  );
}

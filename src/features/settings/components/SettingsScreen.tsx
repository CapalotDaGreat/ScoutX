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
import { type AuthRole } from '@/features/auth/types';

export type SettingsScreenProps = {
  onBack: () => void;
  onSignOut: () => void;
};

function formatRole(role: AuthRole | null | undefined): string {
  if (!role || role === 'guest') {
    return 'Guest';
  }
  if (role === 'coach') {
    return 'Scout';
  }
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function SettingsScreen({ onBack, onSignOut }: SettingsScreenProps) {
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

    Alert.alert(
      'Delete account',
      'This permanently removes your ScoutX account, profile, and push settings. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setIsDeleting(true);
            setDeleteError(null);
            void deleteCurrentAccount(user.uid)
              .catch((error) => {
                setDeleteError(error instanceof Error ? error.message : 'Unable to delete account.');
              })
              .finally(() => {
                setIsDeleting(false);
              });
          },
        },
      ],
    );
  };

  return (
    <Screen
      title="Settings"
      subtitle="Account, notifications, and legal"
      safeArea
      footer={
        <View className="gap-2">
          <Button variant="ghost" onPress={onSignOut}>
            Sign out
          </Button>
          <Button variant="secondary" onPress={onBack} fullWidth>
            Back
          </Button>
        </View>
      }
    >
      <View className="gap-4">
        <Card variant="outlined" padding="md" className="gap-2">
          <Text variant="overline" color="secondary">
            Account
          </Text>
          <Text weight="semibold">{user?.name ?? 'ScoutX user'}</Text>
          {user?.email ? (
            <Text variant="body-sm" color="secondary">
              {user.email}
            </Text>
          ) : null}
          <Text variant="caption" color="secondary">
            Role · {formatRole(role)}
          </Text>
        </Card>

        <Card variant="outlined" padding="md" className="gap-3">
          <Text variant="overline" color="secondary">
            Notifications
          </Text>
          <Text variant="body-sm" color="secondary">
            Push alerts for portfolio views, endorsements, trials, and weekly reports.
          </Text>
          <View className="flex-row items-center justify-between gap-3">
            <View className="flex-1">
              <Text weight="semibold">Push notifications</Text>
              <Text variant="caption" color="secondary">
                {notificationsLoading
                  ? 'Checking status…'
                  : hasToken
                    ? 'Registered on this device'
                    : 'Not registered on this device'}
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
            Legal
          </Text>
          <LegalFooterLinks />
        </Card>

        {!user?.isAnonymous ? (
          <Card variant="outlined" padding="md" className="gap-3">
            <Text variant="overline" color="secondary">
              Danger zone
            </Text>
            <Text variant="body-sm" color="secondary">
              Permanently delete your ScoutX account and profile data.
            </Text>
            {deleteError ? (
              <Text variant="body-sm" color="error">
                {deleteError}
              </Text>
            ) : null}
            <Button variant="ghost" loading={isDeleting} onPress={handleDeleteAccount}>
              Delete account
            </Button>
          </Card>
        ) : null}
      </View>
    </Screen>
  );
}

import { useState } from 'react';
import { Alert, Linking, Switch, View } from 'react-native';
import Constants from 'expo-constants';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { LegalFooterLinks } from '@/components/legal/LegalFooterLinks';
import { Card } from '@/components/primitives/Card';
import { SafetySettingsSection } from '@/features/youth-safety/components/SafetySettingsSection';
import { useUserSafety } from '@/features/youth-safety/context/UserSafetyProvider';
import { DeleteAccountReauthModal, deletionErrorKey } from '@/features/auth/components/DeleteAccountReauthModal';
import { useAccountDeletion } from '@/features/auth/hooks/useAccountDeletion';
import { DeletionProgressCard } from '@/features/data-rights/components/DeletionProgressCard';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { useNotificationPreferences } from '@/features/notifications/hooks/useNotificationPreferences';
import { NOTIFICATION_CATEGORIES } from '@/features/notifications/services/notificationPreferencesService';
import { AppearanceSettingsSection } from '@/features/settings/components/AppearanceSettingsSection';
import { LanguageSettingsSection } from '@/features/settings/components/LanguageSettingsSection';
import { ChangePasswordSection } from '@/features/settings/components/ChangePasswordSection';
import { LinkAppleAccountSection } from '@/features/settings/components/LinkAppleAccountSection';
import { LinkGoogleAccountSection } from '@/features/settings/components/LinkGoogleAccountSection';
import { isAppleSignInSupportedPlatform } from '@/features/auth/services/appleAuthService';
import { isGoogleSignInSupportedPlatform } from '@/features/auth/services/googleAuthService';
import { LEGAL_CONFIG } from '@/config/legalConfig';
import { PortfolioPrivacySettings } from '@/features/public-portfolio';
import { type PrivacySettings } from '@/features/player-profile/types/privacySettings';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { type AuthRole } from '@/features/auth/types';
import { toUserMessage } from '@/utils/userFacingError';

export type SettingsScreenProps = {
  onBack: () => void;
  onSignOut: () => void;
  onOpenPrivacyCenter?: () => void;
  onOpenPlan?: () => void;
  /** Player portfolio & discovery privacy. When provided, editable toggles are shown here. */
  privacySettings?: PrivacySettings | null;
  onPrivacyChange?: (next: PrivacySettings) => void | Promise<void>;
  privacyDisabled?: boolean;
};

function formatRole(
  role: AuthRole | null | undefined,
  t: ReturnType<typeof useAppTranslation>['t'],
): string {
  if (!role || role === 'guest') {
    return t('guest', { ns: 'common' });
  }
  if (role === 'coach') {
    return t('coach', { ns: 'common' });
  }
  if (role === 'player') {
    return t('player', { ns: 'common' });
  }
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function getAppVersion(): string {
  return (
    Constants.expoConfig?.version ??
    Constants.nativeAppVersion ??
    '1.0.0'
  );
}

export function SettingsScreen({
  onBack,
  onSignOut,
  onOpenPrivacyCenter,
  onOpenPlan,
  privacySettings = null,
  onPrivacyChange,
  privacyDisabled = false,
}: SettingsScreenProps) {
  const { t } = useAppTranslation(['settings', 'common', 'auth', 'errors', 'legal', 'premium']);
  const { user, role, beginUpgrade } = useAuth();
  const {
    pushEnabled,
    categories,
    hasToken,
    isLoading: notificationsLoading,
    isUpdating,
    setPushPreference,
    setCategoryPreference,
    lockScreenPreview,
    setLockScreenPreference,
  } = useNotificationPreferences(user?.uid);
  const { policy: safetyPolicy } = useUserSafety();
  const deletion = useAccountDeletion(user && !user.isAnonymous ? user.uid : null);
  const appVersion = getAppVersion();

  const handleDeleteAccount = () => {
    if (!user?.uid || user.isAnonymous) {
      return;
    }

    Alert.alert(t('deleteAccountTitle'), t('deleteAccountMessage'), [
      { text: t('cancel', { ns: 'common' }), style: 'cancel' },
      {
        text: t('delete', { ns: 'common' }),
        style: 'destructive',
        onPress: () => void deletion.run(),
      },
    ]);
  };

  const supportEmail = LEGAL_CONFIG.contacts.supportEmail;
  const handleSupport = () => {
    if (supportEmail) void Linking.openURL(`mailto:${supportEmail}?subject=PitchProof%20Support`);
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
      <View className="gap-6">
        <Card variant="elevated" padding="md" className="gap-2">
          <Text variant="overline" color="secondary">
            {t('settings:account')}
          </Text>
          <Text weight="semibold">{user?.name ?? t('common:appUser')}</Text>
          {user?.email ? (
            <Text variant="body-sm" color="secondary">
              {user.email}
            </Text>
          ) : null}
          <Text variant="caption" color="secondary">
            {t('common:roleLabel')} · {formatRole(role, t)}
          </Text>
          {user?.isAnonymous ? (
            <View className="gap-2 pt-2">
              <Text variant="body-sm" color="secondary">
                {t('settings:guestAccountHint')}
              </Text>
              <Button onPress={() => beginUpgrade('register')} fullWidth>
                {t('auth:welcome.createAccount')}
              </Button>
              <Button variant="secondary" onPress={() => beginUpgrade('login')} fullWidth>
                {t('auth:welcome.signIn')}
              </Button>
            </View>
          ) : null}
        </Card>

        <Card variant="elevated" padding="md" className="gap-3">
          <Text variant="overline" color="secondary">
            {t('settings:appearance')}
          </Text>
          <AppearanceSettingsSection />
        </Card>

        <Card variant="elevated" padding="md" className="gap-3">
          <Text variant="overline" color="secondary">
            {t('settings:language')}
          </Text>
          <LanguageSettingsSection />
        </Card>

        <SafetySettingsSection />

        {!user?.isAnonymous ? (
          <Card variant="elevated" padding="md" className="gap-3">
            <Text variant="overline" color="secondary">
              {t('settings:security')}
            </Text>
            {user?.email ? <ChangePasswordSection email={user.email} /> : null}
            {isGoogleSignInSupportedPlatform() ? <LinkGoogleAccountSection /> : null}
            {isAppleSignInSupportedPlatform() ? <LinkAppleAccountSection /> : null}
          </Card>
        ) : null}

        <Card variant="elevated" padding="md" className="gap-3">
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
              accessibilityLabel={t('settings:pushNotifications')}
            />
          </View>
          {pushEnabled && hasToken
            ? NOTIFICATION_CATEGORIES.map((category) => (
                <View key={category} className="flex-row items-center justify-between gap-3">
                  <Text className="flex-1">{t(`settings:category.${category}`)}</Text>
                  <Switch
                    value={categories[category]}
                    disabled={isUpdating || !user?.uid}
                    onValueChange={(value) => void setCategoryPreference(category, value)}
                    accessibilityLabel={t(`settings:category.${category}`)}
                  />
                </View>
              ))
            : null}
          {pushEnabled && hasToken ? (
            <View className="flex-row items-center justify-between gap-3" testID="lock-screen-preview">
              <View className="flex-1">
                <Text weight="semibold">{t('settings:lockScreen.title')}</Text>
                <Text variant="caption" color="secondary">
                  {safetyPolicy.genericLockScreenOnly ? t('settings:lockScreen.youth') : t('settings:lockScreen.hint')}
                </Text>
              </View>
              <Switch
                value={!safetyPolicy.genericLockScreenOnly && lockScreenPreview === 'details'}
                disabled={safetyPolicy.genericLockScreenOnly || isUpdating || !user?.uid}
                onValueChange={(value) => void setLockScreenPreference(value ? 'details' : 'generic')}
                accessibilityLabel={t('settings:lockScreen.title')}
              />
            </View>
          ) : null}
        </Card>

        <Card variant="elevated" padding="md" className="gap-3">
          <Text variant="overline" color="secondary">
            {t('settings:privacyData')}
          </Text>
          {privacySettings && onPrivacyChange ? (
            <PortfolioPrivacySettings
              settings={privacySettings}
              onChange={(next) => {
                void onPrivacyChange(next);
              }}
              disabled={privacyDisabled}
            />
          ) : (
            <Text variant="body-sm" color="secondary">
              {t('settings:privacyDataDescription')}
            </Text>
          )}
          {onOpenPrivacyCenter && !user?.isAnonymous ? (
            <Button variant="secondary" onPress={onOpenPrivacyCenter} testID="settings-open-privacy-center">
              {t('legal:centerTitle')}
            </Button>
          ) : null}
          {onOpenPlan && !user?.isAnonymous ? (
            <Button variant="secondary" onPress={onOpenPlan} testID="settings-open-plan">
              {t('premium:openPlan')}
            </Button>
          ) : null}
        </Card>

        <Card variant="elevated" padding="md" className="gap-3">
          <Text variant="overline" color="secondary">
            {t('settings:about')}
          </Text>
          <Text weight="semibold">{t('settings:aboutAppName')}</Text>
          <Text variant="body-sm" color="secondary">
            {t('settings:aboutVersion', { version: appVersion })}
          </Text>
          <Text variant="body-sm" color="secondary">
            {t('settings:aboutDescription')}
          </Text>
          {supportEmail ? (
            <Button variant="secondary" onPress={handleSupport}>
              {t('settings:contactSupport')}
            </Button>
          ) : null}
        </Card>

        <Card variant="elevated" padding="md" className="gap-2">
          <Text variant="overline" color="secondary">
            {t('settings:legal')}
          </Text>
          <LegalFooterLinks />
        </Card>

        {!user?.isAnonymous ? (
          <Card variant="elevated" padding="md" className="gap-3">
            <Text variant="overline" color="secondary">
              {t('settings:dangerZone')}
            </Text>
            <Text variant="body-sm" color="secondary">
              {t('settings:deleteAccountDescription')}
            </Text>
            {deletion.phase === 'deleting' && user?.uid ? <DeletionProgressCard uid={user.uid} /> : null}
            {deletion.error && deletion.phase === 'idle' ? (
              <View className="gap-2" testID="delete-account-error">
                <Text variant="body-sm" color="error">
                  {t(`auth:${deletionErrorKey(deletion.error)}`)}
                </Text>
                <Button variant="secondary" onPress={() => void deletion.run()}>
                  {t('auth:deletion.retry')}
                </Button>
              </View>
            ) : null}
            <Button variant="ghost" loading={deletion.busy} onPress={handleDeleteAccount}>
              {t('settings:deleteAccount')}
            </Button>
            <DeleteAccountReauthModal
              visible={deletion.phase === 'reauth' || deletion.phase === 'reauthenticating'}
              methods={deletion.methods}
              busy={deletion.phase === 'reauthenticating'}
              error={deletion.error}
              onConfirm={(method, password) => void deletion.confirmReauth(method, password)}
              onCancel={deletion.cancelReauth}
            />
          </Card>
        ) : null}
      </View>
    </Screen>
  );
}

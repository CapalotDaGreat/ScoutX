import { useState } from 'react';
import { Alert, View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { useUserSafety } from '@/features/youth-safety/context/UserSafetyProvider';
import { YOUTH_SCOPES } from '@/features/youth-safety/policy';
import { UserSafetyRepository } from '@/features/youth-safety/repositories/UserSafetyRepository';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { toUserMessage } from '@/utils/userFacingError';

/** Age group, guardian approval and allowed scopes, with player-side withdrawal. */
export function SafetySettingsSection() {
  const { t } = useAppTranslation(['safety', 'common']);
  const { gated, record, policy } = useUserSafety();
  const [busy, setBusy] = useState(false);

  if (!gated || !record) return null;

  const granted = YOUTH_SCOPES.filter((scope) => record.scopes.includes(scope));

  const revoke = () => {
    Alert.alert(t('safety:settings.revoke'), t('safety:settings.revokeHint'), [
      { text: t('common:cancel'), style: 'cancel' },
      {
        text: t('safety:settings.revoke'),
        style: 'destructive',
        onPress: () => {
          setBusy(true);
          void UserSafetyRepository.revokeGuardianConsent()
            .catch((error: unknown) => Alert.alert(t('common:errorTitle'), toUserMessage(error, t('safety:errors.generic'))))
            .finally(() => setBusy(false));
        },
      },
    ]);
  };

  return (
    <Card variant="elevated" padding="md" className="gap-3" testID="settings-safety">
      <Text variant="overline" color="secondary">
        {t('safety:settings.title')}
      </Text>
      <Text weight="semibold">{policy.isMinor ? t('safety:settings.ageTeen') : t('safety:settings.ageAdult')}</Text>
      {policy.isMinor && record.guardianStatus === 'approved' ? (
        <View className="gap-2">
          <Text variant="body-sm" color="secondary">
            {t('safety:settings.guardianApproved', { email: record.guardianEmailMasked ?? '' })}
          </Text>
          <Text variant="label" color="secondary">
            {t('safety:settings.scopesTitle')}
          </Text>
          <Text variant="body-sm">
            {granted.length > 0
              ? granted.map((scope) => t(`safety:settings.scope.${scope}`)).join(' · ')
              : t('safety:settings.noScopes')}
          </Text>
          <Button variant="destructive" loading={busy} onPress={revoke}>
            {t('safety:settings.revoke')}
          </Button>
          <Text variant="caption" color="tertiary">
            {t('safety:settings.revokeHint')}
          </Text>
        </View>
      ) : null}
      <Text variant="caption" color="tertiary">
        {t('safety:settings.changeAge')}
      </Text>
    </Card>
  );
}

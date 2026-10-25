import { Alert, View } from 'react-native';
import { Ban, ShieldOff } from 'lucide-react-native';
import { Button } from '@/components/primitives/Button';
import { ReportContentButton } from '@/features/trust-safety/components/ReportContentButton';
import { useBlockedUsers } from '@/features/trust-safety/hooks/useBlockedUsers';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { useTheme } from '@/theme';

export type TrustSafetyActionsProps = {
  targetUserId: string;
  targetUserName: string;
  /** Hide actions when viewing your own profile. */
  hideWhenSelf?: boolean;
  /** Adds the video/Passport report (including "I appear in this video") on Passport views. */
  includePassportReport?: boolean;
};

/**
 * Report + block/unblock controls for player profiles and public passports.
 */
export function TrustSafetyActions({
  targetUserId,
  targetUserName,
  hideWhenSelf = true,
  includePassportReport = false,
}: TrustSafetyActionsProps) {
  const { colors } = useTheme();
  const { t } = useAppTranslation(['trust', 'common', 'errors']);
  const { user } = useAuth();
  const blockerId = user?.id ?? null;
  const { isUserBlocked, blockUser, unblockUser, isLoading, error, refresh } = useBlockedUsers(blockerId);

  if (!blockerId || (hideWhenSelf && blockerId === targetUserId)) {
    return null;
  }

  const blocked = isUserBlocked(targetUserId);

  const handleBlockToggle = () => {
    if (blocked) {
      Alert.alert(t('trust:block.unblockTitle'), t('trust:block.unblockBody', { name: targetUserName }), [
        { text: t('trust:block.cancel'), style: 'cancel' },
        {
          text: t('trust:block.unblock'),
          onPress: () => {
            void unblockUser(targetUserId).catch(() => Alert.alert(t('trust:block.unblockTitle'), t('errors:saveFailed')));
          },
        },
      ]);
      return;
    }

    Alert.alert(
      t('trust:block.blockTitle'),
      t('trust:block.blockBody', { name: targetUserName }),
      [
        { text: t('trust:block.cancel'), style: 'cancel' },
        {
          text: t('trust:block.block'),
          style: 'destructive',
          onPress: () => {
            void blockUser(targetUserId, targetUserName).catch(() => Alert.alert(t('trust:block.blockTitle'), t('errors:saveFailed')));
          },
        },
      ],
    );
  };

  return (
    <View className="w-full min-w-0 flex-row flex-wrap items-center gap-2">
      <ReportContentButton
        targetType="user"
        targetId={targetUserId}
        label={t('trust:report.profileButton')}
      />
      {includePassportReport ? (
        <ReportContentButton
          targetType="passport"
          targetId={targetUserId}
          label={t('trust:report.passportButton')}
          testID="report-passport-video"
        />
      ) : null}
      <Button
        disabled={isLoading || Boolean(error)}
        variant="ghost"
        size="sm"
        leftIcon={
          blocked ? (
            <ShieldOff size={14} color={colors.textSecondary} />
          ) : (
            <Ban size={14} color={colors.error} />
          )
        }
        onPress={handleBlockToggle}
      >
        {blocked ? t('trust:block.unblock') : t('trust:block.block')}
      </Button>
      {error ? <Button variant="ghost" size="sm" onPress={() => { void refresh(); }}>{t('common:retry')}</Button> : null}
    </View>
  );
}

import { Alert, View } from 'react-native';
import { Ban, ShieldOff } from 'lucide-react-native';
import { Button } from '@/components/primitives/Button';
import { ReportContentButton } from '@/features/trust-safety/components/ReportContentButton';
import { useBlockedUsers } from '@/features/trust-safety/hooks/useBlockedUsers';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { useTheme } from '@/theme';

export type TrustSafetyActionsProps = {
  targetUserId: string;
  targetUserName: string;
  /** Hide actions when viewing your own profile. */
  hideWhenSelf?: boolean;
};

/**
 * Report + block/unblock controls for player profiles and public passports.
 */
export function TrustSafetyActions({
  targetUserId,
  targetUserName,
  hideWhenSelf = true,
}: TrustSafetyActionsProps) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const blockerId = user?.id ?? null;
  const { isUserBlocked, blockUser, unblockUser } = useBlockedUsers(blockerId);

  if (!blockerId || (hideWhenSelf && blockerId === targetUserId)) {
    return null;
  }

  const blocked = isUserBlocked(targetUserId);

  const handleBlockToggle = () => {
    if (blocked) {
      Alert.alert('Unblock player?', `Allow ${targetUserName} to appear in your discovery again.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          onPress: () => {
            void unblockUser(targetUserId);
          },
        },
      ]);
      return;
    }

    Alert.alert(
      'Block player?',
      `${targetUserName} will be hidden from your discovery lists. You can unblock them later.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: () => {
            void blockUser(targetUserId, targetUserName);
          },
        },
      ],
    );
  };

  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <ReportContentButton targetType="user" targetId={targetUserId} label="Report profile" />
      <Button
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
        {blocked ? 'Unblock' : 'Block'}
      </Button>
    </View>
  );
}

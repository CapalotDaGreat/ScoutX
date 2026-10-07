import { type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { CalendarDays, MapPin, UserRound } from 'lucide-react-native';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { TrialStatusBadge } from '@/features/trial-invitations/components/TrialStatusBadge';
import { formatTrialDate } from '@/features/trial-invitations/models/TrialInvitationModel';
import { type TrialInvitation } from '@/features/trial-invitations/types';
import { useTheme } from '@/theme';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type TrialInvitationCardProps = {
  invitation: TrialInvitation;
  index?: number;
  onPress?: (invitation: TrialInvitation) => void;
  footer?: ReactNode;
};

export function TrialInvitationCard({
  invitation,
  index = 0,
  onPress,
  footer,
}: TrialInvitationCardProps) {
  const { colors } = useTheme();
  const { t, i18n } = useAppTranslation('trials');

  return (
    <Animated.View entering={FadeInUp.delay(Math.min(index, 6) * 40).duration(320)}>
      <Card
        variant="outlined"
        padding="md"
        interactive={Boolean(onPress)}
        onPress={onPress ? () => onPress(invitation) : undefined}
        className="gap-3 border-accent/15/30"
      >
        <View className="flex-row items-start justify-between gap-2">
          <View className="flex-1 gap-1">
            <Text variant="overline" color="accent">
              {t('card.overline')}
            </Text>
            <Text weight="semibold">{invitation.club}</Text>
            <Text variant="body-sm" color="secondary">
              {t('card.playerScout', { player: invitation.playerName, scout: invitation.scoutName })}
            </Text>
          </View>
          <TrialStatusBadge status={invitation.status} />
        </View>

        <View className="gap-2">
          <View className="flex-row items-center gap-2">
            <CalendarDays size={14} color={colors.textSecondary} />
            <Text variant="body-sm">{formatTrialDate(invitation.scheduledDate, i18n.language)}</Text>
          </View>
          <View className="flex-row items-center gap-2">
            <MapPin size={14} color={colors.textSecondary} />
            <Text variant="body-sm" color="secondary" className="flex-1">
              {invitation.location}
            </Text>
          </View>
          <View className="flex-row items-center gap-2">
            <UserRound size={14} color={colors.textSecondary} />
            <Text variant="body-sm" color="secondary">
              {t('card.coach', { coach: invitation.coach })}
            </Text>
          </View>
        </View>

        {invitation.notes ? (
          <Text variant="body-sm" color="secondary" numberOfLines={3}>
            {invitation.notes}
          </Text>
        ) : null}

        {footer}
      </Card>
    </Animated.View>
  );
}

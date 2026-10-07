import { CommonActions, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Link2Off } from 'lucide-react-native';
import { Screen } from '@/components/layout/Screen';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { useTheme } from '@/theme';
import { type DeepLinkUnavailableReason } from '@/navigation/deepLinkResolver';
import { type RootStackParamList } from '@/navigation/types';

const REASONS: readonly DeepLinkUnavailableReason[] = [
  'wrong_role',
  'invalid',
  'not_found',
  'private',
  'expired',
];

export function LinkUnavailableScreen() {
  const { t } = useAppTranslation('common');
  const { colors } = useTheme();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'LinkUnavailable'>>();
  const { status, role, isGuest } = useAuth();
  const raw = route.params?.reason;
  const reason: DeepLinkUnavailableReason = REASONS.includes(raw as DeepLinkUnavailableReason)
    ? (raw as DeepLinkUnavailableReason)
    : 'invalid';

  const goHome = () => {
    const name: keyof RootStackParamList =
      status !== 'authenticated'
        ? 'Auth'
        : isGuest
          ? 'PlayerApp'
          : role === 'scout' || role === 'coach'
            ? 'ScoutApp'
            : 'PlayerApp';
    navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name }] }));
  };

  return (
    <Screen scrollable={false}>
      <EmptyState
        icon={<Link2Off size={48} color={colors.textSecondary} strokeWidth={1.5} />}
        title={t(`deepLink.${reason}.title`)}
        description={t(`deepLink.${reason}.body`)}
        actionLabel={t('deepLink.goHome')}
        onAction={goHome}
      />
    </Screen>
  );
}

import { CommonActions, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { ShieldCheck } from 'lucide-react-native';
import { Linking, View } from 'react-native';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { getAppLinkHost } from '@/config/deepLinking';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { isGuardianToken } from '@/navigation/deepLinkResolver';
import { type RootStackParamList } from '@/navigation/types';
import { useTheme } from '@/theme';

/**
 * Guardian approval links opened inside the app. The decision is made on the hosted page in
 * the browser so it never runs inside a child's signed-in session.
 */
export function GuardianLinkScreen() {
  const { t } = useAppTranslation('common');
  const { colors } = useTheme();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'GuardianLink'>>();
  const { status, role, isGuest } = useAuth();
  const token = route.params?.token;
  const valid = isGuardianToken(token);

  const goHome = () => {
    const name: keyof RootStackParamList =
      status !== 'authenticated'
        ? 'Auth'
        : !isGuest && (role === 'scout' || role === 'coach')
          ? 'ScoutApp'
          : 'PlayerApp';
    navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name }] }));
  };

  const openPage = () => {
    if (!valid) return;
    void Linking.openURL(`https://${getAppLinkHost()}/guardian/?t=${encodeURIComponent(token)}`);
  };

  return (
    <Screen title={t('guardianLink.title')} safeArea>
      <Card variant="outlined" padding="lg" className="gap-3" testID="guardian-link">
        <View className="flex-row items-center gap-2">
          <ShieldCheck size={22} color={colors.textSecondary} />
          <Text weight="semibold" className="flex-1">
            {valid ? t('guardianLink.heading') : t('deepLink.invalid.title')}
          </Text>
        </View>
        <Text variant="body-sm" color="secondary">
          {valid ? t('guardianLink.body') : t('deepLink.invalid.body')}
        </Text>
        {valid ? (
          <Button variant="accent" onPress={openPage} testID="guardian-link-open">
            {t('guardianLink.open')}
          </Button>
        ) : null}
        <Button variant="ghost" onPress={goHome}>
          {t('deepLink.goHome')}
        </Button>
      </Card>
    </Screen>
  );
}

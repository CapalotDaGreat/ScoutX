import { useState } from 'react';
import { CommonActions, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { ReportContentButton } from '@/features/trust-safety/components/ReportContentButton';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { isValidLinkId } from '@/navigation/deepLinkResolver';
import { type RootStackParamList } from '@/navigation/types';

/** Report a video from a link. The server checks the claimed owner before a case is opened. */
export function ReportLinkScreen() {
  const { t } = useAppTranslation('common');
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'ReportLink'>>();
  const { status, role, isGuest } = useAuth();
  const [submitted, setSubmitted] = useState(false);
  const ownerId = route.params?.ownerId;
  const mediaId = route.params?.mediaId;
  const valid = isValidLinkId(ownerId) && isValidLinkId(mediaId);

  const goHome = () => {
    const name: keyof RootStackParamList =
      status !== 'authenticated'
        ? 'Auth'
        : !isGuest && (role === 'scout' || role === 'coach')
          ? 'ScoutApp'
          : 'PlayerApp';
    navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name }] }));
  };

  return (
    <Screen title={t('reportLink.title')} safeArea>
      <Card variant="outlined" padding="lg" className="gap-3" testID="report-link">
        <Text variant="body-sm" color="secondary">
          {!valid ? t('deepLink.invalid.body') : submitted ? t('reportLink.done') : t('reportLink.body')}
        </Text>
        {valid && !submitted ? (
          <ReportContentButton
            targetType="media"
            targetId={mediaId}
            targetOwnerId={ownerId}
            label={t('reportLink.action')}
            initiallyOpen
            onSubmitted={() => setSubmitted(true)}
            testID="report-link-open"
          />
        ) : null}
        <Button variant="ghost" onPress={goHome}>
          {t('deepLink.goHome')}
        </Button>
      </Card>
    </Screen>
  );
}

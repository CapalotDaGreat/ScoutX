import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { ChoiceChip } from '@/components/primitives/ChoiceChip';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { DataRightsRepository } from '@/features/data-rights/repositories/DataRightsRepository';
import { PRIVACY_REQUEST_TYPES, type PrivacyRequest, type PrivacyRequestType } from '@/features/data-rights/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { toUserMessage } from '@/utils/userFacingError';

export function PrivacyRequestsSection() {
  const { t, i18n } = useAppTranslation(['legal', 'common']);
  const { user, isGuest } = useAuth();
  const uid = user && !isGuest ? user.uid : null;
  const [requests, setRequests] = useState<PrivacyRequest[]>([]);
  const [type, setType] = useState<PrivacyRequestType | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => (uid ? DataRightsRepository.subscribePrivacyRequests(uid, setRequests) : undefined), [uid]);

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString(i18n.language);

  const submit = () => {
    if (!type) return;
    setBusy(true);
    DataRightsRepository.submitPrivacyRequest(type, details)
      .then((result) => {
        Alert.alert(t('legal:dataRights.requests.sentTitle'), t('legal:dataRights.requests.sentBody', { date: formatDate(result.deadlineAt) }));
        setType(null);
        setDetails('');
      })
      .catch((error: unknown) => Alert.alert(t('common:errorTitle'), toUserMessage(error, t('legal:dataRights.requests.failed'))))
      .finally(() => setBusy(false));
  };

  if (!uid) return null;
  return (
    <View className="gap-2" testID="privacy-requests-section">
      <Text weight="semibold">{t('legal:dataRights.requests.title')}</Text>
      <Text variant="caption" color="secondary">
        {t('legal:dataRights.requests.body')}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {PRIVACY_REQUEST_TYPES.map((item) => (
          <ChoiceChip
            key={item}
            label={t(`legal:dataRights.requests.types.${item}`)}
            selected={type === item}
            onPress={() => setType(type === item ? null : item)}
            testID={`privacy-request-type-${item}`}
          />
        ))}
      </View>
      {type ? (
        <>
          <Text variant="caption" color="secondary">
            {t(`legal:dataRights.requests.hints.${type}`)}
          </Text>
          <Input
            value={details}
            onChangeText={setDetails}
            placeholder={t('legal:dataRights.requests.detailsPlaceholder')}
            multiline
            maxLength={2000}
            testID="privacy-request-details"
          />
          <Button variant="secondary" onPress={submit} disabled={busy} testID="privacy-request-submit">
            {t('legal:dataRights.requests.submit')}
          </Button>
        </>
      ) : null}
      {requests.map((request) => (
        <View key={request.id} className="gap-0.5" testID={`privacy-request-${request.id}`}>
          <Text variant="body-sm">
            {t(`legal:dataRights.requests.types.${request.type}`)} · {t(`legal:dataRights.requests.status.${request.status}`)}
          </Text>
          <Text variant="caption" color="secondary">
            {request.status === 'completed' || request.status === 'rejected'
              ? request.resolution ?? ''
              : t('legal:dataRights.requests.dueBy', { date: formatDate(request.deadlineAt) })}
          </Text>
        </View>
      ))}
    </View>
  );
}

import { useEffect, useState } from 'react';
import { Alert, Linking, View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { DataRightsRepository } from '@/features/data-rights/repositories/DataRightsRepository';
import { reasonOf, type DataExportJob } from '@/features/data-rights/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { toUserMessage } from '@/utils/userFacingError';

export function DataExportSection() {
  const { t, i18n } = useAppTranslation(['legal', 'common']);
  const { user, isGuest, signOut } = useAuth();
  const uid = user && !isGuest ? user.uid : null;
  const [jobs, setJobs] = useState<DataExportJob[]>([]);
  const [busy, setBusy] = useState(false);
  const [needsSignIn, setNeedsSignIn] = useState(false);

  useEffect(() => (uid ? DataRightsRepository.subscribeExports(uid, setJobs) : undefined), [uid]);

  const latest = jobs[0] ?? null;
  const working = latest?.status === 'queued' || latest?.status === 'building';
  const formatDate = (iso: string) => new Date(iso).toLocaleDateString(i18n.language);

  const request = () => {
    setBusy(true);
    setNeedsSignIn(false);
    DataRightsRepository.requestExport()
      .catch((error: unknown) => {
        if (reasonOf(error) === 'recent_login_required') setNeedsSignIn(true);
        else Alert.alert(t('common:errorTitle'), toUserMessage(error, t('legal:dataRights.export.failed')));
      })
      .finally(() => setBusy(false));
  };

  const download = (job: DataExportJob) => {
    setBusy(true);
    DataRightsRepository.downloadUrlFor(job)
      .then((url) => Linking.openURL(url))
      .catch((error: unknown) => Alert.alert(t('common:errorTitle'), toUserMessage(error, t('legal:dataRights.export.failed'))))
      .finally(() => setBusy(false));
  };

  if (!uid) return null;
  return (
    <View className="gap-2" testID="data-export-section">
      <Text weight="semibold">{t('legal:dataRights.export.title')}</Text>
      <Text variant="caption" color="secondary">
        {t('legal:dataRights.export.body')}
      </Text>
      {working ? (
        <Text variant="caption" color="secondary" testID="data-export-working">
          {t('legal:dataRights.export.working')}
        </Text>
      ) : null}
      {latest?.status === 'failed' ? (
        <Text variant="caption" color="error">
          {t('legal:dataRights.export.failed')}
        </Text>
      ) : null}
      {latest?.status === 'ready' && latest.expiresAt ? (
        <>
          <Text variant="caption" color="secondary">
            {t('legal:dataRights.export.ready', { date: formatDate(latest.expiresAt) })}
          </Text>
          <Button variant="secondary" onPress={() => download(latest)} disabled={busy} testID="data-export-download">
            {t('legal:dataRights.export.download')}
          </Button>
        </>
      ) : null}
      {needsSignIn ? (
        <View className="gap-2">
          <Text variant="caption" color="warning">
            {t('legal:dataRights.export.signInAgain')}
          </Text>
          <Button variant="ghost" onPress={() => void signOut()}>
            {t('legal:dataRights.export.signOut')}
          </Button>
        </View>
      ) : null}
      {!working && latest?.status !== 'ready' ? (
        <Button variant="secondary" onPress={request} disabled={busy} testID="data-export-request">
          {t('legal:dataRights.export.request')}
        </Button>
      ) : null}
    </View>
  );
}

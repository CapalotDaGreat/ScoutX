import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Heading } from '@/components/primitives/Heading';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import { DeleteAccountReauthModal, deletionErrorKey } from '@/features/auth/components/DeleteAccountReauthModal';
import { useAccountDeletion } from '@/features/auth/hooks/useAccountDeletion';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { useUserSafety } from '@/features/youth-safety/context/UserSafetyProvider';
import type { AgeBand } from '@/features/youth-safety/policy';
import { UserSafetyRepository } from '@/features/youth-safety/repositories/UserSafetyRepository';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { toUserMessage } from '@/utils/userFacingError';

function Shell({ children, testID }: { children: React.ReactNode; testID: string }) {
  return (
    <SafeAreaView className="absolute inset-0 z-30 bg-background" testID={testID}>
      <ScrollView contentContainerClassName="flex-grow justify-center gap-4 p-6" keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

function AgeBandStep({ onBlocked }: { onBlocked: () => void }) {
  const { t } = useAppTranslation('safety');
  const [choice, setChoice] = useState<AgeBand | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!choice) return;
    setBusy(true);
    setError(null);
    try {
      const result = await UserSafetyRepository.setAgeBand(choice);
      if (result.deleted) onBlocked();
    } catch (err) {
      setError(toUserMessage(err, t('errors.generic')));
    } finally {
      setBusy(false);
    }
  };

  const options: { band: AgeBand; label: string }[] = [
    { band: 'under13', label: t('age.under13') },
    { band: '13-17', label: t('age.teen') },
    { band: '18plus', label: t('age.adult') },
  ];

  return (
    <Shell testID="youth-gate-age">
      <Heading level={2}>{t('age.title')}</Heading>
      <Text variant="body" color="secondary">
        {t('age.body')}
      </Text>
      <View className="gap-2" accessibilityRole="radiogroup">
        {options.map((option) => (
          <Button
            key={option.band}
            variant={choice === option.band ? 'accent' : 'secondary'}
            accessibilityRole="radio"
            accessibilityState={{ selected: choice === option.band }}
            onPress={() => {
              setChoice(option.band);
              setConfirmed(false);
            }}
          >
            {option.label}
          </Button>
        ))}
      </View>
      {choice === 'under13' ? (
        <Card variant="outlined" padding="md">
          <Text variant="body-sm">{t('age.under13Notice')}</Text>
        </Card>
      ) : null}
      {choice === '13-17' ? (
        <Pressable
          className="flex-row items-start gap-3"
          accessibilityRole="checkbox"
          accessibilityState={{ checked: confirmed }}
          onPress={() => setConfirmed((value) => !value)}
        >
          <View className={`mt-1 h-5 w-5 rounded border ${confirmed ? 'border-accent bg-accent' : 'border-border'}`} />
          <Text variant="body-sm" className="flex-1">
            {t('age.teenConfirm')}
          </Text>
        </Pressable>
      ) : null}
      {error ? (
        <Text variant="body-sm" color="error">
          {error}
        </Text>
      ) : null}
      <Button
        variant="primary"
        loading={busy}
        disabled={!choice || (choice === '13-17' && !confirmed)}
        onPress={() => void submit()}
      >
        {choice === 'under13' ? t('age.under13Continue') : t('age.continue')}
      </Button>
      <Text variant="caption" color="tertiary">
        {t('age.noBirthDate')}
      </Text>
    </Shell>
  );
}

function GuardianStep({ resend }: { resend: boolean }) {
  const { t } = useAppTranslation('safety');
  const { t: tAuth } = useAppTranslation('auth');
  const { user, signOut } = useAuth();
  const { record } = useUserSafety();
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState((user?.name ?? '').split(' ')[0] ?? '');
  const [editing, setEditing] = useState(!resend);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deletion = useAccountDeletion(user?.uid);

  const status = record?.guardianStatus;

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await UserSafetyRepository.requestGuardianConsent(email.trim(), firstName.trim());
      setEditing(false);
    } catch (err) {
      setError(toUserMessage(err, t('errors.generic')));
    } finally {
      setBusy(false);
    }
  };

  if (status === 'pending' && !editing) {
    return (
      <Shell testID="youth-gate-waiting">
        <Heading level={2}>{t('guardian.waitingTitle')}</Heading>
        <Text variant="body" color="secondary">
          {t('guardian.waitingBody', { email: record?.guardianEmailMasked ?? '' })}
        </Text>
        <Card variant="outlined" padding="md" className="gap-2">
          <Text variant="body-sm">{t('guardian.whatHappens')}</Text>
        </Card>
        <Button variant="secondary" onPress={() => setEditing(true)}>
          {t('guardian.resend')}
        </Button>
        <Button variant="ghost" onPress={() => void signOut()}>
          {t('guardian.signOut')}
        </Button>
        <Button variant="ghost" loading={deletion.busy} onPress={() => void deletion.run()}>
          {t('guardian.deleteAccount')}
        </Button>
        {error ? (
          <Text variant="body-sm" color="error">
            {error}
          </Text>
        ) : null}
        {deletion.error && deletion.phase === 'idle' ? (
          <Text variant="body-sm" color="error" testID="youth-gate-delete-error">
            {tAuth(deletionErrorKey(deletion.error))}
          </Text>
        ) : null}
        <DeleteAccountReauthModal
          visible={deletion.phase === 'reauth' || deletion.phase === 'reauthenticating'}
          methods={deletion.methods}
          busy={deletion.phase === 'reauthenticating'}
          error={deletion.error}
          onConfirm={(method, password) => void deletion.confirmReauth(method, password)}
          onCancel={deletion.cancelReauth}
        />
      </Shell>
    );
  }

  const intro =
    status === 'declined'
      ? t('guardian.declinedBody')
      : status === 'revoked'
        ? t('guardian.revokedBody')
        : status === 'expired'
          ? t('guardian.expiredBody')
          : t('guardian.requestBody');

  return (
    <Shell testID="youth-gate-guardian">
      <Heading level={2}>{t('guardian.requestTitle')}</Heading>
      <Text variant="body" color="secondary">
        {intro}
      </Text>
      <Input
        label={t('guardian.firstNameLabel')}
        value={firstName}
        onChangeText={setFirstName}
        autoCapitalize="words"
        maxLength={40}
        testID="guardian-first-name"
      />
      <Input
        label={t('guardian.emailLabel')}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
        maxLength={254}
        testID="guardian-email"
      />
      <Text variant="caption" color="tertiary">
        {t('guardian.emailPrivacy')}
      </Text>
      {error ? (
        <Text variant="body-sm" color="error">
          {error}
        </Text>
      ) : null}
      <Button variant="primary" loading={busy} disabled={!email.includes('@')} onPress={() => void send()}>
        {t('guardian.send')}
      </Button>
      <Button variant="ghost" onPress={() => void signOut()}>
        {t('guardian.signOut')}
      </Button>
    </Shell>
  );
}

function Under13Notice({ onClose }: { onClose: () => void }) {
  const { t } = useAppTranslation('safety');
  return (
    <Shell testID="youth-gate-under13">
      <Heading level={2}>{t('under13.title')}</Heading>
      <Text variant="body" color="secondary">
        {t('under13.body')}
      </Text>
      <Button variant="secondary" onPress={onClose}>
        {t('under13.close')}
      </Button>
    </Shell>
  );
}

/** True while YouthGate covers the app, so later gates can wait their turn. */
export function useYouthGateActive(): boolean {
  const { gated, record, policy } = useUserSafety();
  return gated && (record === undefined || policy.needsAgeBand || policy.awaitingGuardian);
}

/**
 * Blocks the signed-in app until an age band is recorded and, for 13-17, until a guardian
 * approves. Under-13 accounts are deleted server-side and the user sees a notice.
 */
export function YouthGate() {
  const { gated, record, policy } = useUserSafety();
  const { signOut } = useAuth();
  const [blocked, setBlocked] = useState(false);

  if (blocked) {
    return <Under13Notice onClose={() => setBlocked(false)} />;
  }
  if (!gated) return null;
  if (record === undefined) {
    return (
      <View className="absolute inset-0 z-30 items-center justify-center bg-background" testID="youth-gate-loading">
        <ActivityIndicator />
      </View>
    );
  }
  if (policy.needsAgeBand) {
    return (
      <AgeBandStep
        onBlocked={() => {
          setBlocked(true);
          void signOut();
        }}
      />
    );
  }
  if (policy.awaitingGuardian) {
    return <GuardianStep resend={record?.guardianStatus === 'pending'} />;
  }
  return null;
}

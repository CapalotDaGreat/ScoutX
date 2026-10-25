import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/primitives/Button';
import { Heading } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { LegalDocumentModal } from '@/features/legal/components/LegalDocumentModal';
import { isReacceptance, pendingRequiredConsents } from '@/features/legal/consentModel';
import { useConsentSummary } from '@/features/legal/hooks/useConsentSummary';
import { ConsentRepository } from '@/features/legal/repositories/ConsentRepository';
import { REQUIRED_CONSENTS, type LegalDocumentId } from '@/features/legal/types';
import { useYouthGateActive } from '@/features/youth-safety/components/YouthGate';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { toUserMessage } from '@/utils/userFacingError';

/**
 * Asks signed-in accounts to accept the required documents at sign-up and again after a major
 * version bump. Acceptance is recorded server-side with the bundled document versions.
 */
export function LegalGate() {
  const { t, i18n } = useAppTranslation(['legal', 'common']);
  const { signOut } = useAuth();
  const summary = useConsentSummary();
  const youthGateActive = useYouthGateActive();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState<LegalDocumentId | null>(null);

  if (youthGateActive || summary === undefined) return null;
  const pending = pendingRequiredConsents(summary);
  if (pending.length === 0) return null;
  const reaccept = isReacceptance(summary);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      await ConsentRepository.record(
        REQUIRED_CONSENTS.map(({ type }) => ({ type, decision: 'granted' as const })),
        i18n.language.split('-')[0] ?? 'en',
        reaccept ? 'reacceptance' : 'signup',
      );
    } catch (err) {
      setError(toUserMessage(err, t('legal:consents.failed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView className="absolute inset-0 z-30 bg-background" testID="legal-gate">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        <View className="w-full max-w-[560px] self-center gap-4">
          <Heading level={2} className="text-2xl leading-8">{reaccept ? t('legal:gate.reacceptTitle') : t('legal:gate.title')}</Heading>
          <Text color="secondary">{reaccept ? t('legal:gate.reacceptBody') : t('legal:gate.body')}</Text>

          {pending.map((document) => (
            <View key={document.id} className="gap-2 border-t border-border pt-4">
              <Text weight="semibold">{document.title}</Text>
              {document.summary.slice(0, 3).map((line) => (
                <Text key={line.slice(0, 24)} variant="body-sm" color="secondary">
                  • {line}
                </Text>
              ))}
              <Button variant="ghost" onPress={() => setReading(document.id)}>
                {t('legal:readFull')}
              </Button>
            </View>
          ))}

          <Pressable
            className="min-h-11 flex-row items-start gap-3 py-2"
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreed }}
            accessibilityLabel={t('legal:gate.agree')}
            onPress={() => setAgreed((value) => !value)}
            testID="legal-gate-agree"
          >
            <View className={`mt-1 h-5 w-5 rounded border ${agreed ? 'border-accent bg-accent' : 'border-border'}`} />
            <Text variant="body-sm" className="flex-1">
              {t('legal:gate.agree')}
            </Text>
          </Pressable>
          <Text variant="caption" color="tertiary">
            {t('legal:gate.optionalLater')}
          </Text>

          {error ? (
            <Text variant="body-sm" color="error">
              {error}
            </Text>
          ) : null}
          <Button variant="primary" disabled={!agreed} loading={busy} onPress={() => void accept()}>
            {t('legal:gate.continue')}
          </Button>
          <Button variant="ghost" onPress={() => void signOut()}>
            {t('common:signOut')}
          </Button>
          {busy ? <ActivityIndicator /> : null}
        </View>
      </ScrollView>
      <LegalDocumentModal documentId={reading} onClose={() => setReading(null)} />
    </SafeAreaView>
  );
}

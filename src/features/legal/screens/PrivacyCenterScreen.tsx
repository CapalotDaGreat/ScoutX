import { useState, type ReactNode } from 'react';
import { Alert, Pressable, Switch, View } from 'react-native';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { LegalDocumentModal } from '@/features/legal/components/LegalDocumentModal';
import { LEGAL_DOCUMENTS } from '@/features/legal/content.generated';
import { isConsentGranted } from '@/features/legal/consentModel';
import { useConsentSummary } from '@/features/legal/hooks/useConsentSummary';
import { ConsentRepository } from '@/features/legal/repositories/ConsentRepository';
import { REQUIRED_CONSENTS, type LegalDocumentId } from '@/features/legal/types';
import { useBlockedUsers } from '@/features/trust-safety/hooks/useBlockedUsers';
import { SafetySettingsSection } from '@/features/youth-safety/components/SafetySettingsSection';
import { useUserSafety } from '@/features/youth-safety/context/UserSafetyProvider';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { useTheme } from '@/theme';
import { toUserMessage } from '@/utils/userFacingError';

export type PrivacyCenterScreenProps = {
  onBack: () => void;
  /** Passport visibility controls (players only). */
  visibilitySection?: ReactNode;
  /** Data export and deletion controls. */
  dataSection?: ReactNode;
};

function Section({ title, children, testID }: { title: string; children: ReactNode; testID?: string }) {
  return (
    <Card variant="elevated" padding="md" className="gap-3" testID={testID}>
      <Text variant="overline" color="secondary">
        {title}
      </Text>
      {children}
    </Card>
  );
}

function formatDate(iso: string, locale: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString(locale);
}

export function PrivacyCenterScreen({ onBack, visibilitySection, dataSection }: PrivacyCenterScreenProps) {
  const { t, i18n } = useAppTranslation(['legal', 'common']);
  const { colors } = useTheme();
  const { user, isGuest } = useAuth();
  const { policy } = useUserSafety();
  const summary = useConsentSummary();
  const { blockedUsers, unblockUser } = useBlockedUsers(user && !isGuest ? user.uid : null);
  const [reading, setReading] = useState<LegalDocumentId | null>(null);
  const [savingAi, setSavingAi] = useState(false);

  const aiGranted = summary ? isConsentGranted(summary, 'ai_analysis') : false;
  const aiLockedByGuardian = policy.isMinor && !policy.canUseAiAnalysis;

  const setAiConsent = (value: boolean) => {
    setSavingAi(true);
    void ConsentRepository.record(
      [{ type: 'ai_analysis', decision: value ? 'granted' : 'withdrawn' }],
      i18n.language.split('-')[0] ?? 'en',
      'privacy_center',
    )
      .catch((error: unknown) => Alert.alert(t('common:errorTitle'), toUserMessage(error, t('legal:consents.failed'))))
      .finally(() => setSavingAi(false));
  };

  return (
    <Screen
      title={t('legal:centerTitle')}
      subtitle={t('legal:centerSubtitle')}
      safeArea
      footer={
        <Button variant="secondary" onPress={onBack} fullWidth>
          {t('common:back')}
        </Button>
      }
    >
      <View className="gap-6" testID="privacy-center">
        {summary ? (
          <Section title={t('legal:consents.title')} testID="privacy-center-consents">
            <Text weight="semibold">{t('legal:consents.requiredTitle')}</Text>
            <Text variant="caption" color="secondary">
              {t('legal:consents.requiredBody')}
            </Text>
            {REQUIRED_CONSENTS.map(({ type, documentId }) => {
              const entry = summary[type];
              const document = LEGAL_DOCUMENTS.find((item) => item.id === documentId);
              return (
                <View key={type} className="flex-row items-center justify-between gap-3">
                  <Text variant="body-sm" className="flex-1">
                    {document?.title ?? documentId}
                  </Text>
                  <Text variant="caption" color="secondary">
                    {entry?.status === 'granted'
                      ? t('legal:consents.accepted', { version: entry.version, date: formatDate(entry.at, i18n.language) })
                      : t('legal:consents.notAccepted')}
                  </Text>
                </View>
              );
            })}

            <Text weight="semibold" className="pt-2">
              {t('legal:consents.optionalTitle')}
            </Text>
            <Text variant="caption" color="secondary">
              {t('legal:consents.optionalBody')}
            </Text>
            <View className="flex-row items-center justify-between gap-4">
              <View className="flex-1">
                <Text weight="semibold">{t('legal:consents.ai.label')}</Text>
                <Text variant="caption" color="secondary">
                  {aiLockedByGuardian ? t('legal:consents.ai.guardianLocked') : t('legal:consents.ai.description')}
                </Text>
              </View>
              <Switch
                value={aiGranted}
                disabled={savingAi || aiLockedByGuardian}
                onValueChange={setAiConsent}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor={colors.surface}
                accessibilityLabel={t('legal:consents.ai.label')}
                testID="privacy-center-ai-consent"
              />
            </View>
            <View className="flex-row items-center justify-between gap-3">
              <Text variant="body-sm" className="flex-1">
                {t('legal:consents.media.label')}
              </Text>
              <Text variant="caption" color="secondary">
                {summary.media_upload?.status === 'granted'
                  ? t('legal:consents.media.confirmed', { date: formatDate(summary.media_upload.at, i18n.language) })
                  : t('legal:consents.media.notYet')}
              </Text>
            </View>
          </Section>
        ) : null}

        {visibilitySection ? <Section title={t('legal:visibility.title')}>{visibilitySection}</Section> : null}

        <Section title={t('legal:movement.title')}>
          <Text variant="body-sm" color="secondary">
            {t('legal:movement.body')}
          </Text>
        </Section>

        <SafetySettingsSection />

        {dataSection}

        {user && !isGuest ? (
          <Section title={t('legal:blocked.title')}>
            {blockedUsers.length === 0 ? (
              <Text variant="body-sm" color="secondary">
                {t('legal:blocked.empty')}
              </Text>
            ) : (
              blockedUsers.map((entry) => (
                <View key={entry.blockedUserId} className="flex-row items-center justify-between gap-3">
                  <Text variant="body-sm" className="flex-1">
                    {entry.blockedUserName}
                  </Text>
                  <Button variant="ghost" size="sm" onPress={() => void unblockUser(entry.blockedUserId)}>
                    {t('legal:blocked.unblock')}
                  </Button>
                </View>
              ))
            )}
          </Section>
        ) : null}

        <Section title={t('legal:report.title')}>
          <Text variant="body-sm" color="secondary">
            {t('legal:report.body')}
          </Text>
          <Button variant="secondary" onPress={() => setReading('reporting-takedown-policy')}>
            {t('legal:report.policy')}
          </Button>
        </Section>

        <Section title={t('legal:documentsTitle')} testID="privacy-center-documents">
          {LEGAL_DOCUMENTS.map((document) => (
            <Pressable
              key={document.id}
              accessibilityRole="button"
              onPress={() => setReading(document.id)}
              className="flex-row items-center justify-between gap-3 py-2"
            >
              <View className="flex-1">
                <Text weight="semibold">{document.title}</Text>
                <Text variant="caption" color="secondary">
                  {t('legal:version', { version: document.version })}
                </Text>
              </View>
              <Text color="secondary">›</Text>
            </Pressable>
          ))}
          <Text variant="caption" color="tertiary">
            {t('legal:translationNotice')}
          </Text>
        </Section>
      </View>
      <LegalDocumentModal documentId={reading} onClose={() => setReading(null)} />
    </Screen>
  );
}

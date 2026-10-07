import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { CheckboxRow } from '@/components/primitives/CheckboxRow';
import { Text } from '@/components/primitives/Text';
import { LegalDocumentModal } from '@/features/legal/components/LegalDocumentModal';
import { isConsentGranted } from '@/features/legal/consentModel';
import { useConsentSummary } from '@/features/legal/hooks/useConsentSummary';
import { ConsentRepository } from '@/features/legal/repositories/ConsentRepository';
import { useUserSafety } from '@/features/youth-safety/context/UserSafetyProvider';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { toUserMessage } from '@/utils/userFacingError';

const ITEMS = ['recordedOrPermission', 'peopleKnow', 'otherMinors', 'noPrivatePlaces', 'privateByDefault'] as const;
type Item = (typeof ITEMS)[number];

/** True once the owner acknowledged the Video Recording Policy; undefined while loading. */
export function useMediaUploadAcknowledged(): boolean | undefined {
  const summary = useConsentSummary();
  return summary === undefined ? undefined : isConsentGranted(summary, 'media_upload');
}

/**
 * Shown in place of the upload entry point until the first-upload acknowledgement is recorded
 * server-side against the current Video Recording Policy version.
 */
export function UploadAcknowledgementPanel({ onAccepted }: { onAccepted?: () => void }) {
  const { t, i18n } = useAppTranslation(['media', 'legal']);
  const { policy } = useUserSafety();
  const [checked, setChecked] = useState<ReadonlySet<Item>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const copy = policy.isMinor ? 'youth' : 'adult';

  const toggle = (item: Item) =>
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      await ConsentRepository.record(
        [{ type: 'media_upload', decision: 'granted' }],
        i18n.language.split('-')[0] ?? 'en',
        'upload',
      );
      onAccepted?.();
    } catch (err) {
      setError(toUserMessage(err, t('legal:consents.failed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gap-3 rounded-xl border border-border bg-background-secondary/60 p-4" testID="upload-acknowledgement">
      <Text weight="semibold">{t('media:acknowledgement.title')}</Text>
      <Text variant="body-sm" color="secondary">
        {t(`media:acknowledgement.${copy}.intro`)}
      </Text>
      {ITEMS.map((item) => (
        <CheckboxRow
          key={item}
          checked={checked.has(item)}
          label={t(`media:acknowledgement.${copy}.${item}`)}
          onToggle={() => toggle(item)}
          testID={`upload-acknowledgement-${item}`}
        />
      ))}
      <Button variant="ghost" size="sm" onPress={() => setReading(true)}>
        {t('media:acknowledgement.readPolicy')}
      </Button>
      {error ? (
        <Text variant="body-sm" color="error">
          {error}
        </Text>
      ) : null}
      <Button
        variant="accent"
        disabled={checked.size !== ITEMS.length}
        loading={busy}
        onPress={() => void accept()}
        testID="upload-acknowledgement-accept"
      >
        {t('media:acknowledgement.accept')}
      </Button>
      <LegalDocumentModal documentId={reading ? 'video-recording-policy' : null} onClose={() => setReading(false)} />
    </View>
  );
}

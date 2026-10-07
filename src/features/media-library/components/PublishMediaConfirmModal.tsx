import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/primitives/Button';
import { CheckboxRow } from '@/components/primitives/CheckboxRow';
import { Text } from '@/components/primitives/Text';
import { type MediaItem } from '@/features/media-library/types';
import { useUserSafety } from '@/features/youth-safety/context/UserSafetyProvider';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type PublishTarget = 'passport' | 'grant';

export type PublishMediaConfirmModalProps = {
  item: MediaItem | null;
  target: PublishTarget;
  busy: boolean;
  onConfirm: (item: MediaItem) => void;
  onClose: () => void;
};

/**
 * Leaving private needs a fresh rights confirmation and a clear preview of who will see the
 * video. Passport publishing for minors also needs the guardian's public_media scope.
 */
export function PublishMediaConfirmModal({ item, target, busy, onConfirm, onClose }: PublishMediaConfirmModalProps) {
  const { t } = useAppTranslation(['media', 'common']);
  const { policy } = useUserSafety();
  const [rights, setRights] = useState(false);
  const [people, setPeople] = useState(false);

  useEffect(() => {
    setRights(false);
    setPeople(false);
  }, [item?.id, target]);

  const blocked = target === 'passport' && !policy.canPublishMedia;
  const held = item ? item.moderationState !== 'none' : false;

  return (
    <Modal visible={item !== null} onClose={onClose} title={t(`media:publish.${target}.title`)} size="sheet">
      <View className="gap-3 p-4" testID="publish-media-confirm">
        <Text weight="semibold">{item?.title}</Text>
        <View className="gap-1 rounded-xl border border-border p-3">
          <Text variant="overline" color="secondary">
            {t('media:publish.audienceLabel')}
          </Text>
          <Text variant="body-sm">{t(`media:publish.${target}.audience`)}</Text>
        </View>
        <Text variant="body-sm" color="secondary">
          {t(`media:publish.${target}.warning`)}
        </Text>
        {held ? (
          <Text variant="body-sm" color="error">
            {t('media:publish.held')}
          </Text>
        ) : blocked ? (
          <Text variant="body-sm" color="secondary" testID="publish-media-guardian-blocked">
            {policy.isMinor ? t('media:publish.guardianRequired') : t('media:publish.unavailable')}
          </Text>
        ) : (
          <>
            <CheckboxRow
              checked={rights}
              label={t('media:publish.confirmRights')}
              onToggle={() => setRights((value) => !value)}
              testID="publish-media-rights"
            />
            <CheckboxRow
              checked={people}
              label={policy.isMinor ? t('media:publish.confirmPeopleYouth') : t('media:publish.confirmPeople')}
              onToggle={() => setPeople((value) => !value)}
              testID="publish-media-people"
            />
            <Button
              variant="accent"
              disabled={!rights || !people || item === null}
              loading={busy}
              onPress={() => item && onConfirm(item)}
              testID="publish-media-submit"
            >
              {t(`media:publish.${target}.confirm`)}
            </Button>
          </>
        )}
        <Button variant="ghost" onPress={onClose}>
          {t('common:cancel')}
        </Button>
      </View>
    </Modal>
  );
}

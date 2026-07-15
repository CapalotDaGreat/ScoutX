import { useState } from 'react';
import { Alert, View } from 'react-native';
import { Input } from '@/components/primitives/Input';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { PortfolioSlugRepository } from '@/features/public-portfolio/repositories/PortfolioSlugRepository';
import {
  slugifyUsername,
  suggestUsernameFromName,
  validateUsername,
} from '@/features/public-portfolio/services/usernameService';
import { buildPublicPortfolioUrl } from '@/features/public-portfolio/constants';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type UsernameClaimFieldProps = {
  playerId: string;
  fullName: string;
  username?: string;
  onClaimed: (username: string) => Promise<void>;
};

const USERNAME_VALIDATION_KEYS: Record<string, 'usernameMinLength' | 'usernameMaxLength' | 'usernameFormat' | 'usernameReserved'> = {
  'Username must be at least 3 characters.': 'usernameMinLength',
  'Username must be 30 characters or fewer.': 'usernameMaxLength',
  'Use lowercase letters, numbers, and hyphens only.': 'usernameFormat',
  'This username is reserved.': 'usernameReserved',
};

export function UsernameClaimField({
  playerId,
  fullName,
  username,
  onClaimed,
}: UsernameClaimFieldProps) {
  const { t } = useAppTranslation(['portfolio', 'validation']);
  const [draft, setDraft] = useState(username ?? suggestUsernameFromName(fullName));
  const [saving, setSaving] = useState(false);

  const preview = buildPublicPortfolioUrl(playerId, slugifyUsername(draft));

  const translateValidationError = (error: string) => {
    const key = USERNAME_VALIDATION_KEYS[error];
    return key ? t(key, { ns: 'validation' }) : error;
  };

  const handleClaim = async () => {
    const validationError = validateUsername(draft);
    if (validationError) {
      Alert.alert(t('username.invalidTitle'), translateValidationError(validationError));
      return;
    }

    setSaving(true);
    try {
      const next = await PortfolioSlugRepository.getInstance().claimUsername(playerId, draft);
      await onClaimed(next);
      Alert.alert(
        t('username.claimedTitle'),
        t('username.claimedMessage', { url: buildPublicPortfolioUrl(playerId, next) }),
      );
    } catch (error) {
      Alert.alert(
        t('username.claimFailedTitle'),
        error instanceof Error ? error.message : t('username.claimFailedFallback'),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="gap-2 rounded-xl border border-border p-4">
      <Text weight="semibold">{t('username.title')}</Text>
      <Text variant="caption" color="secondary">
        {t('username.description')}
      </Text>
      <Input
        label={t('username.label')}
        value={draft}
        onChangeText={setDraft}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Text variant="caption" color="secondary">
        {preview}
      </Text>
      <Button variant="secondary" loading={saving} onPress={() => void handleClaim()}>
        {username ? t('username.update') : t('username.claim')}
      </Button>
    </View>
  );
}

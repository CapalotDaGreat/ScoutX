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

export type UsernameClaimFieldProps = {
  playerId: string;
  fullName: string;
  username?: string;
  onClaimed: (username: string) => Promise<void>;
};

export function UsernameClaimField({
  playerId,
  fullName,
  username,
  onClaimed,
}: UsernameClaimFieldProps) {
  const [draft, setDraft] = useState(username ?? suggestUsernameFromName(fullName));
  const [saving, setSaving] = useState(false);

  const preview = buildPublicPortfolioUrl(playerId, slugifyUsername(draft));

  const handleClaim = async () => {
    const validationError = validateUsername(draft);
    if (validationError) {
      Alert.alert('Invalid username', validationError);
      return;
    }

    setSaving(true);
    try {
      const next = await PortfolioSlugRepository.getInstance().claimUsername(playerId, draft);
      await onClaimed(next);
      Alert.alert('Username claimed', `Your public link is ${buildPublicPortfolioUrl(playerId, next)}`);
    } catch (error) {
      Alert.alert('Unable to claim username', error instanceof Error ? error.message : 'Try another username.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="gap-2 rounded-xl border border-border p-4 dark:border-neutral-800">
      <Text weight="semibold">Public link username</Text>
      <Text variant="caption" color="secondary">
        Claim your link-in-bio address for Instagram, TikTok, and email signatures.
      </Text>
      <Input
        label="Username"
        value={draft}
        onChangeText={setDraft}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Text variant="caption" color="secondary">
        {preview}
      </Text>
      <Button variant="secondary" loading={saving} onPress={() => void handleClaim()}>
        {username ? 'Update username' : 'Claim username'}
      </Button>
    </View>
  );
}

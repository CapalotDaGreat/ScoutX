import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { ChevronDown, ChevronUp, UserRound } from 'lucide-react-native';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { useTheme } from '@/theme';

export type GuestExploreBannerProps = {
  onSignOut: () => void;
};

export function GuestExploreBanner({ onSignOut }: GuestExploreBannerProps) {
  const { colors } = useTheme();
  const { beginUpgrade } = useAuth();
  const [expanded, setExpanded] = useState(false);

  return (
    <View className="mx-4 mt-2 rounded-2xl border border-border bg-surface dark:border-neutral-800 dark:bg-neutral-900">
      <Pressable
        accessibilityRole="button"
        onPress={() => setExpanded((current) => !current)}
        className="flex-row items-center gap-3 px-4 py-3"
      >
        <View className="rounded-full bg-accent-muted p-2 dark:bg-green-950">
          <UserRound size={16} color={colors.accent} />
        </View>
        <View className="flex-1">
          <Text weight="semibold">Browsing as guest</Text>
          <Text variant="caption" color="secondary">
            Limited discovery access
          </Text>
        </View>
        {expanded ? (
          <ChevronUp size={18} color={colors.textSecondary} />
        ) : (
          <ChevronDown size={18} color={colors.textSecondary} />
        )}
      </Pressable>

      {expanded ? (
        <View className="gap-3 border-t border-divider px-4 pb-4 pt-3 dark:border-neutral-800">
          <Text variant="body-sm" color="secondary">
            Create a free account to unlock your profile, scouting tools, and saved data. Your guest
            UID is preserved when you upgrade.
          </Text>
          <View className="flex-row gap-2">
            <Button variant="accent" className="flex-1" onPress={() => beginUpgrade('register')}>
              Create account
            </Button>
            <Button variant="secondary" className="flex-1" onPress={() => beginUpgrade('login')}>
              Sign in
            </Button>
          </View>
          <Button variant="ghost" onPress={onSignOut}>
            Sign out
          </Button>
        </View>
      ) : null}
    </View>
  );
}

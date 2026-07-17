import { View, type ViewProps } from 'react-native';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { Avatar } from '@/components/primitives/Avatar';
import { Badge } from '@/components/primitives/Badge';
import { cn } from '@/utils/cn';
import { triggerHaptic } from '@/utils/haptics';

export type NotificationType =
  | 'message'
  | 'trial'
  | 'achievement'
  | 'ai'
  | 'profile'
  | 'system';

export type NotificationCardProps = ViewProps & {
  title: string;
  body: string;
  timestamp: string;
  type?: NotificationType;
  read?: boolean;
  avatarName?: string;
  avatarUri?: string;
  onPress?: () => void;
  className?: string;
};

const typeBadgeLabels: Record<NotificationType, string> = {
  message: 'Message',
  trial: 'Trial',
  achievement: 'Achievement',
  ai: 'AI Report',
  profile: 'Profile',
  system: 'System',
};

const typeBadgeVariants: Record<
  NotificationType,
  'default' | 'accent' | 'success' | 'info' | 'warning'
> = {
  message: 'info',
  trial: 'accent',
  achievement: 'success',
  ai: 'warning',
  profile: 'default',
  system: 'default',
};

export function NotificationCard({
  title,
  body,
  timestamp,
  type = 'system',
  read = false,
  avatarName,
  avatarUri,
  onPress,
  className,
  ...props
}: NotificationCardProps) {
  const handlePress = () => {
    if (!onPress) {
      return;
    }
    void triggerHaptic('light');
    onPress();
  };

  return (
    <Card
      interactive={Boolean(onPress)}
      variant={read ? 'outlined' : 'elevated'}
      padding="sm"
      onPress={onPress ? handlePress : undefined}
      className={cn(
        !read && 'border-accent/25',
        className,
      )}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${body}. ${timestamp}`}
      accessibilityState={{ selected: !read }}
      {...props}
    >
      <View className="flex-row items-start gap-3.5">
        {avatarName || avatarUri ? (
          <Avatar
            name={avatarName}
            source={avatarUri ? { uri: avatarUri } : undefined}
            size="md"
          />
        ) : (
          <View className="mt-1.5">
            {!read ? (
              <View className="h-2 w-2 rounded-full bg-accent" />
            ) : (
              <View className="h-2 w-2" />
            )}
          </View>
        )}

        <View className="min-w-0 flex-1 gap-1">
          <View className="flex-row items-center justify-between gap-2">
            <Text
              variant="label"
              className={cn(
                'min-w-0 flex-1 font-sans-semibold',
                !read && 'text-foreground',
              )}
              numberOfLines={1}
            >
              {title}
            </Text>
            <Text variant="caption" color="tertiary" className="shrink-0">
              {timestamp}
            </Text>
          </View>

          <Text variant="body-sm" color="secondary" numberOfLines={2}>
            {body}
          </Text>

          <View className="mt-1.5">
            <Badge
              label={typeBadgeLabels[type]}
              variant={
                type === 'achievement' ? 'prestige' : typeBadgeVariants[type]
              }
              size="sm"
            />
          </View>
        </View>
      </View>
    </Card>
  );
}

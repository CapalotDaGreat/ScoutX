import { useState, useCallback } from 'react';
import { Alert, View } from 'react-native';
import { Flag } from 'lucide-react-native';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { Input } from '@/components/primitives/Input';
import { REPORT_REASONS, type ReportReason } from '@/features/trust-safety/constants';
import { ContentReportRepository } from '@/features/trust-safety/repositories/ContentReportRepository';
import { type ContentReportTargetType } from '@/features/trust-safety/types';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { useTheme } from '@/theme';

export type ReportContentButtonProps = {
  targetType: ContentReportTargetType;
  targetId: string;
  label?: string;
};

export function ReportContentButton({
  targetType,
  targetId,
  label = 'Report',
}: ReportContentButtonProps) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [reason, setReason] = useState<ReportReason>('spam');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!user?.id) {
      Alert.alert('Sign in required', 'You need to be signed in to report content.');
      return;
    }

    setSubmitting(true);
    try {
      await ContentReportRepository.getInstance().submitReport(user.id, {
        targetType,
        targetId,
        reason,
        details: details.trim() || undefined,
      });
      setVisible(false);
      setDetails('');
      Alert.alert('Report submitted', 'Thank you. Our team will review this content.');
    } catch {
      Alert.alert('Unable to submit', 'Please try again in a moment.');
    } finally {
      setSubmitting(false);
    }
  }, [details, reason, targetId, targetType, user?.id]);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        leftIcon={<Flag size={14} color={colors.textSecondary} />}
        onPress={() => setVisible(true)}
      >
        {label}
      </Button>

      <Modal visible={visible} onClose={() => setVisible(false)} title="Report content" size="md">
        <View className="gap-4">
          <Text variant="body-sm" color="secondary">
            Tell us why you are reporting this {targetType}.
          </Text>

          <View className="gap-2">
            {REPORT_REASONS.map((option) => (
              <Button
                key={option.value}
                variant={reason === option.value ? 'secondary' : 'ghost'}
                size="sm"
                onPress={() => setReason(option.value)}
                className="justify-start"
              >
                {option.label}
              </Button>
            ))}
          </View>

          <Input
            label="Additional details (optional)"
            value={details}
            onChangeText={setDetails}
            multiline
            numberOfLines={3}
          />

          <Button variant="destructive" loading={submitting} onPress={() => void handleSubmit()}>
            Submit report
          </Button>
        </View>
      </Modal>
    </>
  );
}

import { useState, useCallback } from 'react';
import { Alert, View } from 'react-native';
import { Flag } from 'lucide-react-native';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { Input } from '@/components/primitives/Input';
import { REPORT_REASONS, type ReportReason } from '@/features/trust-safety/constants';
import { ContentReportRepository } from '@/features/trust-safety/repositories/ContentReportRepository';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { useTheme } from '@/theme';

export type ReportContentButtonProps = (
  | { targetType: 'user'; targetId: string; targetOwnerId?: undefined }
  | { targetType: 'post'; targetId: string; targetOwnerId: string }
) & {
  label?: string;
};

export function ReportContentButton({
  targetType,
  targetId,
  targetOwnerId,
  label,
}: ReportContentButtonProps) {
  const { colors } = useTheme();
  const { t } = useAppTranslation('trust');
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [reason, setReason] = useState<ReportReason>('spam');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!user?.id) {
      Alert.alert(t('report.signInTitle'), t('report.signInBody'));
      return;
    }

    setSubmitting(true);
    try {
      await ContentReportRepository.getInstance().submitReport(user.id, {
        targetType,
        targetId,
        targetOwnerId: targetOwnerId ?? targetId,
        reason,
        details: details.trim() || undefined,
      });
      setVisible(false);
      setDetails('');
      Alert.alert(t('report.submittedTitle'), t('report.submittedBody'));
    } catch {
      Alert.alert(t('report.failedTitle'), t('report.failedBody'));
    } finally {
      setSubmitting(false);
    }
  }, [details, reason, t, targetId, targetOwnerId, targetType, user?.id]);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        leftIcon={<Flag size={14} color={colors.textSecondary} />}
        onPress={() => setVisible(true)}
      >
        {label ?? t('report.button')}
      </Button>

      <Modal visible={visible} onClose={() => setVisible(false)} title={t('report.title')} size="md">
        <View className="gap-4">
          <Text variant="body-sm" color="secondary">
            {targetType === 'user' ? t('report.promptUser') : t('report.promptPost')}
          </Text>

          <View className="gap-2" accessibilityRole="radiogroup">
            {REPORT_REASONS.map((option) => (
              <Button
                key={option.value}
                variant={reason === option.value ? 'secondary' : 'ghost'}
                size="sm"
                onPress={() => setReason(option.value)}
                className="justify-start"
                accessibilityRole="radio"
                accessibilityState={{ selected: reason === option.value }}
              >
                {t(`report.reasons.${option.value}`)}
              </Button>
            ))}
          </View>

          <Input
            label={t('report.details')}
            value={details}
            onChangeText={setDetails}
            multiline
            numberOfLines={3}
          />

          <Button variant="destructive" loading={submitting} onPress={() => void handleSubmit()}>
            {t('report.submit')}
          </Button>
        </View>
      </Modal>
    </>
  );
}

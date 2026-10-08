import { useState, useCallback } from 'react';
import { Alert, View } from 'react-native';
import { Flag } from 'lucide-react-native';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { Input } from '@/components/primitives/Input';
import {
  reportReasonsFor,
  type ReportReason,
  type ReportTargetType,
} from '@/features/trust-safety/constants';
import { ContentReportRepository } from '@/features/trust-safety/repositories/ContentReportRepository';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { useTheme } from '@/theme';

type AccountTarget = 'user' | 'scout' | 'passport';

export type ReportContentButtonProps = (
  | { targetType: AccountTarget; targetId: string; targetOwnerId?: undefined }
  | { targetType: Exclude<ReportTargetType, AccountTarget>; targetId: string; targetOwnerId: string }
) & {
  label?: string;
  testID?: string;
  /** Opens the report form immediately, e.g. when arriving from a report link. */
  initiallyOpen?: boolean;
  /** Called after a report was submitted. */
  onSubmitted?: () => void;
};

type PromptKey =
  | 'report.promptUser'
  | 'report.promptPost'
  | 'report.promptVideo'
  | 'report.promptContact'
  | 'report.promptSource';

function promptKey(targetType: ReportTargetType): PromptKey {
  switch (targetType) {
    case 'user':
    case 'scout':
      return 'report.promptUser';
    case 'post':
      return 'report.promptPost';
    case 'media':
    case 'reel':
    case 'passport':
      return 'report.promptVideo';
    case 'external_football_source':
      return 'report.promptSource';
    default:
      return 'report.promptContact';
  }
}

export function ReportContentButton({
  targetType,
  targetId,
  targetOwnerId,
  label,
  testID,
  initiallyOpen = false,
  onSubmitted,
}: ReportContentButtonProps) {
  const { colors } = useTheme();
  const { t } = useAppTranslation('trust');
  const { user } = useAuth();
  const reasons = reportReasonsFor(targetType);
  const [visible, setVisible] = useState(initiallyOpen);
  const [reason, setReason] = useState<ReportReason>(reasons[0] ?? 'other');
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
      onSubmitted?.();
    } catch {
      Alert.alert(t('report.failedTitle'), t('report.failedBody'));
    } finally {
      setSubmitting(false);
    }
  }, [details, onSubmitted, reason, t, targetId, targetOwnerId, targetType, user?.id]);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        leftIcon={<Flag size={14} color={colors.textSecondary} />}
        onPress={() => setVisible(true)}
        testID={testID}
      >
        {label ?? t('report.button')}
      </Button>

      <Modal visible={visible} onClose={() => setVisible(false)} title={t('report.title')} size="md">
        <View className="gap-4">
          <Text variant="body-sm" color="secondary">
            {t(promptKey(targetType))}
          </Text>

          <View className="gap-2" accessibilityRole="radiogroup">
            {reasons.map((option) => (
              <Button
                key={option}
                variant={reason === option ? 'secondary' : 'ghost'}
                size="sm"
                onPress={() => setReason(option)}
                className="justify-start"
                accessibilityRole="radio"
                accessibilityState={{ selected: reason === option }}
              >
                {t(`report.reasons.${option}`)}
              </Button>
            ))}
          </View>

          {reason === 'appears_in_video' || reason === 'minor_in_video' ? (
            <Text variant="caption" color="secondary">
              {t('report.videoRestrictedNote')}
            </Text>
          ) : null}

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

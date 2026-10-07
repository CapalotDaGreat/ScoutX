import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Linking, View } from 'react-native';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { LegalDocumentModal } from '@/features/legal/components/LegalDocumentModal';
import type { LegalDocumentId } from '@/features/legal/types';
import { usePremium } from '@/features/premium/hooks/usePremium';
import {
  isPurchasingAvailable,
  loadPackages,
  manageSubscriptionsUrl,
  purchasePackage,
  restorePurchases,
} from '@/features/premium/services/purchasesService';
import { METERED_FEATURES, type PremiumPackage } from '@/features/premium/types';
import { useUserSafety } from '@/features/youth-safety/context/UserSafetyProvider';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { useTheme } from '@/theme';
import { toUserMessage } from '@/utils/userFacingError';

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

export function PlanUsageScreen({ onBack }: { onBack: () => void }) {
  const { t, i18n } = useAppTranslation(['premium', 'common']);
  const { colors } = useTheme();
  const { user } = useAuth();
  const { policy } = useUserSafety();
  const { summary, loading, error, refresh } = usePremium();
  const [packages, setPackages] = useState<PremiumPackage[]>([]);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState<LegalDocumentId | null>(null);
  const uid = user?.uid ?? null;
  const canPurchase = isPurchasingAvailable() && uid !== null;
  const isPremium = summary?.plan === 'premium';

  useEffect(() => {
    if (!canPurchase || !uid || isPremium) return;
    loadPackages(uid)
      .then(setPackages)
      .catch(() => setPackages([]));
  }, [canPurchase, uid, isPremium]);

  const run = (action: () => Promise<void>) => {
    setBusy(true);
    void action()
      .catch((caught: unknown) => Alert.alert(t('common:errorTitle'), toUserMessage(caught, t('premium:purchaseFailed'))))
      .finally(() => setBusy(false));
  };

  const onBuy = (packageId: string) =>
    run(async () => {
      if (!uid) return;
      const outcome = await purchasePackage(uid, packageId);
      if (outcome === 'purchased') {
        Alert.alert(t('premium:purchasePendingTitle'), t('premium:purchasePendingBody'));
        await refresh();
      }
    });

  const onRestore = () =>
    run(async () => {
      if (!uid) return;
      await restorePurchases(uid);
      Alert.alert(t('premium:restoreDoneTitle'), t('premium:purchasePendingBody'));
      await refresh();
    });

  const onManage = () =>
    run(async () => {
      if (!uid) return;
      await Linking.openURL(await manageSubscriptionsUrl(uid));
    });

  const resetLabel = summary?.resetAt
    ? t('premium:resetsOn', { date: new Date(summary.resetAt).toLocaleDateString(i18n.language) })
    : t('premium:periodNotStarted', { days: summary?.periodDays ?? 30 });

  return (
    <Screen
      title={t('premium:title')}
      subtitle={t('premium:subtitle')}
      safeArea
      footer={
        <Button variant="secondary" onPress={onBack} fullWidth>
          {t('common:back')}
        </Button>
      }
    >
      <View className="gap-6" testID="plan-usage-screen">
        {loading && !summary ? <ActivityIndicator color={colors.primary} /> : null}
        {!loading && !summary ? (
          <Card variant="elevated" padding="md" className="gap-3">
            <Text>{toUserMessage(error, t('premium:loadFailed'))}</Text>
            <Button variant="secondary" onPress={() => void refresh()}>
              {t('common:retry')}
            </Button>
          </Card>
        ) : null}

        {summary ? (
          <>
            <Section title={t('premium:currentPlan')} testID="plan-current">
              <Text variant="body-lg" weight="semibold">{t(`premium:plans.${summary.plan}`)}</Text>
              <Text variant="caption" color="secondary">
                {t(`premium:status.${summary.status}`)}
              </Text>
            </Section>

            <Section title={t('premium:usageTitle')} testID="plan-usage">
              {METERED_FEATURES.map((feature) => {
                const usage = summary.features[feature];
                return (
                  <View key={feature} className="flex-row items-center justify-between gap-3">
                    <Text variant="body-sm" className="flex-1">
                      {t(`premium:features.${feature}`)}
                    </Text>
                    <Text variant="caption" color="secondary" testID={`plan-usage-${feature}`}>
                      {t('premium:remaining', { remaining: usage.remaining, limit: usage.limit })}
                    </Text>
                  </View>
                );
              })}
              <Text variant="caption" color="secondary">
                {resetLabel}
              </Text>
              <Text variant="caption" color="secondary">
                {t('premium:videoLimits', {
                  minutes: Math.round(summary.maxVideoDurationSec / 60),
                  jobs: summary.maxConcurrentJobs,
                })}
              </Text>
            </Section>

            <Section title={t('premium:alwaysFreeTitle')} testID="plan-always-free">
              <Text variant="caption" color="secondary">
                {t('premium:alwaysFreeBody')}
              </Text>
              {summary.neverPaywalled.map((item) => (
                <Text key={item} variant="body-sm">
                  {`\u2022 ${t(`premium:alwaysFree.${item}`, { defaultValue: item })}`}
                </Text>
              ))}
            </Section>

            {canPurchase ? (
              <Section title={t('premium:subscriptionTitle')} testID="plan-subscription">
                {!isPremium && policy.isMinor ? (
                  <Text variant="caption" color="secondary">
                    {t('premium:minorNote')}
                  </Text>
                ) : null}
                {!isPremium
                  ? packages.map((pkg) => (
                      <Button key={pkg.id} onPress={() => onBuy(pkg.id)} disabled={busy} testID={`plan-buy-${pkg.id}`}>
                        {t('premium:buy', { title: pkg.title, price: pkg.priceString })}
                      </Button>
                    ))
                  : null}
                {!isPremium && packages.length === 0 ? (
                  <Text variant="caption" color="secondary">
                    {t('premium:noOfferings')}
                  </Text>
                ) : null}
                <Text variant="caption" color="secondary">
                  {t('premium:renewalDisclosure')}
                </Text>
                <Button variant="secondary" onPress={onRestore} disabled={busy}>
                  {t('premium:restore')}
                </Button>
                <Button variant="secondary" onPress={onManage} disabled={busy}>
                  {t('premium:manage')}
                </Button>
                <Button variant="ghost" onPress={() => setReading('subscription-terms')}>
                  {t('premium:subscriptionTerms')}
                </Button>
              </Section>
            ) : (
              <Text variant="caption" color="secondary">
                {t('premium:purchasesUnavailable')}
              </Text>
            )}
          </>
        ) : null}
      </View>
      <LegalDocumentModal documentId={reading} onClose={() => setReading(null)} />
    </Screen>
  );
}

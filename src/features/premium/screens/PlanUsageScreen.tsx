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
import { useStoreEntitlement } from '@/features/premium/hooks/useStoreEntitlement';
import type { PurchaseErrorKind } from '@/features/premium/services/purchaseModel';
import {
  PurchaseError,
  isPurchasingAvailable,
  loadPackages,
  manageSubscriptionsUrl,
  presentCustomerCenter,
  presentPaywall,
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

const ERROR_KEYS = {
  cancelled: 'premium:purchaseFailed',
  pending: 'premium:purchasePendingBody',
  already_owned: 'premium:errors.alreadyOwned',
  network: 'premium:errors.network',
  store: 'premium:errors.store',
  not_allowed: 'premium:errors.notAllowed',
  product_unavailable: 'premium:errors.productUnavailable',
  configuration: 'premium:purchasesUnavailable',
  unknown: 'premium:purchaseFailed',
} as const satisfies Record<PurchaseErrorKind, string>;

export function PlanUsageScreen({ onBack }: { onBack: () => void }) {
  const { t, i18n } = useAppTranslation(['premium', 'common']);
  const { colors } = useTheme();
  const { user } = useAuth();
  const { policy } = useUserSafety();
  const { summary, loading, error, refresh } = usePremium();
  const { entitlement: store, refresh: refreshStore } = useStoreEntitlement();
  const [packages, setPackages] = useState<PremiumPackage[]>([]);
  const [showPackageList, setShowPackageList] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState<LegalDocumentId | null>(null);
  const uid = user?.uid ?? null;
  const canPurchase = isPurchasingAvailable() && uid !== null;
  const isPremium = summary?.plan === 'premium';
  // The store can confirm a purchase before the webhook updates the server plan.
  const confirming = store.active && !isPremium;
  const hasSubscription = isPremium || store.active;

  useEffect(() => {
    if (!canPurchase || !uid || hasSubscription || !showPackageList) return;
    loadPackages(uid)
      .then(setPackages)
      .catch(() => setPackages([]));
  }, [canPurchase, uid, hasSubscription, showPackageList]);

  const run = (action: () => Promise<void>) => {
    setBusy(true);
    void action()
      .catch((caught: unknown) => {
        const key = caught instanceof PurchaseError ? ERROR_KEYS[caught.kind] : 'premium:purchaseFailed';
        Alert.alert(t('common:errorTitle'), toUserMessage(caught instanceof PurchaseError ? null : caught, t(key)));
      })
      .finally(() => setBusy(false));
  };

  const afterStoreChange = async (titleKey: 'premium:purchasePendingTitle' | 'premium:restoreDoneTitle') => {
    Alert.alert(t(titleKey), t('premium:purchasePendingBody'));
    await Promise.all([refresh(), refreshStore()]);
  };

  const onSeePlans = () =>
    run(async () => {
      if (!uid) return;
      const outcome = await presentPaywall(uid);
      if (outcome === 'purchased') await afterStoreChange('premium:purchasePendingTitle');
      else if (outcome === 'restored') await afterStoreChange('premium:restoreDoneTitle');
      else if (outcome === 'not_presented') await refreshStore();
      else if (outcome === 'unavailable') setShowPackageList(true);
      else if (outcome === 'error') Alert.alert(t('common:errorTitle'), t('premium:purchaseFailed'));
    });

  const onBuy = (packageId: string) =>
    run(async () => {
      if (!uid) return;
      const outcome = await purchasePackage(uid, packageId);
      if (outcome !== 'cancelled') await afterStoreChange('premium:purchasePendingTitle');
    });

  const onRestore = () =>
    run(async () => {
      if (!uid) return;
      const restored = await restorePurchases(uid);
      if (restored.active) await afterStoreChange('premium:restoreDoneTitle');
      else Alert.alert(t('premium:restoreNothingTitle'), t('premium:restoreNothingBody'));
    });

  const onManage = () =>
    run(async () => {
      if (!uid) return;
      if ((await presentCustomerCenter(uid)) === 'presented') {
        await Promise.all([refresh(), refreshStore()]);
        return;
      }
      await Linking.openURL(await manageSubscriptionsUrl(uid));
    });

  const resetLabel = summary?.resetAt
    ? t('premium:resetsOn', { date: new Date(summary.resetAt).toLocaleDateString(i18n.language) })
    : t('premium:periodNotStarted', { days: summary?.periodDays ?? 30 });

  const storeDetail = store.active
    ? [
        store.term ? t(`premium:terms.${store.term}`) : null,
        store.expiresAt
          ? t(store.willRenew ? 'premium:renewsOn' : 'premium:endsOn', {
              date: new Date(store.expiresAt).toLocaleDateString(i18n.language),
            })
          : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

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
              {storeDetail ? (
                <Text variant="caption" color="secondary" testID="plan-store-detail">
                  {storeDetail}
                </Text>
              ) : null}
              {confirming ? (
                <Text variant="caption" color="secondary" testID="plan-confirming">
                  {t('premium:confirming')}
                </Text>
              ) : null}
              {store.hasBillingIssue ? (
                <Text variant="caption" color="warning" testID="plan-billing-issue">
                  {t('premium:billingIssue')}
                </Text>
              ) : null}
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
                {!hasSubscription && policy.isMinor ? (
                  <Text variant="caption" color="secondary">
                    {t('premium:minorNote')}
                  </Text>
                ) : null}
                {!hasSubscription ? (
                  <Button onPress={onSeePlans} disabled={busy} testID="plan-see-plans">
                    {t('premium:seePlans')}
                  </Button>
                ) : null}
                {!hasSubscription && showPackageList
                  ? packages.map((pkg) => (
                      <Button
                        key={pkg.id}
                        variant="secondary"
                        onPress={() => onBuy(pkg.id)}
                        disabled={busy}
                        testID={`plan-buy-${pkg.id}`}
                      >
                        {t('premium:buy', { title: pkg.title, price: pkg.priceString })}
                      </Button>
                    ))
                  : null}
                {!hasSubscription && showPackageList && packages.length === 0 ? (
                  <Text variant="caption" color="secondary">
                    {t('premium:noOfferings')}
                  </Text>
                ) : null}
                <Text variant="caption" color="secondary">
                  {t('premium:renewalDisclosure')}
                </Text>
                <Button variant="secondary" onPress={onRestore} disabled={busy} testID="plan-restore">
                  {t('premium:restore')}
                </Button>
                {hasSubscription ? (
                  <Button variant="secondary" onPress={onManage} disabled={busy} testID="plan-manage">
                    {t('premium:manage')}
                  </Button>
                ) : null}
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

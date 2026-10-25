import { View } from 'react-native';
import { Text } from '@/components/primitives/Text';
import {
  GPS_MAX_MEDIAN_ACCURACY_M,
  GPS_MIN_DURATION_SEC,
  GPS_MIN_POINTS,
} from '@/features/gps/services/gpsIntelligence';
import type { GpsSession, SpeedBand } from '@/features/gps/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

const BANDS: readonly SpeedBand[] = ['walk', 'jog', 'run', 'sprint'];

/** Movement intelligence for one session, gated on sample size and GPS accuracy. */
export function GpsIntelligenceCard({ session }: { session: GpsSession }) {
  const { t } = useAppTranslation(['gps']);
  const intel = session.intelligence;

  return (
    <View className="gap-2 border-t border-border py-3" testID="gps-intelligence">
      <Text variant="body" className="font-sans-semibold" accessibilityRole="header">
        {t('gps:intel.title')}
      </Text>
      {!intel ? (
        <Text variant="body-sm" color="secondary">
          {t('gps:intel.noPoints')}
        </Text>
      ) : intel.status === 'insufficient' ? (
        <Text variant="body-sm" color="secondary">
          {t('gps:intel.insufficient', {
            minutes: Math.round(GPS_MIN_DURATION_SEC / 60),
            points: GPS_MIN_POINTS,
            haveMinutes: Math.round(intel.sample.durationSec / 60),
            havePoints: intel.sample.points,
          })}
        </Text>
      ) : (
        <>
          {intel.status === 'low_accuracy' ? (
            <Text variant="body-sm" color="warning">
              {t('gps:intel.lowAccuracy', { meters: intel.sample.medianAccuracyM ?? 0, limit: GPS_MAX_MEDIAN_ACCURACY_M })}
            </Text>
          ) : (
            <>
              <Text variant="body-sm">
                {t('gps:intel.spread', { width: intel.widthM ?? 0, depth: intel.depthM ?? 0 })}
              </Text>
              <Text variant="body-sm">{t('gps:intel.central', { pct: intel.centralSharePct ?? 0 })}</Text>
              <Text variant="caption" color="tertiary">
                {t('gps:intel.directionUnknown')}
              </Text>
              {intel.sample.medianAccuracyM === null ? (
                <Text variant="caption" color="tertiary">
                  {t('gps:intel.accuracyUnknown')}
                </Text>
              ) : null}
            </>
          )}
          {intel.bands ? (
            <View className="gap-1 pt-1">
              <Text variant="caption" color="secondary">
                {t('gps:intel.intensity')}
              </Text>
              {BANDS.map((band) => (
                <View key={band} className="flex-row items-center gap-2" accessible accessibilityLabel={`${t(`gps:intel.band.${band}`)}: ${intel.bands?.[band] ?? 0}%`}>
                  <Text variant="body-sm" className="w-24 shrink">
                    {t(`gps:intel.band.${band}`)}
                  </Text>
                  <View className="h-2 flex-1 overflow-hidden rounded-full bg-surface-elevated">
                    <View className="h-2 rounded-full bg-accent" style={{ width: `${intel.bands?.[band] ?? 0}%` }} />
                  </View>
                  <Text variant="caption" className="min-w-10 text-right">
                    {intel.bands?.[band] ?? 0}%
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          <Text variant="body-sm" color="secondary">
            {t('gps:intel.sprints', { count: intel.sprints.length })}
          </Text>
        </>
      )}
    </View>
  );
}

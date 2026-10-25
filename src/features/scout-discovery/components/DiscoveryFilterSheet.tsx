import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { BottomSheet } from '@/components/feedback/BottomSheet';
import { Button } from '@/components/primitives/Button';
import { Input } from '@/components/primitives/Input';
import { StarRating } from '@/components/primitives/StarRating';
import { Text } from '@/components/primitives/Text';
import {
  CLUB_OPTIONS,
  LEAGUE_OPTIONS,
  NATIONALITY_OPTIONS,
  POSITION_OPTIONS,
} from '@/features/scout-discovery/constants';
import {
  type DiscoveryFilters,
  type PlayerAvailability,
  type PlayerPosition,
  type PreferredFoot,
} from '@/features/scout-discovery/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type DiscoveryFilterSheetProps = {
  visible: boolean;
  filters: DiscoveryFilters;
  onClose: () => void;
  onChange: <Key extends keyof DiscoveryFilters>(key: Key, value: DiscoveryFilters[Key]) => void;
  onReset: () => void;
  onApply: () => void;
};

function ChipSelect<T extends string>({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: { value: T; label: string }[];
  selected: T[];
  onToggle: (value: T) => void;
}) {
  return (
    <View className="gap-2">
      <Text variant="label">{label}</Text>
      <View className="flex-row flex-wrap gap-2">
        {options.map((option) => {
          const isSelected = selected.includes(option.value);
          return (
            <Button
              key={option.value}
              variant={isSelected ? 'accent' : 'secondary'}
              size="sm"
              onPress={() => onToggle(option.value)}
            >
              {option.label}
            </Button>
          );
        })}
      </View>
    </View>
  );
}

const FRESHNESS_OPTIONS = [30, 90, 180] as const;

export function DiscoveryFilterSheet({
  visible,
  filters,
  onClose,
  onChange,
  onReset,
  onApply,
}: DiscoveryFilterSheetProps) {
  const { t } = useAppTranslation(['scout', 'common']);
  const [rolesText, setRolesText] = useState(filters.roles.join(', '));

  useEffect(() => {
    setRolesText(filters.roles.join(', '));
  }, [filters.roles]);

  const togglePosition = useCallback(
    (value: PlayerPosition) => {
      const next = filters.positions.includes(value)
        ? filters.positions.filter((item) => item !== value)
        : [...filters.positions, value];
      onChange('positions', next);
    },
    [filters.positions, onChange],
  );

  const toggleNationality = useCallback(
    (value: string) => {
      const next = filters.nationalities.includes(value)
        ? filters.nationalities.filter((item) => item !== value)
        : [...filters.nationalities, value];
      onChange('nationalities', next);
    },
    [filters.nationalities, onChange],
  );

  if (!visible) {
    return null;
  }

  return (
    <View className="absolute inset-0 z-50">
      <BottomSheet
        visible={visible}
        onClose={onClose}
        title={t('scout:discover.advancedFilters')}
        contentClassName="px-0"
      >
        <ScrollView
          className="flex-1 px-4"
          contentContainerStyle={{ paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
        >
          <View className="gap-4">
            <View className="flex-row gap-3">
              <Input
                label={t('scout:filters.minAge')}
                value={filters.ageMin?.toString() ?? ''}
                onChangeText={(value) =>
                  onChange('ageMin', value ? Number(value) : null)
                }
                keyboardType="number-pad"
                containerClassName="flex-1"
              />
              <Input
                label={t('scout:filters.maxAge')}
                value={filters.ageMax?.toString() ?? ''}
                onChangeText={(value) =>
                  onChange('ageMax', value ? Number(value) : null)
                }
                keyboardType="number-pad"
                containerClassName="flex-1"
              />
            </View>

            <ChipSelect
              label={t('scout:filters.position')}
              options={POSITION_OPTIONS.map((value) => ({ value, label: t(`scout:position.${value}`) }))}
              selected={filters.positions}
              onToggle={togglePosition}
            />

            <ChipSelect
              label={t('scout:filters.nationality')}
              options={NATIONALITY_OPTIONS.map((n) => ({ value: n, label: n }))}
              selected={filters.nationalities}
              onToggle={toggleNationality}
            />

            <View className="gap-2">
              <Text variant="label">{t('scout:filters.preferredFoot')}</Text>
              <View className="flex-row gap-2">
                {(['left', 'right', 'both'] as PreferredFoot[]).map((foot) => (
                  <Button
                    key={foot}
                    variant={filters.preferredFoot === foot ? 'accent' : 'secondary'}
                    size="sm"
                    className="flex-1"
                    onPress={() =>
                      onChange('preferredFoot', filters.preferredFoot === foot ? null : foot)
                    }
                  >
                    {t(`scout:filters.${foot}`)}
                  </Button>
                ))}
              </View>
            </View>

            <View className="flex-row gap-3">
              <Input
                label={t('scout:filters.minHeight')}
                value={filters.heightMin?.toString() ?? ''}
                onChangeText={(value) =>
                  onChange('heightMin', value ? Number(value) : null)
                }
                keyboardType="number-pad"
                containerClassName="flex-1"
              />
              <Input
                label={t('scout:filters.minWeight')}
                value={filters.weightMin?.toString() ?? ''}
                onChangeText={(value) =>
                  onChange('weightMin', value ? Number(value) : null)
                }
                keyboardType="number-pad"
                containerClassName="flex-1"
              />
            </View>

            <View className="flex-row gap-3">
              <Input
                label={t('scout:filters.maxHeight')}
                value={filters.heightMax?.toString() ?? ''}
                onChangeText={(value) =>
                  onChange('heightMax', value ? Number(value) : null)
                }
                keyboardType="number-pad"
                containerClassName="flex-1"
              />
              <Input
                label={t('scout:filters.maxWeight')}
                value={filters.weightMax?.toString() ?? ''}
                onChangeText={(value) =>
                  onChange('weightMax', value ? Number(value) : null)
                }
                keyboardType="number-pad"
                containerClassName="flex-1"
              />
            </View>

            <View className="gap-2">
              <Text variant="label">{t('scout:filters.availability')}</Text>
              <View className="flex-row flex-wrap gap-2">
                {(['available', 'unavailable', 'on_loan'] as PlayerAvailability[]).map((status) => {
                  const statusKey =
                    status === 'on_loan' ? 'onLoan' : status;
                  return (
                  <Button
                    key={status}
                    variant={filters.availability === status ? 'accent' : 'secondary'}
                    size="sm"
                    onPress={() =>
                      onChange('availability', filters.availability === status ? null : status)
                    }
                  >
                    {t(`scout:filters.${statusKey}`)}
                  </Button>
                  );
                })}
              </View>
            </View>

            <ChipSelect
              label={t('scout:filters.club')}
              options={CLUB_OPTIONS.map((c) => ({ value: c, label: c }))}
              selected={filters.clubs}
              onToggle={(value) => {
                const next = filters.clubs.includes(value)
                  ? filters.clubs.filter((item) => item !== value)
                  : [...filters.clubs, value];
                onChange('clubs', next);
              }}
            />

            <ChipSelect
              label={t('scout:filters.league')}
              options={LEAGUE_OPTIONS.map((l) => ({ value: l, label: l }))}
              selected={filters.leagues}
              onToggle={(value) => {
                const next = filters.leagues.includes(value)
                  ? filters.leagues.filter((item) => item !== value)
                  : [...filters.leagues, value];
                onChange('leagues', next);
              }}
            />

            <View className="flex-row gap-3">
              <Input
                label={t('scout:filters.maxDistance')}
                value={filters.distanceMaxKm?.toString() ?? ''}
                onChangeText={(value) =>
                  onChange('distanceMaxKm', value ? Number(value) : null)
                }
                keyboardType="number-pad"
                containerClassName="flex-1"
              />
              <Input
                label={t('scout:filters.minSprint')}
                value={filters.sprintSpeedMin?.toString() ?? ''}
                onChangeText={(value) =>
                  onChange('sprintSpeedMin', value ? Number(value) : null)
                }
                keyboardType="decimal-pad"
                containerClassName="flex-1"
              />
            </View>

            <View className="flex-row gap-3">
              <Input
                label={t('scout:filters.minPassing')}
                value={filters.passingMin?.toString() ?? ''}
                onChangeText={(value) =>
                  onChange('passingMin', value ? Number(value) : null)
                }
                keyboardType="number-pad"
                containerClassName="flex-1"
              />
              <Input
                label={t('scout:filters.minShooting')}
                value={filters.shootingMin?.toString() ?? ''}
                onChangeText={(value) =>
                  onChange('shootingMin', value ? Number(value) : null)
                }
                keyboardType="number-pad"
                containerClassName="flex-1"
              />
            </View>

            <View className="flex-row gap-3">
              <Input
                label={t('scout:filters.minDefending')}
                value={filters.defendingMin?.toString() ?? ''}
                onChangeText={(value) =>
                  onChange('defendingMin', value ? Number(value) : null)
                }
                keyboardType="number-pad"
                containerClassName="flex-1"
              />
              <Input
                label={t('scout:filters.minPhysical')}
                value={filters.physicalMin?.toString() ?? ''}
                onChangeText={(value) =>
                  onChange('physicalMin', value ? Number(value) : null)
                }
                keyboardType="number-pad"
                containerClassName="flex-1"
              />
            </View>

            <View className="gap-1">
              <Text variant="label">{t('scout:filters.minWeakFoot')}</Text>
              <StarRating
                value={filters.weakFootMin}
                size="md"
                label={t('scout:filters.minWeakFoot')}
                onChange={(value) => onChange('weakFootMin', value)}
              />
              <Text variant="caption" color="tertiary">
                {filters.weakFootMin === null
                  ? t('scout:filters.anyStars')
                  : t('scout:filters.atLeastStars', { count: filters.weakFootMin })}
              </Text>
            </View>

            <View className="gap-1">
              <Text variant="label">{t('scout:filters.minSkillMoves')}</Text>
              <StarRating
                value={filters.skillMovesMin}
                size="md"
                label={t('scout:filters.minSkillMoves')}
                onChange={(value) => onChange('skillMovesMin', value)}
              />
              <Text variant="caption" color="tertiary">
                {filters.skillMovesMin === null
                  ? t('scout:filters.anyStars')
                  : t('scout:filters.atLeastStars', { count: filters.skillMovesMin })}
              </Text>
            </View>

            <View className="flex-row gap-3">
              <Input
                label={t('scout:filters.minMatches')}
                value={filters.matchCountMin?.toString() ?? ''}
                onChangeText={(value) =>
                  onChange('matchCountMin', value ? Number(value) : null)
                }
                keyboardType="number-pad"
                containerClassName="flex-1"
              />
            </View>

            <View className="flex-row gap-3">
              <Button
                variant={filters.recentlyActive ? 'accent' : 'secondary'}
                className="flex-1"
                onPress={() => onChange('recentlyActive', !filters.recentlyActive)}
              >
                {t('scout:filters.recentlyActive')}
              </Button>
              <Button
                variant={filters.hasHighlightVideos ? 'accent' : 'secondary'}
                className="flex-1"
                onPress={() => onChange('hasHighlightVideos', !filters.hasHighlightVideos)}
              >
                {t('scout:filters.hasVideos')}
              </Button>
            </View>

            <Button
              variant={filters.verifiedOnly ? 'accent' : 'secondary'}
              onPress={() => onChange('verifiedOnly', !filters.verifiedOnly)}
            >
              {t('scout:filters.verifiedOnly')}
            </Button>

            <View className="gap-3">
              <Text variant="label" accessibilityRole="header">
                {t('scout:filters.brief.title')}
              </Text>
              <Input
                label={t('scout:filters.brief.roles')}
                placeholder={t('scout:filters.brief.rolesPlaceholder')}
                value={rolesText}
                onChangeText={setRolesText}
                onEndEditing={() =>
                  onChange(
                    'roles',
                    rolesText
                      .split(',')
                      .map((role) => role.trim())
                      .filter(Boolean),
                  )
                }
              />
              <View className="gap-2">
                <Text variant="label">{t('scout:filters.brief.minEvidence')}</Text>
                <View className="flex-row gap-2">
                  {([null, 'moderate', 'strong'] as const).map((level) => (
                    <Button
                      key={level ?? 'any'}
                      variant={filters.minEvidenceCoverage === level ? 'accent' : 'secondary'}
                      size="sm"
                      className="flex-1"
                      accessibilityState={{ selected: filters.minEvidenceCoverage === level }}
                      onPress={() => onChange('minEvidenceCoverage', level)}
                    >
                      {t(`scout:filters.brief.${level ?? 'any'}`)}
                    </Button>
                  ))}
                </View>
              </View>
              <View className="gap-2">
                <Text variant="label">{t('scout:filters.brief.freshness')}</Text>
                <View className="flex-row flex-wrap gap-2">
                  <Button
                    variant={filters.evidenceMaxAgeDays === null ? 'accent' : 'secondary'}
                    size="sm"
                    accessibilityState={{ selected: filters.evidenceMaxAgeDays === null }}
                    onPress={() => onChange('evidenceMaxAgeDays', null)}
                  >
                    {t('scout:filters.brief.any')}
                  </Button>
                  {FRESHNESS_OPTIONS.map((days) => (
                    <Button
                      key={days}
                      variant={filters.evidenceMaxAgeDays === days ? 'accent' : 'secondary'}
                      size="sm"
                      accessibilityState={{ selected: filters.evidenceMaxAgeDays === days }}
                      onPress={() => onChange('evidenceMaxAgeDays', days)}
                    >
                      {t('scout:filters.brief.days', { count: days })}
                    </Button>
                  ))}
                </View>
              </View>
            </View>

            <View className="flex-row gap-3 border-t border-divider pt-3">
              <Button variant="secondary" className="flex-1" onPress={onReset}>
                {t('scout:filters.reset')}
              </Button>
              <Button variant="accent" className="flex-1" onPress={onApply}>
                {t('scout:filters.apply')}
              </Button>
            </View>
          </View>
        </ScrollView>
      </BottomSheet>
    </View>
  );
}

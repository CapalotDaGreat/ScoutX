import { useCallback, useMemo, useRef } from 'react';
import { ScrollView, View } from 'react-native';
import BottomSheetLib from '@gorhom/bottom-sheet';
import { BottomSheet } from '@/components/feedback/BottomSheet';
import { Button } from '@/components/primitives/Button';
import { Input } from '@/components/primitives/Input';
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

export function DiscoveryFilterSheet({
  visible,
  filters,
  onClose,
  onChange,
  onReset,
  onApply,
}: DiscoveryFilterSheetProps) {
  const sheetRef = useRef<BottomSheetLib>(null);
  const snapPoints = useMemo(() => ['85%'], []);

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
        ref={sheetRef}
        index={0}
        snapPoints={snapPoints}
        onClose={onClose}
        title="Advanced Filters"
        contentClassName="px-0"
      >
        <ScrollView
          className="flex-1 px-4"
          contentContainerStyle={{ paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
        >
          <View className="gap-5">
            <View className="flex-row gap-3">
              <Input
                label="Min Age"
                value={filters.ageMin?.toString() ?? ''}
                onChangeText={(value) =>
                  onChange('ageMin', value ? Number(value) : null)
                }
                keyboardType="number-pad"
                containerClassName="flex-1"
              />
              <Input
                label="Max Age"
                value={filters.ageMax?.toString() ?? ''}
                onChangeText={(value) =>
                  onChange('ageMax', value ? Number(value) : null)
                }
                keyboardType="number-pad"
                containerClassName="flex-1"
              />
            </View>

            <ChipSelect
              label="Position"
              options={POSITION_OPTIONS}
              selected={filters.positions}
              onToggle={togglePosition}
            />

            <ChipSelect
              label="Nationality"
              options={NATIONALITY_OPTIONS.map((n) => ({ value: n, label: n }))}
              selected={filters.nationalities}
              onToggle={toggleNationality}
            />

            <View className="gap-2">
              <Text variant="label">Preferred Foot</Text>
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
                    {foot}
                  </Button>
                ))}
              </View>
            </View>

            <View className="flex-row gap-3">
              <Input
                label="Min Height (cm)"
                value={filters.heightMin?.toString() ?? ''}
                onChangeText={(value) =>
                  onChange('heightMin', value ? Number(value) : null)
                }
                keyboardType="number-pad"
                containerClassName="flex-1"
              />
              <Input
                label="Min Weight (kg)"
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
                label="Max Height (cm)"
                value={filters.heightMax?.toString() ?? ''}
                onChangeText={(value) =>
                  onChange('heightMax', value ? Number(value) : null)
                }
                keyboardType="number-pad"
                containerClassName="flex-1"
              />
              <Input
                label="Max Weight (kg)"
                value={filters.weightMax?.toString() ?? ''}
                onChangeText={(value) =>
                  onChange('weightMax', value ? Number(value) : null)
                }
                keyboardType="number-pad"
                containerClassName="flex-1"
              />
            </View>

            <View className="gap-2">
              <Text variant="label">Availability</Text>
              <View className="flex-row flex-wrap gap-2">
                {(['available', 'unavailable', 'on_loan'] as PlayerAvailability[]).map((status) => (
                  <Button
                    key={status}
                    variant={filters.availability === status ? 'accent' : 'secondary'}
                    size="sm"
                    onPress={() =>
                      onChange('availability', filters.availability === status ? null : status)
                    }
                  >
                    {status.replace('_', ' ')}
                  </Button>
                ))}
              </View>
            </View>

            <ChipSelect
              label="Club"
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
              label="League"
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
                label="Min Overall"
                value={filters.overallMin?.toString() ?? ''}
                onChangeText={(value) =>
                  onChange('overallMin', value ? Number(value) : null)
                }
                keyboardType="number-pad"
                containerClassName="flex-1"
              />
              <Input
                label="Min Potential"
                value={filters.potentialMin?.toString() ?? ''}
                onChangeText={(value) =>
                  onChange('potentialMin', value ? Number(value) : null)
                }
                keyboardType="number-pad"
                containerClassName="flex-1"
              />
            </View>

            <View className="flex-row gap-3">
              <Input
                label="Max Distance (km)"
                value={filters.distanceMaxKm?.toString() ?? ''}
                onChangeText={(value) =>
                  onChange('distanceMaxKm', value ? Number(value) : null)
                }
                keyboardType="number-pad"
                containerClassName="flex-1"
              />
              <Input
                label="Min Sprint (km/h)"
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
                label="Min Passing"
                value={filters.passingMin?.toString() ?? ''}
                onChangeText={(value) =>
                  onChange('passingMin', value ? Number(value) : null)
                }
                keyboardType="number-pad"
                containerClassName="flex-1"
              />
              <Input
                label="Min Shooting"
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
                label="Min Defending"
                value={filters.defendingMin?.toString() ?? ''}
                onChangeText={(value) =>
                  onChange('defendingMin', value ? Number(value) : null)
                }
                keyboardType="number-pad"
                containerClassName="flex-1"
              />
              <Input
                label="Min Physical"
                value={filters.physicalMin?.toString() ?? ''}
                onChangeText={(value) =>
                  onChange('physicalMin', value ? Number(value) : null)
                }
                keyboardType="number-pad"
                containerClassName="flex-1"
              />
            </View>

            <View className="flex-row gap-3">
              <Input
                label="Min Weak Foot"
                value={filters.weakFootMin?.toString() ?? ''}
                onChangeText={(value) =>
                  onChange('weakFootMin', value ? Number(value) : null)
                }
                keyboardType="number-pad"
                containerClassName="flex-1"
              />
              <Input
                label="Min Skill Moves"
                value={filters.skillMovesMin?.toString() ?? ''}
                onChangeText={(value) =>
                  onChange('skillMovesMin', value ? Number(value) : null)
                }
                keyboardType="number-pad"
                containerClassName="flex-1"
              />
              <Input
                label="Min Matches"
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
                Recently Active
              </Button>
              <Button
                variant={filters.hasHighlightVideos ? 'accent' : 'secondary'}
                className="flex-1"
                onPress={() => onChange('hasHighlightVideos', !filters.hasHighlightVideos)}
              >
                Has Videos
              </Button>
            </View>

            <Button
              variant={filters.verifiedOnly ? 'accent' : 'secondary'}
              onPress={() => onChange('verifiedOnly', !filters.verifiedOnly)}
            >
              Verified Players Only
            </Button>

            <View className="flex-row gap-3 pt-2">
              <Button variant="secondary" className="flex-1" onPress={onReset}>
                Reset
              </Button>
              <Button variant="accent" className="flex-1" onPress={onApply}>
                Apply Filters
              </Button>
            </View>
          </View>
        </ScrollView>
      </BottomSheet>
    </View>
  );
}

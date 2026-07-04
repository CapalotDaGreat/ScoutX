import { View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Dropdown } from '@/components/primitives/Dropdown';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import { CareerTimelineEditor } from '@/features/player-profile/components/identity/CareerTimelineEditor';
import { ClubHistoryEditor } from '@/features/player-profile/components/identity/ClubHistoryEditor';
import {
  ACADEMIC_STATUS_OPTIONS,
  AVAILABILITY_OPTIONS,
  CONTRACT_STATUS_OPTIONS,
  FOOT_OPTIONS,
  FORMATION_OPTIONS,
  PLAYING_STYLE_OPTIONS,
  RATING_OPTIONS,
  TRANSFER_STATUS_OPTIONS,
} from '@/features/player-profile/constants/footballIdentityOptions';
import { type FootballIdentity } from '@/features/player-profile/types/footballIdentity';
import {
  formatCommaSeparatedList,
  parseCommaSeparatedList,
  parseOptionalNumber,
} from '@/features/player-profile/utils/identityFormUtils';

export type FootballIdentityFieldsProps = {
  identity: FootballIdentity;
  onChange: <Key extends keyof FootballIdentity>(
    key: Key,
    value: FootballIdentity[Key],
  ) => void;
};

export function FootballIdentityFields({ identity, onChange }: FootballIdentityFieldsProps) {
  return (
    <View className="gap-5">
      <Text variant="label" color="secondary">
        Career
      </Text>
      <Input
        label="Current Club"
        value={identity.currentClub}
        onChangeText={(value) => onChange('currentClub', value)}
        placeholder="Northstar FC"
      />
      <ClubHistoryEditor
        entries={identity.clubHistory}
        onChange={(entries) => onChange('clubHistory', entries)}
      />
      <CareerTimelineEditor
        entries={identity.careerTimeline}
        onChange={(entries) => onChange('careerTimeline', entries)}
      />

      <Text variant="label" color="secondary">
        Playing Profile
      </Text>
      <Input
        label="Preferred Positions"
        value={formatCommaSeparatedList(identity.preferredPositions)}
        onChangeText={(value) => onChange('preferredPositions', parseCommaSeparatedList(value))}
        placeholder="Attacking Midfielder, Left Winger"
        hint="Separate multiple positions with commas"
      />
      <Input
        label="Secondary Positions"
        value={formatCommaSeparatedList(identity.secondaryPositions)}
        onChangeText={(value) => onChange('secondaryPositions', parseCommaSeparatedList(value))}
        placeholder="Central Midfielder"
      />
      <Dropdown
        label="Preferred Formation"
        value={identity.preferredFormation || undefined}
        onChange={(value) => onChange('preferredFormation', value)}
        options={FORMATION_OPTIONS.map((formation) => ({
          label: formation,
          value: formation,
        }))}
        placeholder="Select formation"
      />
      <Dropdown
        label="Preferred Playing Style"
        value={identity.preferredPlayingStyle || undefined}
        onChange={(value) => onChange('preferredPlayingStyle', value)}
        options={PLAYING_STYLE_OPTIONS.map((style) => ({
          label: style,
          value: style,
        }))}
        placeholder="Select style"
      />
      <Dropdown
        label="Strong Foot"
        value={identity.strongFoot}
        onChange={(value) => onChange('strongFoot', value)}
        options={FOOT_OPTIONS}
      />
      <View className="flex-row gap-3">
        <Dropdown
          label="Weak Foot Rating"
          value={String(identity.weakFootRating)}
          onChange={(value) => onChange('weakFootRating', Number(value))}
          options={RATING_OPTIONS.map((rating) => ({
            label: `${rating}/5`,
            value: String(rating),
          }))}
          className="flex-1"
        />
        <Dropdown
          label="Skill Moves Rating"
          value={String(identity.skillMovesRating)}
          onChange={(value) => onChange('skillMovesRating', Number(value))}
          options={RATING_OPTIONS.map((rating) => ({
            label: `${rating}/5`,
            value: String(rating),
          }))}
          className="flex-1"
        />
      </View>

      <Text variant="label" color="secondary">
        Professional Status
      </Text>
      <Dropdown
        label="Contract Status"
        value={identity.contractStatus}
        onChange={(value) => onChange('contractStatus', value)}
        options={CONTRACT_STATUS_OPTIONS}
      />
      <Dropdown
        label="Availability"
        value={identity.availability}
        onChange={(value) => onChange('availability', value)}
        options={AVAILABILITY_OPTIONS}
      />
      <Dropdown
        label="Transfer Status"
        value={identity.transferStatus}
        onChange={(value) => onChange('transferStatus', value)}
        options={TRANSFER_STATUS_OPTIONS}
      />
      <Input
        label="Preferred Countries"
        value={formatCommaSeparatedList(identity.preferredCountries)}
        onChangeText={(value) => onChange('preferredCountries', parseCommaSeparatedList(value))}
        placeholder="England, Netherlands"
      />
      <Input
        label="Preferred Leagues"
        value={formatCommaSeparatedList(identity.preferredLeagues)}
        onChangeText={(value) => onChange('preferredLeagues', parseCommaSeparatedList(value))}
        placeholder="Premier League, Eredivisie"
      />

      <Text variant="label" color="secondary">
        Personal
      </Text>
      <View className="flex-row gap-3">
        <Input
          label="Jersey Number"
          value={identity.jerseyNumber?.toString() ?? ''}
          onChangeText={(value) => onChange('jerseyNumber', parseOptionalNumber(value))}
          keyboardType="number-pad"
          containerClassName="flex-1"
        />
        <View className="flex-1 justify-end">
          <Button
            variant={identity.hasCaptainExperience ? 'accent' : 'secondary'}
            onPress={() => onChange('hasCaptainExperience', !identity.hasCaptainExperience)}
          >
            Captain: {identity.hasCaptainExperience ? 'Yes' : 'No'}
          </Button>
        </View>
      </View>
      <Dropdown
        label="Academic Status"
        value={identity.academicStatus}
        onChange={(value) => onChange('academicStatus', value)}
        options={ACADEMIC_STATUS_OPTIONS}
      />
      <Input
        label="Languages Spoken"
        value={formatCommaSeparatedList(identity.languagesSpoken)}
        onChangeText={(value) => onChange('languagesSpoken', parseCommaSeparatedList(value))}
        placeholder="English, Spanish"
      />

      <Text variant="label" color="secondary">
        Story
      </Text>
      <Input
        label="Biography Headline"
        value={identity.biographyHeadline}
        onChangeText={(value) => onChange('biographyHeadline', value)}
        placeholder="Creative midfielder with elite vision"
      />
    </View>
  );
}

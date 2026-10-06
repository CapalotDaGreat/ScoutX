import { View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Dropdown } from '@/components/primitives/Dropdown';
import { Input } from '@/components/primitives/Input';
import { StarRating } from '@/components/primitives/StarRating';
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
  TRANSFER_STATUS_OPTIONS,
} from '@/features/player-profile/constants/footballIdentityOptions';
import { useIdentityLabels } from '@/features/player-profile/hooks/useIdentityLabels';
import { type FootballIdentity } from '@/features/player-profile/types/footballIdentity';
import {
  formatCommaSeparatedList,
  parseCommaSeparatedList,
  parseOptionalNumber,
} from '@/features/player-profile/utils/identityFormUtils';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { starLevelKey } from '@/utils/starRating';

export type FootballIdentityFieldsProps = {
  identity: FootballIdentity;
  onChange: <Key extends keyof FootballIdentity>(
    key: Key,
    value: FootballIdentity[Key],
  ) => void;
};

export function FootballIdentityFields({ identity, onChange }: FootballIdentityFieldsProps) {
  const { t } = useAppTranslation('portfolio');
  const labels = useIdentityLabels();
  return (
    <View className="gap-5">
      <Text variant="label" color="secondary">
        {t('identity.sections.career')}
      </Text>
      <Input
        label={t('identity.fields.currentClub')}
        value={identity.currentClub}
        onChangeText={(value) => onChange('currentClub', value)}
        placeholder={t('identity.fields.clubPlaceholder')}
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
        {t('identity.sections.playingProfile')}
      </Text>
      <Input
        label={t('identity.fields.preferredPositions')}
        value={formatCommaSeparatedList(identity.preferredPositions)}
        onChangeText={(value) => onChange('preferredPositions', parseCommaSeparatedList(value))}
        placeholder={t('identity.fields.positionsPlaceholder')}
        hint={t('identity.fields.positionsHint')}
      />
      <Input
        label={t('identity.fields.secondaryPositions')}
        value={formatCommaSeparatedList(identity.secondaryPositions)}
        onChangeText={(value) => onChange('secondaryPositions', parseCommaSeparatedList(value))}
        placeholder={t('identity.fields.listPlaceholder')}
      />
      <Dropdown
        label={t('identity.fields.preferredFormation')}
        value={identity.preferredFormation || undefined}
        onChange={(value) => onChange('preferredFormation', value)}
        options={FORMATION_OPTIONS.map((formation) => ({
          label: formation,
          value: formation,
        }))}
        placeholder={labels.notStated}
      />
      <Dropdown
        label={t('identity.fields.playingStyle')}
        value={identity.preferredPlayingStyle || undefined}
        onChange={(value) => onChange('preferredPlayingStyle', value)}
        options={PLAYING_STYLE_OPTIONS.map((style) => ({
          label: labels.style(style),
          value: style,
        }))}
        placeholder={labels.notStated}
      />
      <Dropdown
        label={t('identity.fields.strongFoot')}
        value={identity.strongFoot ?? undefined}
        onChange={(value) => onChange('strongFoot', value)}
        options={FOOT_OPTIONS.map((option) => ({
          label: labels.foot(option.value),
          value: option.value,
        }))}
        placeholder={labels.notStated}
      />
      <View className="gap-3">
        <View className="gap-1">
          <Text variant="label">{t('identity.fields.weakFoot')}</Text>
          <StarRating
            value={identity.weakFootRating}
            size="lg"
            label={t('identity.fields.weakFoot')}
            onChange={(value) => onChange('weakFootRating', value)}
          />
          <Text variant="caption" color="tertiary">
            {identity.weakFootRating === null
              ? labels.notStated
              : t(`identity.starGuide.weakFoot.${starLevelKey(identity.weakFootRating)}`)}
          </Text>
        </View>
        <View className="gap-1">
          <Text variant="label">{t('identity.fields.skillMoves')}</Text>
          <StarRating
            value={identity.skillMovesRating}
            size="lg"
            label={t('identity.fields.skillMoves')}
            onChange={(value) => onChange('skillMovesRating', value)}
          />
          <Text variant="caption" color="tertiary">
            {identity.skillMovesRating === null
              ? labels.notStated
              : t(`identity.starGuide.skillMoves.${starLevelKey(identity.skillMovesRating)}`)}
          </Text>
        </View>
      </View>
      <Text variant="caption" color="tertiary">
        {t('identity.fields.selfRatingHint')}
      </Text>

      <Text variant="label" color="secondary">
        {t('identity.sections.professionalStatus')}
      </Text>
      <Dropdown
        label={t('identity.fields.contractStatus')}
        value={identity.contractStatus ?? undefined}
        onChange={(value) => onChange('contractStatus', value)}
        options={CONTRACT_STATUS_OPTIONS.map((option) => ({
          label: labels.contract(option.value),
          value: option.value,
        }))}
        placeholder={labels.notStated}
      />
      <Dropdown
        label={t('identity.fields.availability')}
        value={identity.availability ?? undefined}
        onChange={(value) => onChange('availability', value)}
        options={AVAILABILITY_OPTIONS.map((option) => ({
          label: labels.availability(option.value),
          value: option.value,
        }))}
        placeholder={labels.notStated}
      />
      <Dropdown
        label={t('identity.fields.transferStatus')}
        value={identity.transferStatus ?? undefined}
        onChange={(value) => onChange('transferStatus', value)}
        options={TRANSFER_STATUS_OPTIONS.map((option) => ({
          label: labels.transfer(option.value),
          value: option.value,
        }))}
        placeholder={labels.notStated}
      />
      <Input
        label={t('identity.fields.preferredCountries')}
        value={formatCommaSeparatedList(identity.preferredCountries)}
        onChangeText={(value) => onChange('preferredCountries', parseCommaSeparatedList(value))}
        placeholder={t('identity.fields.listPlaceholder')}
      />
      <Input
        label={t('identity.fields.preferredLeagues')}
        value={formatCommaSeparatedList(identity.preferredLeagues)}
        onChangeText={(value) => onChange('preferredLeagues', parseCommaSeparatedList(value))}
        placeholder={t('identity.fields.listPlaceholder')}
      />

      <Text variant="label" color="secondary">
        {t('identity.sections.personal')}
      </Text>
      <View className="flex-row gap-3">
        <Input
          label={t('identity.fields.jerseyNumber')}
          value={identity.jerseyNumber?.toString() ?? ''}
          onChangeText={(value) => onChange('jerseyNumber', parseOptionalNumber(value))}
          keyboardType="number-pad"
          containerClassName="flex-1"
        />
        <View className="flex-1 justify-end">
          <Button
            variant={identity.hasCaptainExperience ? 'accent' : 'secondary'}
            onPress={() => onChange('hasCaptainExperience', !identity.hasCaptainExperience)}
            accessibilityRole="switch"
            accessibilityState={{ checked: identity.hasCaptainExperience }}
          >
            {`${t('identity.fields.captain')}: ${
              identity.hasCaptainExperience ? t('identity.yes') : t('identity.no')
            }`}
          </Button>
        </View>
      </View>
      <Dropdown
        label={t('identity.fields.academicStatus')}
        value={identity.academicStatus ?? undefined}
        onChange={(value) => onChange('academicStatus', value)}
        options={ACADEMIC_STATUS_OPTIONS.map((option) => ({
          label: labels.academic(option.value),
          value: option.value,
        }))}
        placeholder={labels.notStated}
      />
      <Input
        label={t('identity.fields.languages')}
        value={formatCommaSeparatedList(identity.languagesSpoken)}
        onChangeText={(value) => onChange('languagesSpoken', parseCommaSeparatedList(value))}
        placeholder={t('identity.fields.listPlaceholder')}
      />

      <Text variant="label" color="secondary">
        {t('identity.sections.story')}
      </Text>
      <Input
        label={t('identity.fields.biographyHeadline')}
        value={identity.biographyHeadline}
        onChangeText={(value) => onChange('biographyHeadline', value)}
        placeholder={t('identity.fields.biographyPlaceholder')}
      />
    </View>
  );
}

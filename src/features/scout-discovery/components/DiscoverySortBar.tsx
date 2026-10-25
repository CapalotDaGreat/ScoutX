import { Dropdown } from '@/components/primitives/Dropdown';
import { SORT_OPTIONS } from '@/features/scout-discovery/constants';
import { type DiscoverySortOption } from '@/features/scout-discovery/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type DiscoverySortBarProps = {
  sort: DiscoverySortOption;
  onSortChange: (sort: DiscoverySortOption) => void;
};

export function DiscoverySortBar({ sort, onSortChange }: DiscoverySortBarProps) {
  const { t } = useAppTranslation('scout');
  return (
    <Dropdown label={t('discover.sortBy')} value={sort} onChange={onSortChange}
      options={SORT_OPTIONS.map((option) => ({ value: option, label: t(`sort.${option}`) }))} />
  );
}

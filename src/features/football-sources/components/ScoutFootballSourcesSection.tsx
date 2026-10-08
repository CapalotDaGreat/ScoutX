import { useEffect, useState } from 'react';
import { CollapsibleSection } from '@/components/layout/CollapsibleSection';
import { type PublicFootballSource } from '@/features/football-sources/core';
import { PublicFootballSourcesList } from '@/features/football-sources/components/PublicFootballSourcesList';
import { fetchScoutFootballSources } from '@/features/football-sources/repositories/FootballSourceRepository';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

/** Links the player shared with scouts. Renders nothing when there are none to show. */
export function ScoutFootballSourcesSection({ playerId }: { playerId: string }) {
  const { t } = useAppTranslation('passport');
  const [sources, setSources] = useState<PublicFootballSource[]>([]);

  useEffect(() => {
    let active = true;
    void fetchScoutFootballSources(playerId).then((next) => {
      if (active) setSources(next);
    });
    return () => {
      active = false;
    };
  }, [playerId]);

  if (sources.length === 0) return null;
  return (
    <CollapsibleSection
      title={t('footballSources.publicTitle')}
      subtitle={t('footballSources.publicSubtitle')}
      persistKey={`detail-football-sources-${playerId}`}
    >
      <PublicFootballSourcesList sources={sources} ownerId={playerId} canReport />
    </CollapsibleSection>
  );
}

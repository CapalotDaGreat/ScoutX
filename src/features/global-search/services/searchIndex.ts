export type SearchHitKind = 'match' | 'journey' | 'trial' | 'goal' | 'player';

export type SearchHit = {
  id: string;
  kind: SearchHitKind;
  title: string;
  subtitle: string | null;
  route: 'match' | 'career' | 'trials' | 'player';
  entityId: string;
};

export function searchOwnedRecords(queryText: string, records: readonly SearchHit[]): SearchHit[] {
  const needle = queryText.trim().toLowerCase();
  if (!needle) {
    return [];
  }
  return records
    .filter((hit) => {
      const haystack = `${hit.title} ${hit.subtitle ?? ''}`.toLowerCase();
      return haystack.includes(needle);
    })
    .slice(0, 40);
}

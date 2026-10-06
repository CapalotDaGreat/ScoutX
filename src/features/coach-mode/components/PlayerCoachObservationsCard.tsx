import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { FreshnessLabel } from '@/components/evidence/FreshnessLabel';
import { getFirestoreDb } from '@/config/firebase';
import type { CoachObservation } from '@/features/coach-mode/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type PlayerCoachObservationsCardProps = {
  playerId: string | null;
};

export function PlayerCoachObservationsCard({ playerId }: PlayerCoachObservationsCardProps) {
  const { t } = useAppTranslation(['career', 'evidence']);
  const [notes, setNotes] = useState<CoachObservation[]>([]);

  useEffect(() => {
    if (!playerId) {
      setNotes([]);
      return;
    }
    const db = getFirestoreDb();
    if (!db) {
      setNotes([]);
      return;
    }
    void getDocs(query(collection(db, 'coachObservations'), where('playerId', '==', playerId)))
      .then((snapshot) => {
        setNotes(
          snapshot.docs.map((docSnap) => {
            const data = docSnap.data();
            return {
              id: docSnap.id,
              coachId: String(data.coachId ?? ''),
              playerId: String(data.playerId ?? playerId),
              body: String(data.body ?? ''),
              matchId: typeof data.matchId === 'string' ? data.matchId : null,
              provenance: 'coach_provided' as const,
              createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString(),
            };
          }),
        );
      })
      .catch(() => setNotes([]));
  }, [playerId]);

  return (
    <Card variant="outlined" padding="md" className="gap-2">
      <Text variant="body" className="font-sans-semibold">
        {t('career:coachNotesTitle')}
      </Text>
      <Text variant="caption" color="secondary">
        {t('career:coachNotesLabel')}
      </Text>
      {notes.length === 0 ? (
        <Text variant="body-sm" color="secondary">
          {t('career:coachNotesEmpty')}
        </Text>
      ) : (
        <View className="gap-3">
          {notes.map((note) => (
            <View key={note.id} className="gap-1">
              <FreshnessLabel updatedAt={note.createdAt} sampleSize={1} />
              <Text variant="caption" color="secondary">
                {t('evidence:provenance.coach_provided')}
              </Text>
              <Text variant="body-sm">{note.body}</Text>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

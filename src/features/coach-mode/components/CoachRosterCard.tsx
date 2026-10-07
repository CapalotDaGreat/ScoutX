import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { Card } from '@/components/primitives/Card';
import { Button } from '@/components/primitives/Button';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import { getFirestoreDb } from '@/config/firebase';
import { addPlayerToRoster, createCoachObservation, emptyCoachRoster } from '@/features/coach-mode/services/coachRoster';
import type { CoachObservation, CoachRoster } from '@/features/coach-mode/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type CoachRosterCardProps = {
  coachId: string | null;
};

function parseRoster(coachId: string, data: Record<string, unknown> | undefined): CoachRoster {
  const players = Array.isArray(data?.players)
    ? data.players.flatMap((item) => {
        if (!item || typeof item !== 'object' || !('playerId' in item)) {
          return [];
        }
        const row = item as { playerId?: unknown; addedAt?: unknown; notes?: unknown };
        if (typeof row.playerId !== 'string' || !row.playerId) {
          return [];
        }
        return [
          {
            playerId: row.playerId,
            addedAt: typeof row.addedAt === 'string' ? row.addedAt : new Date().toISOString(),
            notes: typeof row.notes === 'string' ? row.notes : '',
          },
        ];
      })
    : [];
  return {
    coachId,
    players,
    playerIds: players.map((item) => item.playerId),
    updatedAt: typeof data?.updatedAt === 'string' ? data.updatedAt : new Date().toISOString(),
  };
}

export function CoachRosterCard({ coachId }: CoachRosterCardProps) {
  const { t } = useAppTranslation(['scout', 'common']);
  const [roster, setRoster] = useState<CoachRoster | null>(null);
  const [observations, setObservations] = useState<CoachObservation[]>([]);
  const [playerId, setPlayerId] = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!coachId) {
      setRoster(null);
      setObservations([]);
      return;
    }
    const db = getFirestoreDb();
    if (!db) {
      setRoster(emptyCoachRoster(coachId));
      setObservations([]);
      return;
    }
    const rosterSnap = await getDoc(doc(db, 'coachRosters', coachId));
    setRoster(parseRoster(coachId, rosterSnap.data()));
    const observationSnap = await getDocs(
      query(collection(db, 'coachObservations'), where('coachId', '==', coachId)),
    );
    setObservations(
      observationSnap.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          coachId: String(data.coachId ?? coachId),
          playerId: String(data.playerId ?? ''),
          body: String(data.body ?? ''),
          matchId: typeof data.matchId === 'string' ? data.matchId : null,
          provenance: 'coach_provided' as const,
          createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString(),
        };
      }),
    );
  }, [coachId]);

  useEffect(() => {
    void load().catch(() => {
      setError(t('scout:coach.loadFailed'));
    });
  }, [load, t]);

  if (!coachId) {
    return null;
  }

  const persistRoster = async (next: CoachRoster) => {
    const db = getFirestoreDb();
    if (!db) {
      setRoster(next);
      return;
    }
    await setDoc(doc(db, 'coachRosters', coachId), next);
    setRoster(next);
  };

  const handleAddPlayer = async () => {
    const trimmed = playerId.trim();
    if (!trimmed || !roster) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await persistRoster(addPlayerToRoster(roster, trimmed));
      setSelectedPlayerId(trimmed);
      setPlayerId('');
    } catch {
      setError(t('scout:coach.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleAddObservation = async () => {
    if (!selectedPlayerId) {
      return;
    }
    const observation = createCoachObservation(coachId, selectedPlayerId, body, null);
    if (!observation) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const db = getFirestoreDb();
      if (db) {
        await setDoc(doc(db, 'coachObservations', observation.id), observation);
      }
      setObservations((current) => [observation, ...current]);
      setBody('');
    } catch {
      setError(t('scout:coach.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const selectedNotes = observations.filter((item) => item.playerId === selectedPlayerId);

  return (
    <Card variant="outlined" padding="md" className="gap-3">
      <Text variant="body" className="font-sans-semibold">
        {t('scout:coach.rosterTitle')}
      </Text>
      <Text variant="caption" color="secondary">
        {t('scout:coach.rosterHint')}
      </Text>
      {error ? (
        <Text variant="caption" color="error">
          {error}
        </Text>
      ) : null}
      <Input
        label={t('scout:coach.playerIdPlaceholder')}
        value={playerId}
        onChangeText={setPlayerId}
        autoCapitalize="none"
        accessibilityLabel={t('scout:coach.playerIdPlaceholder')}
      />
      <Button variant="secondary" size="sm" onPress={() => void handleAddPlayer()} disabled={saving || !playerId.trim()}>
        {t('scout:coach.addPlayer')}
      </Button>
      {!roster || roster.players.length === 0 ? (
        <Text variant="body-sm" color="secondary">
          {t('scout:coach.rosterEmpty')}
        </Text>
      ) : (
        <View className="gap-2">
          {roster.players.map((player) => (
            <Button
              key={player.playerId}
              variant={selectedPlayerId === player.playerId ? 'accent' : 'ghost'}
              size="sm"
              onPress={() => setSelectedPlayerId(player.playerId)}
              accessibilityLabel={player.playerId}
            >
              {player.playerId}
            </Button>
          ))}
        </View>
      )}
      {selectedPlayerId ? (
        <View className="gap-2">
          <Input
            label={t('scout:coach.observationPlaceholder')}
            value={body}
            onChangeText={setBody}
            multiline
            accessibilityLabel={t('scout:coach.observationPlaceholder')}
          />
          <Button
            variant="accent"
            size="sm"
            onPress={() => void handleAddObservation()}
            disabled={saving || !body.trim()}
          >
            {t('scout:coach.addObservation')}
          </Button>
          {selectedNotes.length === 0 ? (
            <Text variant="body-sm" color="secondary">
              {t('scout:coach.observationEmpty')}
            </Text>
          ) : (
            selectedNotes.map((note) => (
              <Text key={note.id} variant="body-sm">
                {note.body}
              </Text>
            ))
          )}
        </View>
      ) : null}
    </Card>
  );
}

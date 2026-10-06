import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  parseMatchLogFormState,
  type MatchLogFormState,
} from '@/features/player-statistics/models/MatchLogModel';
import { createDraftStore } from '@/features/today/services/draftStore';

export const matchLogDraftStore = createDraftStore<MatchLogFormState>(
  'match-log',
  parseMatchLogFormState,
);

const REVIEWED_ANALYSES_PREFIX = '@scoutx/reviewed-analyses/';
const MAX_REVIEWED = 50;

export async function loadReviewedAnalysisIds(userId: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(`${REVIEWED_ANALYSES_PREFIX}${userId}`);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export async function markAnalysisReviewed(userId: string, jobId: string): Promise<void> {
  const existing = await loadReviewedAnalysisIds(userId);
  if (existing.includes(jobId)) {
    return;
  }
  const next = [jobId, ...existing].slice(0, MAX_REVIEWED);
  await AsyncStorage.setItem(`${REVIEWED_ANALYSES_PREFIX}${userId}`, JSON.stringify(next));
}

type Listener = () => void;
const listeners = new Set<Listener>();

/** Lets Today refresh after drafts or review state change elsewhere in the app. */
export const workflowEvents = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  emit(): void {
    listeners.forEach((listener) => listener());
  },
};

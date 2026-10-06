import {
  doc,
  onSnapshot,
  type DocumentData,
  type DocumentReference,
  type Firestore,
  type Query,
  type QuerySnapshot,
} from 'firebase/firestore';

/** Hard caps for live listeners so shells cannot subscribe to unbounded collections. */
export const LISTENER_LIMITS = {
  activities: 40,
  trials: 50,
  trialNotifications: 40,
  recommendations: 40,
} as const;

export function subscribeToDocument<T>({
  docRef,
  parse,
  onData,
  onFallback,
  onError,
}: {
  docRef: DocumentReference<DocumentData>;
  parse: (data: DocumentData, id: string) => T | null;
  onData: (value: T) => void;
  onFallback: () => void;
  onError?: (error: Error) => void;
}): () => void {
  return onSnapshot(
    docRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const parsed = parse(snapshot.data(), snapshot.id);
        if (parsed) {
          onData(parsed);
          return;
        }
      }
      onFallback();
    },
    (error) => {
      onFallback();
      onError?.(error);
    },
  );
}

export function subscribeToQuery<T>({
  firestoreQuery,
  parse,
  onData,
  onFallback,
  onEmptyFallback,
  onError,
}: {
  firestoreQuery: Query<DocumentData>;
  parse: (data: DocumentData, id: string) => T | null;
  onData: (values: T[]) => void;
  onFallback: () => void;
  onEmptyFallback?: () => void;
  onError?: (error: Error) => void;
}): () => void {
  return onSnapshot(
    firestoreQuery,
    (snapshot: QuerySnapshot<DocumentData>) => {
      const values = snapshot.docs
        .map((document) => parse(document.data(), document.id))
        .filter((item): item is T => item !== null);

      if (values.length === 0 && onEmptyFallback) {
        onEmptyFallback();
        return;
      }

      onData(values);
    },
    (error) => {
      onFallback();
      onError?.(error);
    },
  );
}

export function documentRef(db: Firestore, collectionName: string, id: string) {
  return doc(db, collectionName, id);
}

import { getFunctions, httpsCallable, type Functions } from 'firebase/functions';
import {
  ensureFirebaseInitialized,
  getFirebaseApp,
  isFirebaseConfiguredForProject,
} from '@/config/firebase';
import { connectFunctionsEmulatorIfEnabled } from '@/config/firebaseEmulators';

let functionsClient: Functions | null = null;

export async function getFirebaseFunctionsClient(): Promise<Functions | null> {
  if (!isFirebaseConfiguredForProject()) {
    return null;
  }

  await ensureFirebaseInitialized();

  const app = getFirebaseApp();
  if (!app) {
    return null;
  }

  if (!functionsClient) {
    functionsClient = getFunctions(app);
    connectFunctionsEmulatorIfEnabled(functionsClient);
  }

  return functionsClient;
}

export type CallableRequest<T> = (input: T) => Promise<{ data: unknown }>;

export function createCallableFunction<TRequest>(
  name: string,
): CallableRequest<TRequest> | null {
  if (!isFirebaseConfiguredForProject()) {
    return null;
  }

  return async (input: TRequest) => {
    const functions = await getFirebaseFunctionsClient();
    if (!functions) {
      throw new Error('Firebase Functions is not configured.');
    }

    const callable = httpsCallable<TRequest, unknown>(functions, name);
    return callable(input);
  };
}

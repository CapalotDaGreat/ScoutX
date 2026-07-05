import { getFunctions, httpsCallable, type Functions } from 'firebase/functions';
import { getFirebaseApp } from '@/config/firebase';

let functionsClient: Functions | null = null;

export function getFirebaseFunctionsClient(): Functions | null {
  const app = getFirebaseApp();
  if (!app) {
    return null;
  }

  if (!functionsClient) {
    functionsClient = getFunctions(app);
  }

  return functionsClient;
}

export type CallableRequest<T> = (input: T) => Promise<{ data: unknown }>;

export function createCallableFunction<TRequest>(
  name: string,
): CallableRequest<TRequest> | null {
  const functions = getFirebaseFunctionsClient();
  if (!functions) {
    return null;
  }

  const callable = httpsCallable<TRequest, unknown>(functions, name);
  return async (input: TRequest) => callable(input);
}

import { connectAuthEmulator, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, type Firestore } from 'firebase/firestore';
import { connectFunctionsEmulator, type Functions } from 'firebase/functions';
import { connectStorageEmulator, type FirebaseStorage } from 'firebase/storage';

/**
 * Local emulator wiring for E2E runs. Dev builds only: a release bundle never talks to
 * emulators even if the flag leaks into its environment.
 */
export function shouldUseFirebaseEmulators(): boolean {
  return __DEV__ && process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS === '1';
}

function emulatorHost(): string {
  return process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST || '127.0.0.1';
}

export function connectCoreEmulators(auth: Auth, db: Firestore, storage: FirebaseStorage): void {
  const host = emulatorHost();
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, 8080);
  connectStorageEmulator(storage, host, 9199);
}

export function connectFunctionsEmulatorIfEnabled(functions: Functions): void {
  if (shouldUseFirebaseEmulators()) {
    connectFunctionsEmulator(functions, emulatorHost(), 5001);
  }
}

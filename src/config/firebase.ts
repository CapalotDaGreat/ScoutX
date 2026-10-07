import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  // @ts-expect-error RN export exists in the react-native auth bundle; missing from default typings.
  getReactNativePersistence,
  type Auth,
} from 'firebase/auth';
import { getFirestore, initializeFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { initializeFirebaseAppCheck } from '@/config/firebaseAppCheck';
import { connectCoreEmulators, shouldUseFirebaseEmulators } from '@/config/firebaseEmulators';

// Expo only inlines static process.env.EXPO_PUBLIC_* references (not env[key]).
const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
};

const isFirebaseConfigured = Object.values(firebaseConfig).every((value) => Boolean(value));

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;
let initializationPromise: Promise<void> | null = null;
let isInitialized = false;

function createAuth(firebaseApp: FirebaseApp): Auth {
  if (Platform.OS === 'web') {
    return getAuth(firebaseApp);
  }

  try {
    if (typeof getReactNativePersistence !== 'function') {
      return getAuth(firebaseApp);
    }

    return initializeAuth(firebaseApp, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    return getAuth(firebaseApp);
  }
}

// Optional model fields are often `undefined`; without this Firestore rejects the whole write.
function createFirestore(firebaseApp: FirebaseApp): Firestore {
  try {
    return initializeFirestore(firebaseApp, { ignoreUndefinedProperties: true });
  } catch {
    return getFirestore(firebaseApp);
  }
}

async function bootstrapFirebase(): Promise<void> {
  if (!isFirebaseConfigured || isInitialized) {
    return;
  }

  app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  if (!shouldUseFirebaseEmulators()) {
    await initializeFirebaseAppCheck(app);
  }

  auth = createAuth(app);
  db = createFirestore(app);
  storage = getStorage(app);
  if (shouldUseFirebaseEmulators()) {
    connectCoreEmulators(auth, db, storage);
  }
  isInitialized = true;
}

export async function ensureFirebaseInitialized(): Promise<void> {
  if (!isFirebaseConfigured) {
    throw new Error(
      'Firebase Auth is not configured. Add EXPO_PUBLIC_FIREBASE_* values to the .env file.',
    );
  }

  if (isInitialized) {
    return;
  }

  if (!initializationPromise) {
    initializationPromise = bootstrapFirebase();
  }

  await initializationPromise;
}

export function getFirebaseAuth(): Auth | null {
  return auth;
}

export function getFirebaseApp(): FirebaseApp | null {
  return app;
}

export function getFirestoreDb(): Firestore | null {
  return db;
}

export function getFirebaseStorage(): FirebaseStorage | null {
  return storage;
}

export function isFirebaseReady(): boolean {
  return Boolean(isInitialized && app && auth && db && storage);
}

export function isFirebaseConfiguredForProject(): boolean {
  return isFirebaseConfigured;
}

import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import {
  getAuth,
  type Auth,
} from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

const env = process.env as Record<string, string | undefined>;

const firebaseConfig: FirebaseOptions = {
  apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  storageBucket: env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
};

const isFirebaseConfigured = Object.values(firebaseConfig).every((value) => Boolean(value));

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;

if (isFirebaseConfigured) {
  app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
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
  return Boolean(app && auth && db && storage);
}


import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  type Auth,
} from 'firebase/auth';

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

if (isFirebaseConfigured) {
  app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  auth = initializeAuth(app);
}

export function getFirebaseAuth(): Auth | null {
  return auth;
}

export function getFirebaseApp(): FirebaseApp | null {
  return app;
}

export function isFirebaseReady(): boolean {
  return Boolean(app && auth);
}

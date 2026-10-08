import { type AuthRole } from '@/features/auth/types';
import { parseIsoDate, parseString } from '@/utils/firestoreParsing';

export type FirestoreUserDocument = {
  uid: string;
  name: string;
  email: string;
  role: AuthRole;
  isAnonymous: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateUserDocumentInput = {
  uid: string;
  name?: string;
  email?: string;
  role?: AuthRole;
  isAnonymous?: boolean;
};

export function buildDefaultUserDocument(input: CreateUserDocumentInput): FirestoreUserDocument {
  const now = new Date().toISOString();
  const isAnonymous = input.isAnonymous ?? false;

  return {
    uid: input.uid,
    name: input.name ?? (isAnonymous ? 'Guest' : 'PitchProof User'),
    email: input.email ?? '',
    role: input.role ?? (isAnonymous ? 'guest' : 'player'),
    isAnonymous,
    createdAt: now,
    updatedAt: now,
  };
}

export function parseUserDocument(uid: string, data: Record<string, unknown>): FirestoreUserDocument {
  const now = new Date().toISOString();
  const role = parseAuthRole(data.role);

  return {
    uid,
    name: parseString(data.name, 'PitchProof User'),
    email: parseString(data.email),
    role: role ?? (data.isAnonymous === true ? 'guest' : 'player'),
    isAnonymous: data.isAnonymous === true,
    createdAt: parseIsoDate(data.createdAt, now),
    updatedAt: parseIsoDate(data.updatedAt, now),
  };
}

function parseAuthRole(value: unknown): AuthRole | undefined {
  if (value === 'guest' || value === 'player' || value === 'scout' || value === 'coach' || value === 'club') {
    return value;
  }
  return undefined;
}

export function serializeUserDocument(document: FirestoreUserDocument): Record<string, unknown> {
  return {
    uid: document.uid,
    name: document.name,
    email: document.email,
    role: document.role,
    isAnonymous: document.isAnonymous,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

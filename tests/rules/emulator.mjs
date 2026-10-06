// Minimal REST client for the Firestore and Storage emulators.
// Uses unsigned ID tokens, which the emulators accept (same approach as
// @firebase/rules-unit-testing), so rules are evaluated with a real request.auth.

export const PROJECT_ID = 'demo-scoutx';
export const BUCKET = `${PROJECT_ID}.appspot.com`;

const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const STORAGE_HOST = process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? '127.0.0.1:9199';
const DOCS_BASE = `http://${FIRESTORE_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

function base64Url(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function tokenFor(uid) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'none', kid: 'fakekid', typ: 'JWT' };
  const payload = {
    iss: `https://securetoken.google.com/${PROJECT_ID}`,
    aud: PROJECT_ID,
    iat: now,
    exp: now + 3600,
    auth_time: now,
    sub: uid,
    user_id: uid,
    firebase: { sign_in_provider: 'custom', identities: {} },
  };
  return `${base64Url(header)}.${base64Url(payload)}.`;
}

function toValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toValue) } };
  return { mapValue: { fields: toFields(value) } };
}

function toFields(data) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, toValue(value)]));
}

/** Auth header for a user, the admin bypass ("owner"), or none (unauthenticated). */
function firestoreHeaders(uid) {
  const headers = { 'Content-Type': 'application/json' };
  if (uid === 'admin') headers.Authorization = 'Bearer owner';
  else if (uid) headers.Authorization = `Bearer ${tokenFor(uid)}`;
  return headers;
}

export async function setDocument(uid, path, data) {
  const response = await fetch(`${DOCS_BASE}/${path}`, {
    method: 'PATCH',
    headers: firestoreHeaders(uid),
    body: JSON.stringify({ fields: toFields(data) }),
  });
  return response.status;
}

export async function getDocument(uid, path) {
  const response = await fetch(`${DOCS_BASE}/${path}`, { headers: firestoreHeaders(uid) });
  return response.status;
}

export async function deleteDocument(uid, path) {
  const response = await fetch(`${DOCS_BASE}/${path}`, {
    method: 'DELETE',
    headers: firestoreHeaders(uid),
  });
  return response.status;
}

export async function clearFirestore() {
  const response = await fetch(
    `http://${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  if (!response.ok) throw new Error(`Failed to clear Firestore emulator: ${response.status}`);
}

function storageHeaders(uid, contentType) {
  const headers = {};
  if (uid) headers.Authorization = `Firebase ${tokenFor(uid)}`;
  if (contentType) headers['Content-Type'] = contentType;
  return headers;
}

export async function uploadObject(uid, path, contentType, sizeBytes = 16) {
  const response = await fetch(
    `http://${STORAGE_HOST}/v0/b/${BUCKET}/o?name=${encodeURIComponent(path)}`,
    { method: 'POST', headers: storageHeaders(uid, contentType), body: Buffer.alloc(sizeBytes, 1) },
  );
  return response.status;
}

export async function downloadObject(uid, path) {
  const response = await fetch(
    `http://${STORAGE_HOST}/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media`,
    { headers: storageHeaders(uid) },
  );
  return response.status;
}

export async function deleteObject(uid, path) {
  const response = await fetch(
    `http://${STORAGE_HOST}/v0/b/${BUCKET}/o/${encodeURIComponent(path)}`,
    { method: 'DELETE', headers: storageHeaders(uid) },
  );
  return response.status;
}

export const isAllowed = (status) => status >= 200 && status < 300;
export const isDenied = (status) => status === 403;

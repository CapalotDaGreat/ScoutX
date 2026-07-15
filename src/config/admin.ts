/**
 * Client-side admin hints are optional and must never be used for authorization.
 * Server-side Cloud Functions enforce admin access via the ADMIN_USER_IDS secret.
 */
// Expo only inlines static process.env.EXPO_PUBLIC_* references (not env[key]).

export function getAdminUserIds(): string[] {
  const raw = process.env.EXPO_PUBLIC_ADMIN_USER_IDS?.trim();
  if (!raw) {
    return [];
  }
  return raw.split(',').map((item: string) => item.trim()).filter(Boolean);
}

export function isAdminUser(userId: string | undefined): boolean {
  if (!userId) {
    return false;
  }
  return getAdminUserIds().includes(userId);
}

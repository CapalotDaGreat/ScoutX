const env = process.env as Record<string, string | undefined>;

export function getAdminUserIds(): string[] {
  const raw = env.EXPO_PUBLIC_ADMIN_USER_IDS?.trim();
  if (!raw) {
    return [];
  }
  return raw.split(',').map((item) => item.trim()).filter(Boolean);
}

export function isAdminUser(userId: string | undefined): boolean {
  if (!userId) {
    return false;
  }
  return getAdminUserIds().includes(userId);
}

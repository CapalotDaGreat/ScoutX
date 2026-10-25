export function playerInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return Array.from(parts[0]!).slice(0, 2).join('').toUpperCase();
  return `${Array.from(parts[0]!)[0]}${Array.from(parts.at(-1)!)[0]}`.toUpperCase();
}

/** Both identity and URL define an image attempt, including a return to an old URL. */
export function playerImageKey(playerId: string, uri: string): string {
  return JSON.stringify([playerId, uri.trim()]);
}

export function cardEvidenceCount(value: number): number | null {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function discoveryColumns(width: number): 1 | 2 {
  return Number.isFinite(width) && width >= 1100 ? 2 : 1;
}

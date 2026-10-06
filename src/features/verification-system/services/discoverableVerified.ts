/** Discovery "verified" is identity-verified only. Basic/pending never counts. */
export function isDiscoverableVerifiedLevel(level: string): boolean {
  return level === 'verified';
}

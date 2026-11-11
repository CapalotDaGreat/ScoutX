/**
 * Decides whether the root navigator should leave the current screen alone when the session settles.
 *
 * `previousKey` is the last synced `"<rootRoute>:<uid>"` (null before the first sync). The screen is
 * kept when the navigator is already inside the right app and this is the first sync, or the same
 * app whose account id only now became known. A different account, or a different app, resets.
 */
export function keepsLinkedScreen(input: {
  previousKey: string | null;
  rootRoute: string;
  linkedRoute: string | undefined;
  needsRole: boolean;
}): boolean {
  const { previousKey, rootRoute, linkedRoute, needsRole } = input;
  const settling = previousKey === null || previousKey === `${rootRoute}:`;
  return settling && !needsRole && linkedRoute === rootRoute;
}

/**
 * Runs account-bound work and decides what to do with its result once it settles.
 *
 * - The account is still current: the value is returned, and a failure is re-thrown, so genuine errors
 *   (including a permission denial for the signed-in account) stay visible.
 * - The account changed while the work was in flight (sign-out, account switch, session expiry): the
 *   result is stale and is dropped whether it succeeded or failed, so it can neither update the new
 *   session's screen nor surface the old account's expected permission denial as an error (B-23).
 */
export async function settleForAccount<T>(
  requestedFor: string,
  currentAccount: () => string | null | undefined,
  work: () => Promise<T>,
): Promise<{ stale: true } | { stale: false; value: T }> {
  try {
    const value = await work();
    return currentAccount() === requestedFor ? { stale: false, value } : { stale: true };
  } catch (error) {
    if (currentAccount() !== requestedFor) return { stale: true };
    throw error;
  }
}

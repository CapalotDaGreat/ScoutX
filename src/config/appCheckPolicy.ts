export function resolveAppCheckPolicy(
  production: boolean,
  enabledFlag?: string,
): { enabled: boolean; useDebugProvider: boolean } {
  return {
    enabled: production || !['false', '0'].includes(enabledFlag?.trim().toLowerCase() ?? ''),
    useDebugProvider: !production,
  };
}

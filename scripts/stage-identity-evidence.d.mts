export function parseStagingArgs(args: string[]): Record<string, string | boolean>;
export function loadEvidenceRun(directory: string): Promise<{ artifact: unknown; bundle: { plan: unknown; complete: unknown; identity: unknown; segments: unknown[] } }>;
export function main(args: string[]): Promise<unknown>;

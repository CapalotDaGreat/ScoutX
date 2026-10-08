export type CvRuntimeApproval = {
  workerVersion: string;
  models: Record<string, string>;
  eventsApproved: boolean;
  reportSha256: string;
};

export type CvApprovalResult = {
  state: 'absent' | 'invalid' | 'approved';
  problems: string[];
  runtime: CvRuntimeApproval | null;
};

export const APPROVAL_PATH: string;
export const THRESHOLDS_PATH: string;
export const GENERATED_PATH: string;
export function sha256Normalized(buffer: Buffer): string;
export function aggregate(videos: unknown[]): Record<string, number | string | null>;
export function gateProblems(videos: unknown[], thresholds: unknown, options?: { events?: boolean }): { summary: Record<string, number | string | null>; problems: string[] };
export function verifyCvApproval(root: string, options?: { today?: string }): CvApprovalResult;
export function generatedModule(runtime: CvRuntimeApproval | null): string;

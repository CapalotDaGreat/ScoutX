export function buildE2eRunCommand(options?: {
  project?: string;
  filters?: readonly string[];
  noRetries?: string;
  marketingCapture?: string;
}): string;
export function buildE2eRunCommands(options?: Parameters<typeof buildE2eRunCommand>[0]): string[];

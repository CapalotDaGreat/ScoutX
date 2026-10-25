/** Build a sequential local run without sharing seeded state between browsers. */
export function buildE2eRunCommands({ project = 'web-desktop', filters = [], noRetries, marketingCapture } = {}) {
  const projects = project.split(',');
  if (projects.length > 2 || new Set(projects).size !== projects.length ||
      projects.some((name) => !['web-desktop', 'web-mobile'].includes(name))) {
    throw new Error('Unsupported local browser project');
  }

  // Allow spec-name fragments and filenames, never shell syntax or paths.
  if (filters.some((name) => !/^[A-Za-z][A-Za-z0-9_-]*(?:\.spec(?:\.ts)?)?$/.test(name))) {
    throw new Error('Unsupported local flow filter');
  }
  // Playwright ORs positional filters; do not include the whole directory with them.
  const targets = filters.length ? filters.map((name) => `e2e/flows/${name}`).join(' ') : 'e2e/flows';
  const retries = noRetries === '1' || marketingCapture === '1' ? ' --retries=0' : '';
  return projects.map((name) => `node scripts/seed-emulators.mjs && npx playwright test ${targets} --project=${name}${retries}`);
}

export function buildE2eRunCommand(options) {
  return buildE2eRunCommands(options).join(' && ');
}

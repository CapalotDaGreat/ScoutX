// Writes scripts/review-preview/.generated/reports.json (git-ignored) from committed fixtures.
// Runs automatically before `npm run typecheck` (the preview's PreviewApp.tsx imports the file). The app never imports it,
// so production bundles do not contain it. Deterministic: same fixtures in, same bytes out; safe to run repeatedly.
if (!process.features?.typescript) {
  console.error(
    `review-preview: Node ${process.versions.node} cannot run TypeScript files directly. ` +
      'Use Node 22.18 or newer (type stripping enabled by default) to generate the preview data.',
  );
  process.exit(1);
}
await import('./prepare.ts');

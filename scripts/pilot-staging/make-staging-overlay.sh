#!/usr/bin/env bash
# Builds the staging-only deploy artifact: the candidate commit plus ONE generated file, the CV approval for the
# staging fake worker (football-cv/0.7.0-staging). Production keeps APPROVED_CV_WORKER = null; this overlay is never
# merged or pushed to a shared branch. Prints the overlay commit and tree so the approval can name them.
#   scripts/pilot-staging/make-staging-overlay.sh <candidate-sha> [workdir]
set -euo pipefail
CAND="${1:?candidate sha}"
WT="${2:-$(mktemp -d)/stg-overlay}"
ROOT="$(git rev-parse --show-toplevel)"
git -C "$ROOT" worktree add --detach "$WT" "$CAND" >/dev/null
cat > "$WT/functions/src/analysis/cvApproval.generated.ts" <<'TS'
// STAGING OVERLAY ONLY (scripts/pilot-staging/make-staging-overlay.sh). Never merge. Approves the staging fake worker
// so the real queue/handler/report path can run in the staging project without a GPU or models.
export type CvApproval = {
  workerVersion: string;
  models: Readonly<Record<string, string>>;
  eventsApproved: boolean;
  reportSha256: string;
};

export const APPROVED_CV_WORKER: CvApproval | null = {
  workerVersion: 'football-cv/0.7.0-staging',
  models: { detector: 'yolox-staging', ocr: 'parseq-staging' },
  eventsApproved: false,
  reportSha256: 'staging-overlay-no-evaluation',
};
TS
[ -e "$WT/functions/node_modules" ] || ln -s "$ROOT/functions/node_modules" "$WT/functions/node_modules"
( cd "$WT/functions" && npx tsc -p . >/dev/null )
rm -f "$WT/functions/node_modules"
git -C "$WT" add functions/src/analysis/cvApproval.generated.ts functions/lib/analysis/cvApproval.generated.js
git -C "$WT" -c user.name="staging-overlay" -c user.email="staging-overlay@pitchproof-staging.invalid" commit -q -m "STAGING OVERLAY of $CAND: approve the staging fake worker (never merge)"
echo "candidate=$(git -C "$WT" rev-parse "$CAND") overlay=$(git -C "$WT" rev-parse HEAD) overlay_tree=$(git -C "$WT" rev-parse HEAD^{tree}) worktree=$WT"
git -C "$WT" diff --stat "$CAND" HEAD

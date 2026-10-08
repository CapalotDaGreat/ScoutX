# Match Footage Lifecycle

Implementation: `functions/src/analysis/mediaLifecycle.ts` (`LIFECYCLE`). Not lawyer-reviewed.

| Situation | Source video | Uncited frames / intermediates | Cited frames | Evidence clips |
| --- | --- | --- | --- | --- |
| Completed, keep video off (default) | Deleted, library item removed | Deleted | Kept (owner-only) | Only if requested |
| Completed, keep video on | Kept, filed in media library | Deleted | Kept | Only if requested |
| Cancelled / consent withdrawn | Deleted unless kept | Deleted | Kept if already cited | None |
| Failed | Kept 24 h (7 days with keep-for-retry), then deleted unless kept | Deleted with the source | Kept | None |
| Upload never finished | Job marked expired after 7 days, all media deleted | — | — | — |
| Job deleted by the user / account deleted | Purged | Purged | Purged | Purged |
| Short clip (`device_frames`) | Never uploaded | Deleted | Kept | Not offered |

**Cited frames** = frames referenced by the report (`frameIds`, `evidenceFrameIds`, `frameId` anywhere
in it), by held-back coaching, and up to 6 frames the player confirmed as "this is me".

**Evidence clips** = only when `evidenceClipsRequested`; at most 6 clips, about 8 s each, 480p,
no audio, at least 10 s apart, cut with ffmpeg around cited moments before the source is deleted.

Triggers: `onMatchJobMediaLifecycle` (status change), hourly `mediaLifecycleSweep` (retry windows,
pending clean-ups, stuck uploads), `onMatchJobDeleted` (purge prefix and subcollections). Each run
writes `mediaLifecycle { source, citedFramesKept, deletedObjectCount, evidenceClips, cleanedAt }`
which the report shows to the player.

Cleanup deletes only object names the app writes (`video.mp4`, `frames/frame_N.jpg`,
`clips/clip_N.mp4`) inside the job's own folder. Anything else is left in place and counted as
`unrecognised` in the log for manual review.

## Legacy media (jobs from before the lifecycle)

Settled jobs without `mediaCleanupState` are never visited by the sweep. `scripts/legacy-media.mjs`
handles them:

1. **Dry run (default, read-only):** `node scripts/legacy-media.mjs --project <id> --bucket <bucket>`.
   Writes a per-object report to `.local/legacy-media/` (gitignored; it contains private object
   names) and prints counts only.
2. **Review** the report. Proposed deletions are uncited frames only. Source videos are
   `review_source_no_decision` unless the owner decides otherwise (`--include-sources`); footage filed
   in the player's media library and footage the player chose to keep are never proposed.
   Unknown objects are always `review_unrecognised`.
3. **Apply** the reviewed report: `--apply <report.json>`. Each object is deleted by exact name with
   a generation precondition; anything changed since the dry run, or any job that is no longer
   legacy, is skipped. Never by prefix.

Status: emulator-tested. The production dry run has NOT been run (no operator credentials were
available); no legacy object has been deleted.

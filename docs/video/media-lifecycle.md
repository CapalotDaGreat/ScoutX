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

Known gap: jobs completed before this shipped have no `mediaCleanupState` and keep their media
until a one-off backfill is run.

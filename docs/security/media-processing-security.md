# Media Processing Security Specification

## Upload path

1. The app calls `createUploadSession` with purpose, job id, file name, content type, size,
   declared duration and a fingerprint (SHA-256 over the size plus the first and last 8 MiB; used
   for resume and dedupe only, not as an integrity proof).
2. The server checks the request (`functions/src/uploads/model.ts`):
   - content types `video/mp4`, `video/quicktime` only;
   - 1 KiB ≤ size ≤ 4 GiB; declared duration ≤ 150 minutes; plan limits apply on top
     (free: 120 minutes / 3 GiB);
   - at most 2 active uploads and 10 new sessions per day per user;
   - identical fingerprints reuse the existing session (dedupe).
3. The server opens a GCS resumable session for `quarantine/{uid}/{uploadId}` with fixed content
   type and length, and returns only the session URI. Session CORS is limited to
   `CALLABLE_ALLOWED_ORIGINS`.
4. The app uploads 8 MiB chunks and can resume after restart (sessions are treated as closed
   after 7 days).

Clients have no Storage rule granting access to `quarantine/`.

## Validation (`functions/src/uploads/quarantine.ts`)

On object finalize:

1. Record state `quarantined`.
2. Run `ffprobe` (`ffprobe-static`) on the object: container, codecs, streams, duration,
   resolution. Reject files that are not a supported video, have no video stream, or whose real
   duration or size breaks the limits.
3. Rejected: delete the bytes immediately, set state `rejected` with a reason.
4. Accepted: copy to `profiles/{uid}/matchFootage/{jobId}/video.mp4`, delete the quarantine
   object, state `ready`, and file a private library item with rights `unconfirmed`.

A `MediaScanner` seam (`functions/src/uploads/mediaScanner.ts`) exists for a future malware
scanner; the default records `not_scanned`. **No malware scan is performed today, and the app must
never say a video was "virus scanned".**

## Processing

- Segment extraction (`extractMatchSegment`) and frame analysis (`analyzeMatchFrames`) run as
  Cloud Tasks workers with bounded retries; `ffmpeg-static` extracts frames at a capped resolution.
- Frames are stored at `profiles/{uid}/matchFootage/{jobId}/frames/` (owner read only) and are
  deleted with the job.
- Frames go to OpenRouter with `data_collection: deny` and `zdr: true`. The key never leaves Functions.
- Computer vision (tracking, event detection) is NOT AVAILABLE; `cvWorker.ts` returns that state.

## Distribution

- Media is private by default. Public media for minors needs the `public_media` guardian scope.
- Sharing uses `mediaGrants` and short-lived signed URLs.
- Reports (including "I appear in this video") can place a moderation hold that removes media from
  public projections.

## Residual risks

- ffprobe/ffmpeg parse untrusted input. Mitigated by running in isolated Cloud Functions
  instances with no secrets beyond what the function needs. SECURITY REVIEW REQUIRED.
- No antivirus scanning (see above).
- Real GCS resumable behaviour on cellular networks is NOT VALIDATED (emulator only).

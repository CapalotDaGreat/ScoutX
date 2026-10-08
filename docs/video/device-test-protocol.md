# Video Intelligence Device Test Protocol

Run on a TestFlight build with `AI_FOOTAGE_PROCESSING_APPROVED=true` and footage the tester may
use. Record results in `docs/release/validation-matrix.md` (date, build, device, tester).

1. **Consent gate** — pick a 2 min clip, fill the form, tap Upload & analyze. Verify nothing
   uploads before all four points are ticked; all options start off. Cancel → no job in progress.
2. **Short clip** — 20 s clip of a shot. Verify the mode line says frames stay on the phone, the
   clip-context chips appear, the clip review shows observable / not observable, and Storage holds
   only `frames/` for the job (no `video.mp4`).
3. **Files / iCloud** — choose an iCloud-only 45 min MOV from Files. Verify the preparing label,
   correct duration, upload progress, then "Parts reviewed X/Y" advancing.
4. **Identity** — on the report, confirm two frames. Verify strengths / improvements appear only
   after confirming. Repeat with "None of these show me" on another job: coaching stays empty.
5. **Lifecycle default** — after completion, the notice says the original video was deleted and N
   cited frames are kept; Storage has no `video.mp4`; the media library has no new item.
6. **Keep video** — repeat with Keep match video on: the video is in the media library.
7. **Evidence clips** — repeat with clips on: ≤ 6 short silent clips; notice shows the count.
8. **Withdraw** — start a 45 min analysis, tap Withdraw consent and stop: job cancelled, temporary
   media removed within the next sweep.
9. **Failure** — force a failure (airplane mode during analysis is not enough; use an unsupported
   file): job failed, video removed after 24 h.
10. **Languages** — repeat step 1 in de, fr, es, it, pt, nl: no truncation, no English leftovers.

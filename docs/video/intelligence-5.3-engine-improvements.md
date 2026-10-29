# Video Intelligence 5.3: engine reliability improvements

Date: 2026-10-29. Base: `3b8f3bb`. Changes: `699c0c7` on
`codex/gpu-benchmark-5-3`. No production deployment or release-flag changes.

## Decoder lifecycle

The previous GPU prefetch path started a daemon decoder for each extraction chunk.
When a chunk ended before EOF, its producer could remain blocked on a full queue;
the capture was never released. Decoder exceptions could also leave the consumer
waiting indefinitely. Long recordings therefore risked retaining decoder threads,
capture handles and queued 1080p frames between chunks.

`CaptureReader` owns the capture, uses a bounded queue with cancellable puts,
forwards decoder errors, joins the producer on consumer exit and clears queued
frames. Capture release occurs in the producer thread, after its last read, to
avoid racing OpenCV. Synchronous extraction uses the same ownership boundary.
This does not introduce a timeout for a native read that itself never returns.

Tests cover normal EOF, frame ordering, early chunk boundaries, producer errors,
inference errors and identical extraction arrays with prefetch disabled/enabled.
The equivalence test uses synthetic frames and an empty detector; real-model GPU
accuracy and throughput still require the separate benchmark.

## OCR correction budget

`run_ocr` previously checked wall-clock elapsed time with a strict greater-than
comparison. On a coarse clock, a zero-second budget could admit uncached reads
and model loading before the clock advanced. The budget now uses the monotonic
performance clock and an inclusive boundary. Cached evidence remains available;
zero-budget corrections do not load recognisers or read new crops.

The existing refresh-budget regression now passes on this Windows host. A new
test freezes both clocks and verifies cached reads remain usable while uncached
reads are deferred. This bounds admission of new reads; it cannot preempt an
already-running recognition call.

## OpenCV line layout

This local environment uses OpenCV 5.0.0, whose Hough line array can be `(N, 4)`;
the pinned GPU image uses OpenCV 4.14.0.94 with `(N, 1, 4)`. Calibration previously
assumed the latter and crashed locally. Normalising to `(-1, 4)` supports both
without changing coordinates or confidence thresholds. A regression test verifies
identical candidates for both layouts.

## Validation and limits

The full local worker suite passed: **550 passed, 5 skipped**, in 48.61 seconds
(Python 3.12 / Windows / OpenCV 5.0.0). One FastAPI test-client deprecation warning
was emitted. The skips are not passes. This is not the pinned Linux/Python 3.13.17
GPU environment and is not evidence of full-match GPU accuracy or a measured
speedup. Detection thresholds, identity rules, decoder colour conversion and
experimental night OCR were not changed.

## Benchmark orchestration

Commit `0bc339e` adds a region-validated price snapshot to the launcher. The snapshot
is embedded in startup metadata, preserved in the result root and both run folders,
and supplied to cost calculations. Experiments are refused unless the full
CPU-relative comparison has exit code zero. The measured baseline remains
`feature/player-tracking-v3` at `3b8f3bb`; these engine fixes are kept separate.

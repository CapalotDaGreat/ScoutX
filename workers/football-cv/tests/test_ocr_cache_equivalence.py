"""5.3 candidate C (SCOUTX_OCR_CONSULTED_ONLY, off by default): an OCR cache saves time but never adds evidence.

Verified failure (IMG_4809 full match, default decoder): `analyze` used EVERY entry of ocr_cache.json as first-pass
evidence - also reads left there by a previous run's refinement passes - so a warm cache alone changed 36 claim
frames (8 confirmed-correct #20 frames weakened). Here a cache is polluted with two reads that no pass of this run
requests (a fake '17' on #20's own track, before the 244.4 s crossing). With the flag the run is identical to the
cold run; without it the foreign reads become evidence."""
import json
import os
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest

from scoutx_tracker import analyze as an

ROOT = Path(__file__).resolve().parents[1]
REPLAY = ROOT / "bench" / "results" / "5.3" / "wrong-player-20261102" / "replays" / "default_i0225"
FOREIGN = {"chunk/000178_3300.jpg": ["17", 1.0, "shirt:white"], "chunk/000182_3368.jpg": ["17", 1.0, "shirt:white"]}


def test_run_ocr_reports_only_the_crops_it_consulted(tmp_path, monkeypatch):
    cache = tmp_path / "ocr_cache.json"
    cache.write_text(json.dumps({"p/a.jpg": ["20", 1.0, "x"], "p/b.jpg": [None, 0.0, None], "p/zz.jpg": ["17", 1.0, "x"]}))
    seen: set = set()
    out = an.run_ocr({1: ["/r/p/crops/a.jpg", "/r/p/crops/b.jpg"]}, cache, consulted=seen, log=lambda m: None)
    assert seen == {"p/a.jpg", "p/b.jpg"} and "p/zz.jpg" in out          # the cache keeps everything ...
    assert "p/zz.jpg" not in seen                                          # ... but only consulted crops count


def test_early_stop_consults_only_the_crops_before_the_stop(tmp_path):
    cache = tmp_path / "ocr_cache.json"
    cache.write_text(json.dumps({f"p/{i}.jpg": ["20", 1.0, "x"] for i in range(4)}))
    seen: set = set()
    an.run_ocr({1: [f"/r/p/crops/{i}.jpg" for i in range(4)]}, cache, early_stop=True, consulted=seen, log=lambda m: None)
    assert seen == {"p/0.jpg", "p/1.jpg"}


def _replay(tmp_path, tag, flag, warm=None):
    env = {**os.environ, "SCOUTX_EXCHANGE_SPLIT": "0", "SCOUTX_RESUME_SPLIT": "0", "SCOUTX_OCR_CONSULTED_ONLY": flag, "SCOUTX_APPEARANCE_ONLY_LIKELY": "1",
           "SCOUTX_OCR_CACHE_PROVENANCE": "0", "PYTHONHASHSEED": "0"}   # E pinned off: hand-made caches have no sidecar
    out = tmp_path / tag
    cmd = [sys.executable, str(ROOT / "bench" / "regression_replay.py"), "run", "--replay", str(REPLAY), "--out", str(out)]
    if warm:
        cmd += ["--warm-cache", str(warm)]
    subprocess.run(cmd, env=env, cwd=ROOT, check=True, capture_output=True)
    with np.load(out / "automatic" / "timeline.npz") as z:
        return {k: z[k].copy() for k in ("present", "states", "evidence", "boxes")}


def _polluted(tmp_path):
    reads = json.loads((REPLAY / "ocr_reads.json").read_text())
    assert not set(FOREIGN) & set(reads)                                   # never requested by this run
    p = tmp_path / "polluted.json"
    p.write_text(json.dumps({**reads, **FOREIGN}))
    return p


def _same(a, b):
    return all(np.array_equal(a[k], b[k]) for k in ("present", "states", "evidence")) and np.allclose(a["boxes"], b["boxes"])


@pytest.mark.skipif(not REPLAY.exists(), reason="regression replay artifacts not present")
def test_with_flag_a_polluted_warm_cache_resolves_exactly_like_a_cold_run(tmp_path):
    cold = _replay(tmp_path, "cold1", "1")
    warm = _replay(tmp_path, "warm1", "1", _polluted(tmp_path))
    assert _same(cold, warm)
    assert _same(cold, _replay(tmp_path, "cold0", "0"))                    # the flag changes nothing on a cold run


@pytest.mark.skipif(not REPLAY.exists(), reason="regression replay artifacts not present")
def test_characterisation_without_flag_foreign_cache_entries_become_evidence(tmp_path):
    cold = _replay(tmp_path, "cold0", "0")
    warm = _replay(tmp_path, "warm0", "0", _polluted(tmp_path))
    assert not _same(cold, warm)

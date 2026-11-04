"""5.3 OCR-cache edge cases (Phase 3 of the C/D validation). Deterministic test doubles: a fake reader and a
fake clock - no OCR models, no wall-clock equality.

Covers: empty / full / partial caches and cached no-text results; interrupted + resumed runs; budgets (work-count
and wall-clock, including exhaustion right at a hit/miss boundary); pass order / different selections; colliding
crop identifiers; stale provenance after Stage1Store re-extracts a chunk; truncated / malformed cache files. Tests
named `test_defect_*` are characterisations of the DEFAULT behaviour (they pass while the defect exists); the
matching `test_E_*` tests show candidate E (SCOUTX_OCR_CACHE_PROVENANCE=1, off by default) prevents it."""
import json
from pathlib import Path

import numpy as np
import pytest

from scoutx_tracker import analyze as an
from scoutx_tracker import ocr


class FakeReader:
    """Reads the text stored for a crop path; counts calls; can fail after N reads (interruption)."""

    def __init__(self, table, fail_after=None):
        self.table, self.calls, self.fail_after = table, [], fail_after

    def read(self, img):
        key = bytes(img).decode()
        if self.fail_after is not None and len(self.calls) >= self.fail_after:
            raise RuntimeError("worker interrupted")
        self.calls.append(key)
        return tuple(self.table.get(key, (None, 0.0, None)))


@pytest.fixture
def env(tmp_path, monkeypatch):
    chunk = tmp_path / "stage1" / "c_00000"
    (chunk / "crops").mkdir(parents=True)
    np.savez(chunk / "detections.npz", dets=np.zeros((1, 7)))
    paths = [str(chunk / "crops" / f"{i:06d}_{i}.jpg") for i in range(6)]
    for p in paths:
        Path(p).touch()
    table = {an.crop_key(p): ["20", 0.99, "shirt:white"] if i in (1, 4) else [None, 0.0, None] for i, p in enumerate(paths)}
    reader = FakeReader(table)
    monkeypatch.setattr(an.cv2, "imread", lambda p, *a, **k: np.frombuffer(an.crop_key(str(p)).encode(), np.uint8).copy())
    monkeypatch.setattr(ocr, "shared_reader", lambda: reader)
    return {"chunk": chunk, "paths": paths, "cache": tmp_path / "stage1" / "ocr_cache.json", "reader": reader,
            "table": table, "mp": monkeypatch}


def _run(e, crops=None, **kw):
    seen = set()
    cache = an.run_ocr(crops or {1: e["paths"]}, e["cache"], 2, log=lambda m: None, early_stop=False, consulted=seen, **kw)
    return cache, seen


def test_empty_vs_full_cache_same_consulted_set_and_values(env):
    cold, s1 = _run(env)
    n_reads = len(env["reader"].calls)
    warm, s2 = _run(env)
    assert s1 == s2 == {an.crop_key(p) for p in env["paths"]}
    assert {k: cold[k] for k in s1} == {k: warm[k] for k in s2}
    assert len(env["reader"].calls) == n_reads                    # warm run read nothing new


def test_partial_cache_and_cached_no_text_results(env):
    env["cache"].write_text(json.dumps({an.crop_key(env["paths"][0]): [None, 0.0, None]}))   # cached "no text"
    _, seen = _run(env)
    assert an.crop_key(env["paths"][0]) in seen                   # consulted ...
    assert an.crop_key(env["paths"][0]) not in env["reader"].calls  # ... but not re-read
    assert len(env["reader"].calls) == 5


def test_interrupted_then_resumed_run_ends_with_the_cold_result(env, tmp_path):
    big = [str(env["chunk"] / "crops" / f"{i:06d}_{i}.jpg") for i in range(250)]
    for p in big:
        Path(p).touch()
    env["mp"].setattr(ocr, "shared_reader", lambda: FakeReader(env["table"], fail_after=130))
    with pytest.raises(RuntimeError):
        _run(env, {1: big})
    partial = json.loads(env["cache"].read_text())
    assert len(partial) == 100                                     # flushed every 100 reads (atomically)
    env["mp"].setattr(ocr, "shared_reader", lambda: FakeReader(env["table"]))
    resumed, seen = _run(env, {1: big})
    env["cache"].unlink()
    cold, seen_cold = _run(env, {1: big})
    assert seen == seen_cold and {k: resumed[k] for k in seen} == {k: cold[k] for k in seen_cold}


def test_work_count_budget_is_deterministic_and_warm_runs_cover_more_selected_crops(env):
    _, s1 = _run(env, max_new=2)
    env["cache"].unlink()
    _, s2 = _run(env, max_new=2)
    assert s1 == s2 and len(s1) == 2                               # same cache state + same budget -> same work
    _, s3 = _run(env, max_new=2)                                   # warm: 2 cached + 2 new
    assert s1 < s3 and len(s3) == 4                                # legitimate extra coverage of SELECTED crops only
    assert s3 <= {an.crop_key(p) for p in env["paths"]}


def test_wall_clock_budget_exhaustion_at_a_hit_miss_boundary(env):
    """Fake clock: the budget runs out after the 2nd new read; cached crops after that point are still consulted,
    uncached ones are skipped (deferred), never read."""
    env["cache"].write_text(json.dumps({an.crop_key(env["paths"][3]): ["20", 0.99, "shirt:white"]}))
    clock = iter(np.arange(0.0, 100.0, 1.0))
    env["mp"].setattr(an.time, "perf_counter", lambda: float(next(clock)))
    skipped: list = []
    _, seen = _run(env, budget_sec=2.5, skipped=skipped)
    assert an.crop_key(env["paths"][3]) in seen                    # cache hit after exhaustion: consulted
    assert set(skipped) == {an.crop_key(p) for p in env["paths"]} - seen
    assert not set(skipped) & set(env["reader"].calls)


def test_pass_order_and_selection_only_change_what_is_consulted(env):
    _, a = _run(env, {1: env["paths"][:3], 2: env["paths"][3:]})
    _, b = _run(env, {2: env["paths"][3:], 1: env["paths"][:3]})
    assert a == b
    _, c = _run(env, {1: env["paths"][:2]})
    assert c == {an.crop_key(p) for p in env["paths"][:2]}


def test_defect_colliding_crop_identifiers_across_jobs(tmp_path):
    a = tmp_path / "jobA" / "stage1" / "c_00000" / "crops" / "000010_5.jpg"
    b = tmp_path / "jobB" / "stage1" / "c_00000" / "crops" / "000010_5.jpg"
    assert an.crop_key(str(a)) == an.crop_key(str(b))               # keys carry no job/source/detection provenance


def _stale(env):
    """Chunk re-extracted (Stage1Store replace): same crop names, new detections; the old read stays in the cache."""
    _run(env)
    np.savez(env["chunk"] / "detections.npz", dets=np.ones((2, 7)))   # new stage-1 output for the same chunk name
    new_table = {k: ["17", 0.99, "shirt:white"] for k in env["table"]}
    env["mp"].setattr(ocr, "shared_reader", lambda: FakeReader(new_table))
    return _run(env)


def test_defect_stale_reads_survive_a_reextracted_chunk(env, monkeypatch):
    monkeypatch.setattr(an, "OCR_CACHE_PROVENANCE", False)
    cache, seen = _stale(env)
    assert cache[an.crop_key(env["paths"][1])][0] == "20"           # the OLD crop's read is served for the new crop


def test_E_stale_reads_are_dropped_and_reread(env, monkeypatch):
    monkeypatch.setattr(an, "OCR_CACHE_PROVENANCE", True)
    an._TAGS.clear()
    cache, seen = _stale(env)
    assert cache[an.crop_key(env["paths"][1])][0] == "17"


def test_defect_truncated_cache_file_raises(env, monkeypatch):
    monkeypatch.setattr(an, "OCR_CACHE_PROVENANCE", False)
    env["cache"].write_text('{"c_00000/000001_1.jpg": ["20", 0.9')
    with pytest.raises(ValueError):
        _run(env)


def test_E_truncated_or_malformed_cache_starts_cold(env, monkeypatch):
    monkeypatch.setattr(an, "OCR_CACHE_PROVENANCE", True)
    an._TAGS.clear()
    env["cache"].write_text('{"c_00000/000001_1.jpg": ["20", 0.9')
    _, seen = _run(env)
    assert len(seen) == 6
    env["cache"].write_text(json.dumps({an.crop_key(env["paths"][0]): ["20"], an.crop_key(env["paths"][1]): "x"}))
    cache, _ = _run(env)
    assert all(an._valid_entry(cache[k]) for k in (an.crop_key(env["paths"][0]), an.crop_key(env["paths"][1])))


def test_cache_writes_are_atomic(env):
    _run(env)
    assert not list(env["cache"].parent.glob("ocr_cache.json.tmp-*"))
    json.loads(env["cache"].read_text())

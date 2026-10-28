"""5.2: resumable, configuration-safe stage-1 checkpoints for long recordings.

A stage-1 chunk directory (`detections.npz`, `meta.json`, `crops/`) is only reused when its
`checkpoint.json` proves it was produced from the SAME input bytes, chunk bounds and settings
(detector, image size, stride, keyframe interval, decoder, backend, engine version, model and
package versions - see `stage1_settings`) and its files are intact (sizes + SHA-256). Otherwise:

  * missing / interrupted chunk  -> extracted again (a chunk is written to `<dir>.tmp-<pid>` and only
    renamed into place after its checkpoint is complete, so a crash never leaves a half chunk);
  * corrupt chunk (same settings, damaged files) -> moved aside and extracted again;
  * chunk from DIFFERENT settings -> `ConfigMismatch` (never mixed silently). With
    policy="replace" it is moved aside and redone; moved-aside directories are deleted by
    `cleanup()` (bounded: only `*.tmp-*` / `*.stale-*` inside the store).

Disk space is checked before every chunk against the bytes per video-second the previous chunks
actually used (`DiskSpaceError` instead of a full disk in the middle of a 140-minute match).
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import time
from dataclasses import dataclass
from pathlib import Path

from .envinfo import sha256_file

CHECKPOINT = "checkpoint.json"
SCHEMA = "pitchproof.stage1-checkpoint.v1"
MIN_FREE_BYTES = 2 << 30          # always keep 2 GiB free
DEFAULT_BYTES_PER_SEC = 4 << 20   # before the first chunk: 4 MiB per video-second (crops + npz, generous)
SAFETY = 1.5


class ConfigMismatch(RuntimeError):
    """An existing chunk was produced with different input or settings."""


class DiskSpaceError(RuntimeError):
    """Not enough free disk for the next chunk."""


def fingerprint(obj: dict) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True, separators=(",", ":"), default=str).encode()).hexdigest()


def stage1_settings(env: dict | None = None, **extra) -> dict:
    """Everything that changes stage-1 output. `env` = os.environ by default (the engine reads its
    knobs from SCOUTX_* variables); runtime-only knobs that cannot change results are excluded."""
    env = dict(os.environ if env is None else env)
    affecting = ("SCOUTX_DETECTOR", "SCOUTX_BACKEND", "SCOUTX_DECODER", "SCOUTX_HWACCEL", "SCOUTX_KEYFRAME_EVERY",
                 "SCOUTX_PROP_SCORE_CAP", "SCOUTX_BATCH", "SCOUTX_ORT_PROVIDERS", "SCOUTX_OCR_ENHANCE")
    from importlib.metadata import PackageNotFoundError, version  # noqa: PLC0415

    def v(p):
        try:
            return version(p)
        except PackageNotFoundError:
            return None

    return {"engine": __import__("scoutx_tracker").__version__,
            "env": {k: env.get(k) for k in affecting},
            "packages": {p: v(p) for p in ("torch", "opencv-python", "opencv-python-headless", "numpy", "onnxruntime",
                                           "onnxruntime-gpu")},
            **extra}


@dataclass
class ChunkResult:
    index: int
    run_dir: Path
    meta: dict
    status: str                    # "extracted" | "resumed"
    attempts: int
    wall_sec: float
    replaced: str | None = None    # why an existing directory was moved aside


class Stage1Store:
    def __init__(self, root: str | Path, video_sha256: str, settings: dict, policy: str = "fail",
                 min_free_bytes: int = MIN_FREE_BYTES, check_space: bool = True) -> None:
        if policy not in ("fail", "replace"):
            raise ValueError("policy must be 'fail' or 'replace'")
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.video_sha256 = video_sha256
        self.settings = settings
        self.policy = policy
        self.min_free_bytes = min_free_bytes
        self.check_space = check_space
        self.bytes_per_sec: float | None = None

    def run_dir(self, i: int) -> Path:
        return self.root / f"c_{i:05d}"

    def _expected(self, start: float, end: float) -> dict:
        return {"schema": SCHEMA, "videoSha256": self.video_sha256, "startSec": round(start, 3), "endSec": round(end, 3),
                "settingsFingerprint": fingerprint(self.settings)}

    def status(self, i: int, start: float, end: float) -> tuple[str, str]:
        """("valid" | "missing" | "corrupt" | "mismatch", detail)."""
        d = self.run_dir(i)
        cp = d / CHECKPOINT
        if not d.exists():
            return "missing", ""
        if not cp.exists():
            return "corrupt", "no checkpoint.json (interrupted or written by another tool)"
        try:
            c = json.loads(cp.read_text())
        except (OSError, ValueError) as e:
            return "corrupt", f"unreadable checkpoint: {e}"
        exp = self._expected(start, end)
        diff = [k for k in exp if c.get(k) != exp[k]]
        if diff:
            return "mismatch", ", ".join(f"{k}: {c.get(k)!r} != {exp[k]!r}" for k in diff)
        for name, f in c.get("files", {}).items():
            p = d / name
            if not p.is_file() or p.stat().st_size != f["size"] or ("sha256" in f and sha256_file(p) != f["sha256"]):
                return "corrupt", f"{name} differs from its checkpoint"
        if len(list((d / "crops").glob("*.jpg"))) != c.get("crops", 0):
            return "corrupt", "crop count differs from its checkpoint"
        return "valid", ""

    def _move_aside(self, d: Path) -> None:
        d.rename(d.with_name(f"{d.name}.stale-{int(time.time() * 1000)}"))

    def check_disk(self, seconds: float) -> dict:
        need = (self.bytes_per_sec or DEFAULT_BYTES_PER_SEC) * seconds * SAFETY + self.min_free_bytes
        free = shutil.disk_usage(self.root).free
        if free < need:
            raise DiskSpaceError(f"{free / 2**30:.1f} GiB free at {self.root}, need {need / 2**30:.1f} GiB for the next "
                                 f"{seconds:.0f} s chunk (incl. {self.min_free_bytes / 2**30:.0f} GiB reserve)")
        return {"freeBytes": free, "neededBytes": int(need)}

    def chunk(self, i: int, start: float, end: float, extract_fn, retries: int = 1) -> ChunkResult:
        """Reuse a valid chunk or extract it (`extract_fn(out_dir) -> meta`), retrying `retries` times."""
        st, detail = self.status(i, start, end)
        replaced = None
        d = self.run_dir(i)
        if st == "valid":
            meta = json.loads((d / "meta.json").read_text())
            return ChunkResult(i, d, meta, "resumed", 0, 0.0)
        if st == "mismatch":
            if self.policy == "fail":
                raise ConfigMismatch(f"chunk {i} at {d} was produced with different input/settings ({detail}); "
                                     "use a new work directory or policy='replace'")
            self._move_aside(d)
            replaced = f"mismatch: {detail}"
        elif st == "corrupt":
            self._move_aside(d)
            replaced = f"corrupt: {detail}"
        attempts, last = 0, None
        while attempts <= retries:
            attempts += 1
            if self.check_space:
                self.check_disk(end - start)
            tmp = d.with_name(f"{d.name}.tmp-{os.getpid()}-{attempts}")
            shutil.rmtree(tmp, ignore_errors=True)
            t = time.perf_counter()
            try:
                meta = extract_fn(str(tmp))
                self._write_checkpoint(tmp, start, end, meta)
                tmp.rename(d)
                wall = time.perf_counter() - t
                used = sum(p.stat().st_size for p in d.rglob("*") if p.is_file())
                if end > start:
                    rate = used / (end - start)
                    self.bytes_per_sec = max(self.bytes_per_sec or 0.0, rate)
                return ChunkResult(i, d, meta, "extracted", attempts, wall, replaced)
            except (DiskSpaceError, ConfigMismatch):
                raise
            except Exception as e:  # noqa: BLE001 - retried, then re-raised
                last = e
                shutil.rmtree(tmp, ignore_errors=True)
        raise RuntimeError(f"chunk {i} [{start}, {end}) failed after {attempts} attempts: {type(last).__name__}: {last}") from last

    def _write_checkpoint(self, d: Path, start: float, end: float, meta: dict) -> None:
        files = {}
        for name in ("detections.npz", "meta.json"):
            p = d / name
            if not p.is_file():
                raise RuntimeError(f"extraction produced no {name}")
            files[name] = {"size": p.stat().st_size, "sha256": sha256_file(p)}
        cp = {**self._expected(start, end), "settings": self.settings, "files": files,
              "crops": len(list((d / "crops").glob("*.jpg"))), "frames": meta.get("frames"),
              "written": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
        tmp = d / (CHECKPOINT + ".part")
        tmp.write_text(json.dumps(cp, indent=1, default=str))
        tmp.rename(d / CHECKPOINT)

    def cleanup(self) -> list[str]:
        """Delete interrupted (`*.tmp-*`) and moved-aside (`*.stale-*`) chunk directories - only inside
        this store, never anything else."""
        gone = []
        for p in self.root.iterdir():
            if p.is_dir() and (".tmp-" in p.name or ".stale-" in p.name) and p.parent == self.root:
                shutil.rmtree(p, ignore_errors=True)
                gone.append(p.name)
        return gone

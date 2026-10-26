"""Physical metrics with one documented estimator, validity gates and provenance.

Every value is a dict {value, unit, provenance, method, denominator?, basisSec?}. Provenance:
  calibrated              - from pitch coordinates of a validated pitch calibration
  estimate_experimental   - from the uncalibrated video estimator (player-height scale); kept
                            for development, never shown as a verified production metric
  unavailable             - not enough valid observations (reason given)

Single estimator: the per-frame speed series v(t) is computed once on the VALID observation set;
the summary peak, every sprint's peak, distance and run counts all derive from that same series,
so they are consistent by construction (and checked by invariants.py).
"""

from __future__ import annotations

from dataclasses import dataclass, replace

import numpy as np

from .states import CONFIRMED_VISIBLE, LIKELY_VISIBLE
from .stats import _runs, speeds


@dataclass(frozen=True)
class Thresholds:
    """Configurable per age group / methodology. Defaults: common adult amateur bands."""
    sprint_kmh: float = 19.8           # sprinting band lower bound (>= 5.5 m/s)
    hsr_kmh: float = 14.4              # high-speed running band [hsr, sprint)
    min_run_sec: float = 1.0           # a run must stay above threshold this long
    merge_gap_sec: float = 0.5         # runs separated by less are merged
    max_speed_kmh: float = 36.0        # physically implausible above this -> invalid
    max_accel_ms2: float = 6.0         # implausible acceleration -> invalid frame
    min_cmc_quality: float = 0.7       # camera-motion estimate must be reliable
    min_box_px: float = 30.0           # player too small -> position too noisy
    min_valid_run_sec: float = 1.5     # minimum continuous valid observation to measure motion

    @staticmethod
    def for_age_group(group: str) -> "Thresholds":
        g = (group or "").lower()
        if g in ("u12", "u13", "u14"):
            return Thresholds(sprint_kmh=18.0, hsr_kmh=13.0)
        if g in ("u15", "u16", "u17"):
            return Thresholds(sprint_kmh=19.0, hsr_kmh=14.0)
        if g in ("pro", "elite"):
            return Thresholds(sprint_kmh=25.2, hsr_kmh=19.8)
        return Thresholds()


def _val(value, unit, provenance, method, **extra) -> dict:
    d = {"value": value, "unit": unit, "provenance": provenance, "method": method}
    d.update(extra)
    return d


def valid_motion_mask(tl, states: np.ndarray, camera: np.ndarray | None, cmc_quality: np.ndarray,
                      period_kind: np.ndarray, th: Thresholds) -> np.ndarray:
    h = tl.boxes[:, 3] - tl.boxes[:, 1]
    ok = tl.present & ~np.asarray(tl.interpolated, bool)
    ok &= np.isin(states, [CONFIRMED_VISIBLE, LIKELY_VISIBLE])
    ok &= period_kind == "play"
    ok &= h >= th.min_box_px
    q = np.nan_to_num(cmc_quality, nan=0.0)
    ok &= (q >= th.min_cmc_quality) & (np.r_[1.0, q[:-1]] >= th.min_cmc_quality)
    if camera is not None:
        ok &= camera != "NON_FOOTBALL"
    # Keep only runs long enough to differentiate.
    dt = float(np.median(np.diff(tl.times))) if len(tl.times) > 1 else 0.1
    out = np.zeros_like(ok)
    for a, b in _runs(ok):
        if (b - a) * dt >= th.min_valid_run_sec:
            out[a:b] = True
    return out


def speed_series(tl, fps: float, valid: np.ndarray, th: Thresholds, frame_width: int = 1920) -> np.ndarray:
    """m/s on valid frames, nan elsewhere; implausible values/accelerations invalidated."""
    v = speeds(replace(tl, present=valid.copy()), fps, frame_width=frame_width)
    v[~valid] = np.nan
    v[v * 3.6 > th.max_speed_kmh] = np.nan
    acc = np.abs(np.gradient(np.nan_to_num(v, nan=0.0))) * fps
    bad = (acc > th.max_accel_ms2) & ~np.isnan(v)
    # Invalidate the spike and its immediate neighbours.
    for i in np.flatnonzero(bad):
        v[max(0, i - 1): i + 2] = np.nan
    return v


def _events(v: np.ndarray, times: np.ndarray, lo_kmh: float, hi_kmh: float | None, th: Thresholds, fps: float) -> list[dict]:
    kmh = np.nan_to_num(v, nan=-1.0) * 3.6
    band = (kmh >= lo_kmh) & ((kmh < hi_kmh) if hi_kmh else True)
    runs = _runs(band)
    merged: list[list[int]] = []
    gap = int(round(th.merge_gap_sec * fps))
    for a, b in runs:
        # Never merge across invalid (nan) frames: an unobserved gap is not running.
        if merged and a - merged[-1][1] <= gap and not np.isnan(v[merged[-1][1]:a]).any():
            merged[-1][1] = b
        else:
            merged.append([a, b])
    out = []
    for a, b in merged:
        if (b - a) / fps < th.min_run_sec:
            continue
        seg = v[a:b]
        dist = float(np.nansum(seg) / fps)
        out.append({"start": float(times[a]), "end": float(times[b - 1]), "durationSec": round((b - a) / fps, 1),
                    "peakKmh": round(float(np.nanmax(seg)) * 3.6, 1), "distanceM": round(dist, 1)})
    return out


def physical_metrics(tl, fps: float, states: np.ndarray, camera: np.ndarray | None, cmc_quality: np.ndarray,
                     period_kind: np.ndarray, th: Thresholds | None = None, frame_width: int = 1920,
                     calibrated: bool = False) -> tuple[dict, np.ndarray]:
    th = th or Thresholds()
    valid = valid_motion_mask(tl, states, camera, cmc_quality, period_kind, th)
    v = speed_series(tl, fps, valid, th, frame_width)
    basis = float(np.count_nonzero(~np.isnan(v))) / fps
    prov = "calibrated" if calibrated else "estimate_experimental"
    method = ("pitch-calibrated ground positions" if calibrated else
              "uncalibrated: camera-motion-compensated image motion scaled by an assumed 1.8 m player height "
              "(pinhole depth from box height, damped); single moving camera, no pitch calibration")
    if basis < 30:
        reason = f"only {basis:.0f} s of valid motion observations (need >= 30 s)"
        na = {k: _val(None, u, "unavailable", method, reason=reason) for k, u in
              (("distanceObserved", "m"), ("peakSpeed", "km/h"), ("workRate", "m/min"))}
        return {"status": "unavailable", "reason": reason, "provenance": "unavailable", "values": na,
                "sprints": [], "highSpeedRuns": [], "thresholds": th.__dict__, "productionVisible": False}, v
    sprints = _events(v, tl.times, th.sprint_kmh, None, th, fps)
    hsr = _events(v, tl.times, th.hsr_kmh, th.sprint_kmh, th, fps)
    dist = float(np.nansum(v) / fps)
    peak = float(np.nanmax(v)) * 3.6
    values = {
        "distanceObserved": _val(round(dist), "m", prov, method, basisSec=round(basis, 1),
                                 note="Distance while validly observed only - not total match distance."),
        "workRate": _val(round(dist / (basis / 60.0), 1), "m/min", prov, method,
                         denominator="metres per validly observed minute"),
        "peakSpeed": _val(round(peak, 1), "km/h", prov, method,
                          note="Maximum of the same smoothed speed series used for sprint peaks."),
        "sprintCount": _val(len(sprints), "count", prov, method, threshold=f">= {th.sprint_kmh} km/h for >= {th.min_run_sec} s"),
        "highSpeedRunCount": _val(len(hsr), "count", prov, method,
                                  threshold=f"[{th.hsr_kmh}, {th.sprint_kmh}) km/h for >= {th.min_run_sec} s (excludes sprint time)"),
        "sprintDistance": _val(round(sum(s["distanceM"] for s in sprints)), "m", prov, method),
    }
    return {"status": "calibrated" if calibrated else "experimental", "provenance": prov,
            "reason": None if calibrated else "No validated pitch calibration for this recording; values are development estimates.",
            "values": values, "sprints": sprints, "highSpeedRuns": hsr, "thresholds": th.__dict__,
            "productionVisible": bool(calibrated), "validObservationSec": round(basis, 1)}, v

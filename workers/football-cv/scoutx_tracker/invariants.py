"""Numerical consistency checks run on every report. A violation is a bug, never a judgement call."""

from __future__ import annotations

EPS = 0.11  # one frame at 10 fps plus rounding


def check(report: dict) -> list[str]:
    v: list[str] = []
    cov = report.get("coverage", {})
    rec = cov.get("recordingSec", 0.0)

    def near(a: float, b: float, tol: float = 0.5) -> bool:
        return abs(a - b) <= tol

    if cov:
        if not near(cov["nonMatchSec"] + cov["offPitchSec"] + cov["matchSec"], rec):
            v.append("coverage: nonMatch + offPitch + match != recording")
        if not near(cov["unobservedSec"] + cov["analysedSec"], cov["matchSec"]):
            v.append("coverage: unobserved + analysed != match")
        leaves = cov["confirmedVisibleSec"] + cov["likelyVisibleSec"] + cov["ambiguousSec"] + cov["notIdentifiedSec"]
        if not near(leaves, cov["analysedSec"]):
            v.append("coverage: identity states do not partition analysed time")
        if cov["confirmedVisibleSec"] + cov["likelyVisibleSec"] > cov["analysedSec"] + EPS:
            v.append("coverage: visible time exceeds analysed time")
        if any(x < 0 for x in (cov[k] for k in cov if k.endswith("Sec"))):
            v.append("coverage: negative duration")

    phys = report.get("physical", {})
    vals = phys.get("values", {})
    peak = (vals.get("peakSpeed") or {}).get("value")
    for s in phys.get("sprints", []) + phys.get("highSpeedRuns", []):
        if peak is not None and s["peakKmh"] > peak + 0.05:
            v.append(f"physical: event peak {s['peakKmh']} > summary peak {peak}")
        if not (0 <= s["start"] <= s["end"] <= rec + EPS):
            v.append("physical: run outside the recording")
    if peak is not None and phys.get("sprints"):
        th = phys["thresholds"]["sprint_kmh"]
        if peak < th:
            v.append("physical: sprints reported but peak below sprint threshold")
    dist = (vals.get("distanceObserved") or {}).get("value")
    if dist is not None and dist < 0:
        v.append("physical: negative distance")
    if (vals.get("sprintCount") or {}).get("value") not in (None, len(phys.get("sprints", []))):
        v.append("physical: sprint count != listed sprints")
    if phys.get("productionVisible") and phys.get("provenance") != "calibrated":
        v.append("physical: uncalibrated metrics marked production-visible")

    rejected = {r["tid"] for r in report.get("excluded", [])}
    chosen = {t["tid"] for t in report.get("tracklets", [])}
    if rejected & chosen:
        v.append("identity: a rejected/excluded tracklet is attributed to the target")

    for e in report.get("events", []):
        if not (0 <= e["start"] <= e["end"] <= rec + EPS):
            v.append(f"events: {e.get('type')} outside the recording")
        if e.get("outcome") == "completed" and e.get("outcomeEvidence") != "verified":
            v.append("events: completed outcome without verified evidence")
        if e.get("tid") in rejected:
            v.append("events: event attributed to a rejected tracklet")
    n_events = len(report.get("events", []))
    for m in report.get("moments", []):
        if m.get("identityState") not in ("CONFIRMED_VISIBLE", "LIKELY_VISIBLE"):
            v.append("moments: moment on frames not claimed for the target")
        if not (0 <= m["clipStart"] <= m["clipEnd"] <= (rec if rec > 0 else float("inf")) + EPS) or m["clipEnd"] - m["clipStart"] > 20.0 + EPS:
            v.append("moments: clip window invalid")
        if any(not (0 <= i < n_events) for i in m.get("eventIndices", [])):
            v.append("moments: references a missing event")
        if m.get("kind") != "spell" and not m.get("eventIndices"):
            v.append("moments: action moment without a measured event")
    ball = report.get("ball", {})
    if ball and ball.get("completedPasses", 0) > ball.get("passAttempts", 0):
        v.append("ball: completed passes exceed attempts")
    return v

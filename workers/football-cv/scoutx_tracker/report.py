"""Self-contained HTML report (schema pitchproof.tracking.v3). Every number carries provenance."""

from __future__ import annotations

import base64
import html
from pathlib import Path

import numpy as np

STATE_HEX = {"CONFIRMED_VISIBLE": "#1f9d55", "LIKELY_VISIBLE": "#8bc34a", "AMBIGUOUS": "#f0a500",
             "UNKNOWN": "#d5dbd6", "OFF_CAMERA": "#c9d3e6", "CONFIRMED_OFF_PITCH": "#9aa7c0",
             "NON_MATCH_PERIOD": "#b9b9b9"}
STATE_LABEL = {"CONFIRMED_VISIBLE": "Confirmed you (number read or your answer)",
               "LIKELY_VISIBLE": "Probably you (appearance + movement)",
               "AMBIGUOUS": "Unsure (look-alike team-mate possible)",
               "UNKNOWN": "Not identified / camera not on play",
               "NON_MATCH_PERIOD": "Outside the match"}
PROV_LABEL = {"calibrated": "Calibrated measurement", "estimate_experimental": "Experimental estimate",
              "unavailable": "Unavailable", "model_estimate_unvalidated": "Model estimate (unvalidated)"}

POSITION_FOCUS = {
    "goalkeeper": ["shot stopping", "positioning", "distribution"],
    "centre_back": ["defensive positioning", "duels", "build-up involvement"],
    "full_back": ["recovery runs", "wide positioning", "overlaps"],
    "defensive_midfielder": ["screening", "press resistance", "passing options"],
    "midfielder": ["receiving positions", "support movement", "pressing"],
    "winger": ["runs behind", "1v1 dribbling", "defensive recovery"],
    "striker": ["runs behind", "hold-up play", "pressing"],
}


def _clock(t: float) -> str:
    return f"{int(t // 60):02d}:{int(t % 60):02d}"


def _esc(x) -> str:
    return html.escape(str(x))


def _state_strip(times, states, width=1000, height=40) -> str:
    t0, t1 = float(times[0]), float(times[-1]) + 1e-6
    bins = 500
    idx = np.clip(((times - t0) / (t1 - t0) * bins).astype(int), 0, bins - 1)
    order = list(STATE_HEX)
    rects = []
    bw = width / bins
    for b in range(bins):
        m = idx == b
        if not m.any():
            continue
        labs, counts = np.unique(states[m], return_counts=True)
        lab = labs[np.argmax(counts)] if "CONFIRMED_VISIBLE" not in labs else "CONFIRMED_VISIBLE"
        rects.append(f'<rect x="{b * bw:.1f}" y="0" width="{bw + 0.3:.1f}" height="{height}" fill="{STATE_HEX.get(lab, "#ccc")}"/>')
    ticks = []
    for mnt in range(0, int(t1 // 60) + 1, 5):
        x = (mnt * 60 - t0) / (t1 - t0) * width
        if 0 <= x <= width:
            ticks.append(f'<text x="{x:.1f}" y="{height + 15}" font-size="11" text-anchor="middle" fill="currentColor" opacity=".7">{mnt}\'</text>')
    _ = order
    return (f'<svg viewBox="0 0 {width} {height + 20}" width="100%" role="img" aria-label="Identity state over the recording">'
            f'{"".join(rects)}{"".join(ticks)}</svg>')


def _img(path: str | None, alt: str) -> str:
    if not path or not Path(path).exists():
        return ""
    b64 = base64.b64encode(Path(path).read_bytes()).decode()
    return f'<img class="sheet" alt="{_esc(alt)}" src="data:image/jpeg;base64,{b64}"/>'


def observations(result: dict) -> list[dict]:
    """Evidence-grounded notes. Only states what was observed; every note links to timestamps."""
    notes = []
    pos = (result["target"].get("position") or "unknown").lower()
    phys = result.get("physical", {})
    for s in phys.get("sprints", [])[:5]:
        notes.append({"t": s["start"], "kind": "movement",
                      "text": f"High-speed run of {s['durationSec']} s (experimental speed estimate).",
                      "why": "Repeated high-intensity runs matter for " + ", ".join(POSITION_FOCUS.get(pos, ["your role"])[:1]) + ".",
                      "uncertainty": "Speed is not pitch-calibrated."})
    for e in result.get("events", []):
        if e["type"] in ("contact", "carry") and e["identityState"] == "CONFIRMED_VISIBLE":
            notes.append({"t": e["start"], "kind": "on the ball", "text": f"Ball {e['type']} while confirmed on camera.",
                          "why": "Confirmed involvements are the clips scouts look at first.",
                          "uncertainty": "Event detection is unvalidated."})
    return sorted(notes, key=lambda n: n["t"])[:12]


def write_report(out_path: str, result: dict, timeline: dict, contact_sheet: str | None = None,
                 highlights: str | None = None, questions_img: str | None = None, out_dir: str = ".") -> None:
    tg = result["target"]
    who = f"#{tg['number']} · {tg['kit']}" + (f"/{tg['kit2']}" if tg.get("kit2") else "")
    cov = result["coverage"]
    phys = result["physical"]
    ball = result.get("ball", {})
    ident = result["identity"]
    inv = result.get("invariants", {"ok": True, "violations": []})

    def card(label, value, sub, prov):
        tag = f'<span class="prov p-{_esc(prov)}">{_esc(PROV_LABEL.get(prov, prov))}</span>' if prov else ""
        return (f'<div class="card"><div class="lab">{_esc(label)}</div><div class="val">{_esc(value)}</div>'
                f'<div class="sub">{_esc(sub)}</div>{tag}</div>')

    a = max(cov["analysedSec"], 1e-9)
    cards = [
        card("Confirmed on camera", f"{cov['confirmedVisibleSec'] / 60:.1f} min",
             f"{100 * cov['confirmedVisibleSec'] / a:.0f}% of analysed match time", "verified"),
        card("Probably you", f"{cov['likelyVisibleSec'] / 60:.1f} min", "appearance + movement, not confirmed", "likely"),
        card("Unsure", f"{cov['ambiguousSec'] / 60:.1f} min", "a look-alike team-mate is possible", "ambiguous"),
        card("Analysed match time", f"{cov['analysedSec'] / 60:.1f} min",
             f"of {cov['recordingSec'] / 60:.1f} min recording · {cov['unobservedSec'] / 60:.1f} min camera off play", ""),
    ]
    vals = phys.get("values", {})
    pv = lambda k: (vals.get(k) or {}).get("value")  # noqa: E731
    phys_rows = ""
    if phys.get("status") == "unavailable":
        phys_html = f'<p class="muted">Unavailable: {_esc(phys.get("reason"))}</p>'
    else:
        for k, label in (("distanceObserved", "Distance while validly observed"), ("workRate", "Work rate"),
                         ("peakSpeed", "Peak speed"), ("sprintCount", "Sprints"), ("highSpeedRunCount", "High-speed runs"),
                         ("sprintDistance", "Sprint distance")):
            v = vals.get(k) or {}
            extra = v.get("denominator") or v.get("threshold") or v.get("note") or ""
            phys_rows += f'<tr><td>{_esc(label)}</td><td><b>{_esc(v.get("value"))}</b> {_esc(v.get("unit", ""))}</td><td class="muted">{_esc(extra)}</td></tr>'
        phys_html = (f'<div class="banner">Experimental - not shown as verified statistics. {_esc(phys.get("reason") or "")} '
                     f'Based on {phys.get("validObservationSec")} s of valid observations.</div>'
                     f'<table>{phys_rows}</table>')
    heat = result.get("heatmap") or {"status": "unavailable", "reason": "No validated pitch calibration for this recording."}
    unavailable = [("Movement heatmap", heat.get("reason")),
                   ("Calibrated distance and speed", "Needs a validated pitch calibration (visible pitch landmarks)."),
                   ("Passing accuracy", "Pass outcomes are only counted with a continuous ball track to a controlled reception; "
                                        f"{ball.get('unknownOutcomePasses', 0)} attempt(s) had an unknown outcome."),
                   ("Shots, tackles, interceptions", "Not implemented / not validated yet.")]
    unavail_html = "".join(f"<li><b>{_esc(k)}</b> - {_esc(v)}</li>" for k, v in unavailable)
    ev_rows = "".join(
        f'<tr><td>{_clock(e["start"])}</td><td>{_esc(e["type"])}</td><td>{_esc(e.get("outcome", "-"))}</td>'
        f'<td>{_esc(e["identityState"].replace("_", " ").lower())}</td></tr>'
        for e in result.get("events", [])[:200])
    notes = observations(result)
    notes_html = "".join(f'<li><b>{_clock(n["t"])}</b> {_esc(n["text"])} <span class="muted">{_esc(n["why"])} '
                         f'({_esc(n["uncertainty"])})</span></li>' for n in notes) or \
        '<li class="muted">Not enough confirmed observations yet for position-specific notes.</li>'
    periods = "".join(f'<li>{_clock(p["start"])}-{_clock(p["end"])}: {_esc(p["label"].replace("_", " "))} '
                      f'<span class="muted">({_esc(p["source"])})</span></li>' for p in result["timeline"]["periods"])
    legend = "".join(f'<span class="lg"><i style="background:{STATE_HEX[s]}"></i>{_esc(STATE_LABEL[s])}</span>'
                     for s in STATE_LABEL)
    qs = result.get("reviewQuestions") or []
    help_ai = ""
    if questions_img and Path(questions_img).exists() and qs:
        unsure = sum(q.get("affectedSec", 0) for q in qs)
        help_ai = (f'<h2>Help the AI ({len(qs)} quick checks)</h2><div class="panel"><p>These moments decide about '
                   f'{unsure / 60:.1f} min of tracking. Is the <b>yellow box</b> you ({_esc(who)})? Answer yes, not me, unsure or skip.</p>'
                   f'{_img(questions_img, "Review questions")}'
                   f'<pre>python -m scoutx_tracker answer "{_esc(out_dir)}" 1y 2n 3u</pre>'
                   f'<p class="muted">Answers only change this match\'s analysis. They are never used to train models.</p></div>')
    inv_html = "" if inv.get("ok") else f'<div class="banner bad">Consistency check failed: {_esc("; ".join(inv["violations"]))}</div>'
    vid = f'<p><a href="{_esc(Path(highlights).name)}">Open highlight video</a></p>' if highlights else ""
    strip = _state_strip(np.asarray(timeline["times"]), np.asarray(timeline["states"]))
    page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Player tracking report</title>
<style>
:root{{--bg:#f6f7f5;--fg:#16201a;--muted:#5d6b62;--card:#fff;--line:#e2e6e1;--accent:#1f8a4c;--warn:#fff4d6;--bad:#fde2e1}}
@media (prefers-color-scheme:dark){{:root{{--bg:#0f1411;--fg:#e8efe9;--muted:#9aa89f;--card:#18201b;--line:#26302a;--accent:#3fbf73;--warn:#3a3214;--bad:#3d1d1c}}}}
body{{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}}
main{{max-width:1040px;margin:0 auto;padding:24px 16px 64px}} h1{{font-size:26px;margin:0 0 4px}} h2{{font-size:18px;margin:30px 0 8px}}
.muted{{color:var(--muted)}} .grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin-top:18px}}
.card,.panel{{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}}
.lab{{color:var(--muted);font-size:13px}} .val{{font-size:26px;font-weight:700;margin:2px 0}} .sub{{color:var(--muted);font-size:12px}}
.prov{{display:inline-block;margin-top:6px;font-size:11px;padding:2px 8px;border-radius:99px;background:var(--line)}}
.banner{{background:var(--warn);border-radius:10px;padding:10px 12px;margin:8px 0}} .bad{{background:var(--bad)}}
table{{width:100%;border-collapse:collapse;font-size:14px}} td,th{{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line)}}
.lg{{display:inline-flex;align-items:center;gap:6px;margin:6px 14px 0 0;font-size:13px}} .lg i{{width:12px;height:12px;border-radius:3px;display:inline-block}}
.sheet{{width:100%;border-radius:10px;border:1px solid var(--line)}} pre{{background:var(--line);padding:10px;border-radius:8px;overflow:auto}}
.scroll{{max-height:320px;overflow:auto}} ul{{padding-left:18px}}
</style></head><body><main>
<h1>Player tracking · {_esc(who)}</h1>
<div class="muted">Recording {_clock(cov['recordingSec'])} · position: {_esc(tg.get('position', 'unknown'))} · engine {_esc(result['engine']['version'])}</div>
{inv_html}
<div class="grid">{"".join(cards)}</div>
<p class="muted">Percentages refer to analysed match time (camera showing play), not to your playing time. Identity scores are uncalibrated.</p>
<h2>When we had you</h2><div class="panel">{strip}<div>{legend}</div></div>
<h2>Match periods</h2><div class="panel"><ul>{periods}</ul><p class="muted">Wrong? Set kick-off / half-time / full-time and the analysis updates without re-processing the video.</p></div>
<h2>Who we followed</h2>{_img(contact_sheet, "Target crops over the match")}{vid}
{help_ai}
<h2>On the ball <span class="prov">{_esc(PROV_LABEL.get(ball.get('provenance'), ''))}</span></h2>
<div class="panel"><p>{ball.get('contacts', 0)} ball contacts ({ball.get('carries', 0)} carries) · {ball.get('passAttempts', 0)} pass attempts:
{ball.get('completedPasses', 0)} completed, {ball.get('incompletePasses', 0)} incomplete, {ball.get('unknownOutcomePasses', 0)} unknown.</p>
<p class="muted">{_esc(ball.get('note', ''))}</p><div class="scroll"><table><tr><th>Time</th><th>Event</th><th>Outcome</th><th>Identity</th></tr>{ev_rows}</table></div></div>
<h2>Movement</h2><div class="panel">{phys_html}</div>
<h2>Observations</h2><div class="panel"><ul>{notes_html}</ul></div>
<h2>Not available for this recording</h2><div class="panel"><ul>{unavail_html}</ul></div>
<p class="muted">Identity confirmed {ident.get('numberSightings', 0)}x by shirt number and {ident.get('confirmedByUser', 0)}x by you.
No facial recognition is used. Other players' tracks are discarded after analysis.</p>
</main></body></html>"""
    Path(out_path).write_text(page, encoding="utf-8")

"""Self-contained HTML report for one tracked player."""

from __future__ import annotations

import base64
import html
from pathlib import Path

import numpy as np

EV_HEX = {"number": "#2fb84f", "anchor": "#2fb84f", "appearance": "#f0a500", "continuity": "#e07020",
          "interpolated": "#9aa0a6"}


def _clock(t: float) -> str:
    return f"{int(t // 60):02d}:{int(t % 60):02d}"


def _timeline_svg(times, present, evidence, width=1000, height=46) -> str:
    t0, t1 = float(times[0]), float(times[-1]) + 1e-6
    bins = 500
    edges = np.linspace(t0, t1, bins + 1)
    idx = np.clip(np.searchsorted(edges, times, side="right") - 1, 0, bins - 1)
    rects = []
    bw = width / bins
    for b in range(bins):
        m = (idx == b) & present
        if not m.any():
            continue
        labs, counts = np.unique(evidence[m], return_counts=True)
        lab = labs[np.argmax(counts)]
        frac = m.sum() / max((idx == b).sum(), 1)
        rects.append(f'<rect x="{b * bw:.1f}" y="{height * (1 - frac):.1f}" width="{bw + 0.3:.1f}" '
                     f'height="{height * frac:.1f}" fill="{EV_HEX.get(lab, "#888")}"/>')
    ticks = []
    for m in range(0, int(t1 // 60) + 1, 5):
        x = (m * 60 - t0) / (t1 - t0) * width
        if 0 <= x <= width:
            ticks.append(f'<line x1="{x:.1f}" x2="{x:.1f}" y1="{height}" y2="{height + 5}" stroke="currentColor" opacity=".5"/>'
                         f'<text x="{x:.1f}" y="{height + 17}" font-size="11" text-anchor="middle" fill="currentColor" opacity=".7">{m}\'</text>')
    return (f'<svg viewBox="0 0 {width} {height + 20}" width="100%" role="img" aria-label="When the player was tracked">'
            f'<rect width="{width}" height="{height}" fill="var(--track)"/>{"".join(rects)}{"".join(ticks)}</svg>')


def _bars_svg(buckets, key, unit, width=1000, height=120) -> str:
    if not buckets:
        return ""
    vals = [b[key] for b in buckets]
    vmax = max(max(vals), 1e-9)
    bw = width / len(buckets)
    parts = []
    for i, (b, v) in enumerate(zip(buckets, vals)):
        h = (height - 18) * v / vmax
        x = i * bw
        parts.append(f'<rect x="{x + 3:.1f}" y="{height - 18 - h:.1f}" width="{bw - 6:.1f}" height="{h:.1f}" rx="3" fill="var(--accent)">'
                     f'<title>{_clock(b["from"])}–{_clock(b["to"])}: {v} {unit}</title></rect>'
                     f'<text x="{x + bw / 2:.1f}" y="{height - 4}" font-size="11" text-anchor="middle" fill="currentColor" opacity=".7">{int(b["from"] // 60)}\'</text>')
    return f'<svg viewBox="0 0 {width} {height}" width="100%">{"".join(parts)}</svg>'


def write_report(out_path: str, result: dict, timeline: dict, contact_sheet: str | None = None,
                 highlights: str | None = None, questions_img: str | None = None, out_dir: str = ".") -> None:
    s = result["stats"]
    tg = result["target"]
    who = f"#{tg['number']} · {tg['kit']}" + (f"/{tg['kit2']}" if tg.get("kit2") else "")

    def card(label, value, sub=""):
        v = "—" if value is None else value
        return f'<div class="card"><div class="lab">{label}</div><div class="val">{v}</div><div class="sub">{sub}</div></div>'

    cards = "".join([
        card("Tracked on camera", f"{s['visibleSec'] / 60:.1f} min", f"{s['visiblePct']}% of the recording"),
        card("Distance (on camera)", f"{s['distanceVisibleM'] / 1000:.2f} km", "estimate"),
        card("Work rate", f"{s['workRateMPerMin']} m/min" if s.get("workRateMPerMin") else None, "while visible"),
        card("Top speed", f"{s['topSpeedKmh']} km/h" if s.get("topSpeedKmh") else None, "estimate"),
        card("Sprints", s["sprints"], f"≥ 20 km/h · {s['sprintDistanceM']:.0f} m"),
        card("High-intensity runs", s["highIntensityRuns"], "≥ 14.4 km/h for 1 s+"),
        card("Ball involvements", s["ballInvolvements"], f"{s['possessionSec']} s on the ball"),
        card("Passes to a teammate", s["passesToTeammate"], f"{s['ballsLost']} lost · {s['contested']} contested"),
    ])
    ev = s["identityEvidenceSec"]
    total_ev = max(sum(ev.values()), 1e-9)
    ev_rows = "".join(
        f'<div class="evrow"><span class="dot" style="background:{EV_HEX[k]}"></span>{html.escape(name)}'
        f'<span class="evv">{ev[k] / 60:.1f} min · {100 * ev[k] / total_ev:.0f}%</span></div>'
        for k, name in [("number", "Number read (#%s seen)" % tg["number"]), ("anchor", "Confirmed by you"),
                        ("appearance", "Appearance match"), ("continuity", "Followed through movement"),
                        ("interpolated", "Short gap filled")] if ev.get(k))
    inv_rows = "".join(
        f'<tr><td>{_clock(e["start"])}</td><td>{e["end"] - e["start"] + 0.1:.1f} s</td><td>{html.escape(e["outcome"])}</td></tr>'
        for e in s["involvementList"][:200])
    sprint_rows = "".join(f'<tr><td>{_clock(e["start"])}</td><td>{e["end"] - e["start"] + 0.1:.1f} s</td><td>{e["peakKmh"]} km/h</td></tr>'
                          for e in s["sprintList"][:200])
    img = ""
    if contact_sheet and Path(contact_sheet).exists():
        b64 = base64.b64encode(Path(contact_sheet).read_bytes()).decode()
        img = f'<h2>Who we followed</h2><p class="muted">Evenly spaced moments where the AI says this is {html.escape(who)}. ' \
              f'Green = number read, amber = appearance, orange = followed through movement.</p>' \
              f'<img class="sheet" alt="Target crops over the match" src="data:image/jpeg;base64,{b64}"/>'
    help_ai = ""
    qs = result.get("reviewQuestions") or []
    if questions_img and Path(questions_img).exists() and qs:
        b64q = base64.b64encode(Path(questions_img).read_bytes()).decode()
        unsure = sum(q["seconds"] for q in qs)
        help_ai = (f'<h2>Help the AI (optional, ~1 minute)</h2><div class="panel"><p>These {len(qs)} moments decide about '
                   f'{unsure / 60:.1f} minutes of tracking. Is the <b>yellow box</b> {html.escape(who)}?</p>'
                   f'<img class="sheet" alt="Review questions" src="data:image/jpeg;base64,{b64q}"/>'
                   f'<p class="muted">Answer with the question numbers, e.g.</p>'
                   f'<pre>python -m scoutx_tracker answer "{html.escape(out_dir)}" 1y 2n 3y</pre>'
                   f'<p class="muted">Every answer also teaches the AI what this player looks like, so the rest of '
                   f'the match improves too. In the app this is a swipe: yes / not me.</p></div>')
    vid = f'<p><a href="{html.escape(Path(highlights).name)}">Open highlight video</a></p>' if highlights else ""
    tl_svg = _timeline_svg(np.asarray(timeline["times"]), np.asarray(timeline["present"]), np.asarray(timeline["evidence"]))
    page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Player tracking report</title>
<style>
:root{{--bg:#f6f7f5;--fg:#16201a;--muted:#5d6b62;--card:#fff;--line:#e2e6e1;--accent:#1f8a4c;--track:#e8ece7}}
@media (prefers-color-scheme:dark){{:root{{--bg:#0f1411;--fg:#e8efe9;--muted:#9aa89f;--card:#18201b;--line:#26302a;--accent:#3fbf73;--track:#1d2620}}}}
body{{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}}
main{{max-width:1040px;margin:0 auto;padding:24px 16px 64px}}
h1{{font-size:26px;margin:0 0 4px}} h2{{font-size:18px;margin:32px 0 8px}} .muted{{color:var(--muted)}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px;margin-top:20px}}
.card{{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}}
.lab{{color:var(--muted);font-size:13px}} .val{{font-size:26px;font-weight:700;margin:2px 0}} .sub{{color:var(--muted);font-size:12px}}
.panel{{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px}}
.evrow{{display:flex;align-items:center;gap:8px;padding:3px 0}} .evv{{margin-left:auto;color:var(--muted)}}
.dot{{width:10px;height:10px;border-radius:50%;display:inline-block}}
table{{width:100%;border-collapse:collapse;font-size:14px}} td,th{{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line)}}
.two{{display:grid;grid-template-columns:1fr 1fr;gap:16px}} @media(max-width:720px){{.two{{grid-template-columns:1fr}}}}
.scroll{{max-height:320px;overflow:auto}} .sheet{{width:100%;border-radius:10px;border:1px solid var(--line)}}
pre{{background:var(--track);padding:10px;border-radius:8px;overflow:auto}} .note{{font-size:13px;color:var(--muted);margin-top:28px}}
</style></head><body><main>
<h1>Player tracking · {html.escape(who)}</h1>
<div class="muted">Recording {_clock(s['recordingSec'])} · followed automatically by ScoutX AI</div>
<div class="grid">{cards}</div>
<h2>When we had the player</h2>
<div class="panel">{tl_svg}<div style="margin-top:10px">{ev_rows}</div></div>
<div class="two"><div><h2>Distance per 5 minutes</h2><div class="panel">{_bars_svg(s['buckets'], 'distanceM', 'm')}</div></div>
<div><h2>Ball involvements per 5 minutes</h2><div class="panel">{_bars_svg(s['buckets'], 'involvements', 'involvements')}</div></div></div>
{img}{vid}{help_ai}
<div class="two"><div><h2>Ball involvements</h2><div class="panel scroll"><table><tr><th>Time</th><th>Length</th><th>Next touch by</th></tr>{inv_rows}</table></div></div>
<div><h2>Sprints</h2><div class="panel scroll"><table><tr><th>Time</th><th>Length</th><th>Peak</th></tr>{sprint_rows}</table></div></div></div>
<p class="note">How to read this: the AI follows the player only while the camera shows him. Physical numbers are
estimates from one handheld camera without pitch calibration (distance scaled by player height), so they
under-count runs straight towards or away from the camera. "Next touch by" uses the next player seen at the
ball within 3.5 s. Identity colours show how each moment was confirmed.</p>
</main></body></html>"""
    Path(out_path).write_text(page, encoding="utf-8")

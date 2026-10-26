"""Stage 3: decide which tracklets belong to the target player across the whole match.

Evidence per tracklet
  * kit colour - must look like the target's team;
  * shirt/shorts number reads - the target number is strong positive evidence, a clearly read
    different number excludes the tracklet;
  * user feedback - "this is me" (anchor) / "not me" (reject), given as time + image position so
    it survives re-tracking;
  * appearance - a classifier trained for THIS match: positives are tracklets proven to be the
    target, negatives are tracklets proven not to be (other number, rejected, or visible at the
    same moment as a proven target sighting). Until enough positives exist, similarity to the
    target template relative to team-mates is used instead.
Between tracklets
  * motion continuity in camera-compensated coordinates: a gap is only bridged if the distance is
    physically runnable, and the target can never be in two places at once.
The best chain over the whole match is found with dynamic programming; confident results are
fed back as positives (self-training), then review questions are proposed for the moments where
one human answer would change the most.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np

MAX_SPEED_BH = 5.0      # body-heights per second (~9 m/s) a player can cover
SLACK_BH = 1.2          # box noise allowance
PLAYER_HEIGHT_M = 1.8
PRIOR_LOGODDS = 1.0     # most same-kit tracklets are NOT the target
MIN_QUESTION_BOX_PX = 90.0   # smaller players can't be recognised by the user either
QUESTION_BATCH = 8           # compact first review batch; more on request
# "resolve" (3.2): a question's value includes the ambiguity it removes - a "not me" on a look-alike
# that is in view while the target is claimed clears that whole overlap. "legacy": 3.1 behaviour.
QUESTION_STRATEGY = "resolve"
COMPETITOR_SCORE = 0.35      # same threshold as states.COMPETITOR


@dataclass
class Target:
    number: str | None = None
    kit_primary: str = ""
    kit_secondary: str = ""
    anchors: list[tuple[float, float, float]] = field(default_factory=list)  # (t, x, y): "this is me"
    rejects: list[tuple[float, float, float]] = field(default_factory=list)  # (t, x, y): "not me"
    # (t, x, y) the user already saw and answered "unsure"/"skip": no evidence, never asked again.
    asked: list[tuple[float, float, float]] = field(default_factory=list)


@dataclass
class IdentityResult:
    chosen: list[int]
    unary: np.ndarray
    evidence: dict
    confidence: dict
    seeds: list[int]
    candidates: list[int]
    iterations: list[dict]
    questions: list[dict]
    excluded: dict
    # Uncalibrated per-candidate target score in [0, 1] (NOT a probability until calibrated on
    # labelled footage), and which tracklets carry hard evidence.
    score: dict = field(default_factory=dict)
    confirmed: set = field(default_factory=set)
    # Moments (source seconds) of hard evidence per tracklet: target-number reads, user answers.
    evidence_times: dict = field(default_factory=dict)
    appearance_score: dict = field(default_factory=dict)  # same as score, before hard evidence
    # Moments of reads that cannot be the target number (another number, or a digit the target
    # number does not contain). Hard evidence never reaches past the midpoint towards one.
    conflict_times: dict = field(default_factory=dict)


def incompatible_with_target(num: str, target: str | None) -> bool:
    """A read that cannot come from the target's shirt: a different FULL number ("17" vs "20").
    Lone digits are never used: measured on IMG_4809, the OCR read a lone "1" on a clearly visible
    "20" and a "4" on the same shirt at confidence 1.0 - lone digits are noise, not evidence."""
    if not target or not num or len(num) != len(target):
        return False
    return num != target


def number_votes(reads: list[tuple], number: str | None) -> tuple[float, float, int, int, str | None]:
    """reads: [(frame, num, conf, where)] -> (target weight, other weight, n_target, n_other, other number).
    Only reads with as many digits as the target count: a lone "1" or "7" is usually half of a
    two-digit number seen at an angle."""
    tw = ow = 0.0
    nt = no = 0
    others: dict[str, int] = {}
    for _, num, conf, _ in reads:
        if number is not None and len(num) != len(number):
            continue
        if number is not None and num == number:
            tw += conf
            nt += 1
        else:
            ow += conf
            no += 1
            others[num] = others.get(num, 0) + 1
    top = max(others, key=others.get) if others else None
    return tw, ow, nt, no, top


def locate(summary: list[dict], rows: np.ndarray, by_tid: dict, points) -> list[int]:
    """Map (t, x, y) points to the tracklet whose box contains them at that moment."""
    out = []
    for t, x, y in points:
        best, bd = None, 1e9
        for k, s in enumerate(summary):
            if not (s["t0"] - 0.3 <= t <= s["t1"] + 0.3):
                continue
            ix = by_tid[s["tid"]]
            r = rows[ix[np.argmin(np.abs(rows[ix, 1] - t))]]
            if abs(r[1] - t) > 0.35:
                continue
            x1, y1, x2, y2 = r[3:7]
            pad = 0.15 * (y2 - y1)
            if not (x1 - pad <= x <= x2 + pad and y1 - pad <= y <= y2 + pad):
                continue
            d = np.hypot((x1 + x2) / 2 - x, (y1 + y2) / 2 - y) / max(y2 - y1, 1)
            if d < bd:
                best, bd = k, d
        if best is not None:
            out.append(best)
    return out


def _zscore(values: np.ndarray, mask: np.ndarray) -> np.ndarray:
    v = values[mask]
    if len(v) < 3:
        return np.zeros_like(values)
    return (values - float(np.mean(v))) / (float(np.std(v)) + 1e-6)


def _overlap(a: dict, b: dict, min_sec: float = 0.5) -> bool:
    return min(a["t1"], b["t1"]) - max(a["t0"], b["t0"]) >= min_sec


class AppearanceModel:
    """Logistic regression on per-detection appearance vectors, trained per match."""

    def __init__(self, feats: dict[int, np.ndarray], cols: slice = slice(0, 80), C: float = 0.01) -> None:
        # Colour-signature columns generalise across distance far better than the CNN embedding
        # (measured on held-out far-away sightings), so they are used by default.
        self.feats = {k: v[:, cols] for k, v in feats.items()}
        self.C = C
        self.clf = None
        self.mu = self.sd = None

    def fit(self, pos: list[int], neg: list[int]) -> bool:
        def sample(F: np.ndarray, k: int = 40) -> np.ndarray:
            return F if len(F) <= k else F[np.linspace(0, len(F) - 1, k).round().astype(int)]

        Xp = [sample(self.feats[t], 80) for t in pos if len(self.feats.get(t, ())) > 0]
        Xn = [sample(self.feats[t]) for t in neg if len(self.feats.get(t, ())) > 0]
        if not Xp or not Xn:
            return False
        Xp, Xn = np.vstack(Xp), np.vstack(Xn)
        if len(Xp) < 25 or len(Xn) < 25:
            return False
        from sklearn.linear_model import LogisticRegression  # noqa: PLC0415

        X = np.vstack([Xp, Xn])
        y = np.r_[np.ones(len(Xp)), np.zeros(len(Xn))]
        self.mu, self.sd = X.mean(0), X.std(0) + 1e-6
        self.clf = LogisticRegression(C=self.C, class_weight="balanced", max_iter=3000)
        self.clf.fit((X - self.mu) / self.sd, y)
        return True

    def score(self, tid: int) -> float | None:
        F = self.feats.get(tid)
        if self.clf is None or F is None or len(F) == 0:
            return None
        d = self.clf.decision_function((F - self.mu) / self.sd)
        return float(np.clip(np.median(d), -6, 6))


def resolve_identity(summary: list[dict], reads: dict[int, list], target: Target, fps: float,
                     rows: np.ndarray, by_tid: dict, feats: dict[int, np.ndarray] | None = None,
                     iterations: int = 4, kit_min: float = 0.22, n_questions: int = QUESTION_BATCH,
                     row_kit: np.ndarray | None = None) -> IdentityResult:
    n = len(summary)
    kit = np.array([s["kit1"] + 0.5 * s["kit2"] for s in summary])
    nlen = np.array([s["n"] for s in summary])
    dur = nlen / fps
    t0 = np.array([s["t0"] for s in summary])
    t1 = np.array([s["t1"] for s in summary])
    seg = np.array([s["segment"] for s in summary])
    ps = np.array([s["p_start"] for s in summary])
    pe = np.array([s["p_end"] for s in summary])
    hmed = np.array([s["h_med"] for s in summary])

    votes = [number_votes(reads.get(s["tid"], []), target.number) for s in summary]
    tw = np.array([v[0] for v in votes])
    ow = np.array([v[1] for v in votes])
    nt = np.array([v[2] for v in votes])
    no = np.array([v[3] for v in votes])
    excluded: dict[int, str] = {}
    for k in range(n):
        if no[k] >= 2 and ow[k] > 1.5 * tw[k] + 0.5:
            excluded[k] = f"shows #{votes[k][4]}"
        elif no[k] == 1 and nt[k] == 0 and ow[k] >= 0.97:
            excluded[k] = f"shows #{votes[k][4]}"
    anchor_ix = set(locate(summary, rows, by_tid, target.anchors))
    for k in locate(summary, rows, by_tid, target.rejects):
        excluded[k] = "you said not me"
    anchor_ix -= set(excluded)
    cand_mask = (kit >= kit_min) & (nlen >= 3)
    cand_mask[list(anchor_ix)] = True
    for k in excluded:
        cand_mask[k] = False
    cands = np.where(cand_mask)[0]
    number_pos = {int(k) for k in cands if nt[k] >= 1 and tw[k] > ow[k]}
    seeds = sorted(anchor_ix | number_pos)

    model = AppearanceModel(feats or {})
    sig = np.stack([s["sig"] for s in summary])
    emb_ok = np.array([s["emb"] is not None for s in summary])
    emb_dim = next((len(s["emb"]) for s in summary if s["emb"] is not None), 1)
    emb = np.stack([s["emb"] if s["emb"] is not None else np.zeros(emb_dim, np.float32) for s in summary])
    rel = np.clip(hmed / 60.0, 0.35, 1.0) * np.clip(nlen / 10.0, 0.3, 1.0)

    positives = set(seeds)
    history, chosen = [], []
    unary = np.full(n, -np.inf)
    app = np.zeros(n)
    for it in range(iterations):
        negs = set(excluded) | {int(k) for k in cands if k not in positives and nlen[k] >= 5 and
                                any(_overlap(summary[k], summary[p]) for p in positives)}
        trained = bool(feats) and model.fit([summary[k]["tid"] for k in positives], [summary[k]["tid"] for k in negs])
        if trained:
            raw = np.full(n, np.nan)
            for k in cands:
                sc = model.score(summary[k]["tid"])
                if sc is not None:
                    raw[k] = sc
            # Raw logits don't transfer across distance/lighting: rank-normalise among candidates.
            ref = cand_mask & (nlen >= 10) & ~np.isnan(raw)
            z = _zscore(np.nan_to_num(raw, nan=np.nanmedian(raw[ref]) if ref.any() else 0.0), ref)
            app = 1.2 * z - 0.3
            for k in positives:
                app[k] = max(app[k], 3.0)
            mode = "classifier"
        else:
            w = np.zeros(n)
            pl = sorted(positives) if positives else list(cands[np.argsort(-kit[cands] * dur[cands])[:5]])
            w[pl] = np.maximum(dur[pl], 0.5)
            t_sig = (sig * w[:, None]).sum(0)
            t_sig /= max(np.linalg.norm(t_sig), 1e-9)
            we = w * emb_ok
            s_emb = np.zeros(n)
            if we.sum() > 0:
                t_emb = (emb * we[:, None]).sum(0)
                s_emb = emb @ (t_emb / max(np.linalg.norm(t_emb), 1e-9))
            z = 0.6 * _zscore(sig @ t_sig, cand_mask & (nlen >= 5)) + 0.4 * _zscore(s_emb, cand_mask & emb_ok & (nlen >= 5))
            app = 1.2 * z - 0.3
            mode = "template"
        unary = dur * (app * rel - PRIOR_LOGODDS) + 12.0 * nt
        for k in anchor_ix:
            unary[k] += 60.0
        unary[~cand_mask] = -np.inf
        chosen = _best_chain(cands, unary, t0, t1, seg, ps, pe, fps, dur)
        # Self-training: only very confident, reasonably sized chain members become positives.
        conf_ = sorted((app[k] * rel[k], k) for k in chosen
                       if k not in positives and app[k] * rel[k] > 2.2 and dur[k] >= 3.0 and hmed[k] >= 50)
        new_pos = {k for _, k in conf_[-10:]} | (positives - set(seeds))
        history.append({"iteration": it, "mode": mode, "chosen": len(chosen),
                        "seconds": round(float(dur[chosen].sum()), 1) if chosen else 0.0,
                        "positives": len(positives), "negatives": len(negs)})
        if new_pos <= positives and it > 0:
            break
        positives = set(seeds) | new_pos

    evidence, confidence = {}, {}
    for k in chosen:
        if k in anchor_ix:
            evidence[k] = "anchor"
        elif k in number_pos:
            evidence[k] = "number"
        elif app[k] * rel[k] > PRIOR_LOGODDS:
            evidence[k] = "appearance"
        else:
            evidence[k] = "continuity"
        if evidence[k] in ("anchor", "number"):
            confidence[k] = 0.99
        else:
            confidence[k] = float(1 / (1 + np.exp(-(app[k] * rel[k] - PRIOR_LOGODDS + 1.0))))
    contrary = {int(k) for k in cands
                if any(incompatible_with_target(num, target.number) for _, num, _, _ in reads.get(summary[k]["tid"], []))}
    already_asked = set(locate(summary, rows, by_tid, target.asked)) if target.asked else set()
    questions = _questions(summary, rows, by_tid, chosen, cands, app, rel, dur, evidence,
                           anchor_ix | already_asked, number_pos, n_questions, row_kit, contrary, fps)
    score = {int(k): float(1 / (1 + np.exp(-(app[k] * rel[k] - PRIOR_LOGODDS)))) for k in cands}
    appearance_score = dict(score)
    for k in anchor_ix | number_pos:
        score[int(k)] = 1.0
    ev_times: dict[int, list[float]] = {}
    for k in number_pos:
        tid = summary[k]["tid"]
        ix = by_tid[tid]
        fr_t = {int(rows[r, 0]): float(rows[r, 1]) for r in ix}
        ev_times[int(k)] = [fr_t[f] for f, num, _, _ in reads.get(tid, []) if num == target.number and f in fr_t]
    for (t, _, _), k in zip(target.anchors, locate(summary, rows, by_tid, target.anchors)):
        ev_times.setdefault(int(k), []).append(float(t))
    conflicts: dict[int, list[float]] = {}
    for k in chosen:
        tid = summary[k]["tid"]
        ix = by_tid[tid]
        fr_t = {int(rows[r, 0]): float(rows[r, 1]) for r in ix}
        ct = [fr_t[f] for f, num, _, _ in reads.get(tid, []) if f in fr_t and incompatible_with_target(num, target.number)]
        if ct:
            conflicts[int(k)] = sorted(ct)
    return IdentityResult(chosen, unary, evidence, confidence, seeds, list(map(int, cands)), history,
                          questions, {int(k): v for k, v in excluded.items()}, score,
                          {int(k) for k in (anchor_ix | number_pos)}, ev_times, appearance_score, conflicts)


def _appearance_clusters(summary, ks: list[int], n_clusters: int = 10) -> dict[int, int]:
    """Coarse look-alike groups over candidate tracklets (shirt/shorts/socks colour signature)."""
    if len(ks) <= n_clusters:
        return {k: i for i, k in enumerate(ks)}
    X = np.stack([summary[k]["sig"] for k in ks]).astype(np.float32)
    _, labels, _ = cv2.kmeans(X, n_clusters, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 50, 1e-3),
                              3, cv2.KMEANS_PP_CENTERS)
    return {k: int(lab) for k, lab in zip(ks, labels.ravel())}


def _questions(summary, rows, by_tid, chosen, cands, app, rel, dur, evidence, anchors, numbered, k_max,
               row_kit=None, contrary=frozenset(), fps: float = 10.0):
    """Active review selection. Value of asking about a tracklet =
        affected seconds x uncertainty (how close the score is to 0.5) x crop quality,
    plus a bonus when it is currently attributed to the target (a wrong claim costs more than a
    missed one). Diversity: at most one question per look-alike cluster and per 8 s window, so one
    batch never asks the same ambiguity twice. Tiny players (< 90 px) are never asked about."""
    chosen_set = set(chosen)
    resolve = QUESTION_STRATEGY == "resolve"
    chain_frames = np.zeros(int(rows[:, 0].max()) + 2 if len(rows) else 1, bool)
    for k in chosen:
        chain_frames[rows[by_tid[summary[k]["tid"]], 0].astype(int)] = True
    items = []
    for k in cands:
        if k in anchors or k in numbered or dur[k] < 2.0 or summary[k]["h_max"] < MIN_QUESTION_BOX_PX:
            continue
        if resolve and k in contrary:
            continue  # a full other-number read already settled it
        p = 1 / (1 + np.exp(-(app[k] * rel[k] - PRIOR_LOGODDS + (1.0 if k in chosen_set else 0.0))))
        if not (k in chosen_set or p > 0.15):
            continue
        quality = float(np.clip(summary[k]["h_max"] / 200.0, 0.4, 1.0))
        affected = min(float(dur[k]), 60.0)
        if resolve and k not in chosen_set:
            raw_p = 1 / (1 + np.exp(-(app[k] * rel[k] - PRIOR_LOGODDS)))
            if raw_p >= COMPETITOR_SCORE:
                # In view while the target is claimed: "not me" clears this ambiguity entirely.
                overlap = float(chain_frames[rows[by_tid[summary[k]["tid"]], 0].astype(int)].sum()) / max(fps, 1e-9)
                affected = min(affected + overlap, 120.0)
        value = affected * (1 - abs(2 * p - 1)) * quality * (1.5 if k in chosen_set else 1.0)
        items.append((value, int(k), p))
    items.sort(reverse=True)
    clusters = _appearance_clusters(summary, [k for _, k, _ in items[:80]])
    picked, used_t, used_c = [], [], set()
    for value, k, p in items[:80]:
        mid = 0.5 * (summary[k]["t0"] + summary[k]["t1"])
        c = clusters.get(k, -1)
        if any(abs(mid - u) < 8.0 for u in used_t) or c in used_c:
            continue
        used_t.append(mid)
        used_c.add(c)
        picked.append((value, k, p))
        if len(picked) >= min(k_max, QUESTION_BATCH):
            break
    out = []
    for value, k, p in picked:
        s = summary[k]
        ix = by_tid[s["tid"]]
        hs = rows[ix, 6] - rows[ix, 4]
        # Show the clearest moment: big, clearly target-coloured, not an outlier merge of two people.
        quality = np.minimum(hs, np.percentile(hs, 80)) * (0.2 + (row_kit[ix] if row_kit is not None else 1.0)) * rows[ix, 7]
        r = rows[ix[int(np.argmax(quality))]]
        out.append({"tid": s["tid"], "t": float(r[1]), "box": [float(v) for v in r[3:7]],
                    "from": s["t0"], "to": s["t1"], "currentlyTarget": k in chosen_set,
                    "score": round(float(p), 2), "scoreKind": "uncalibrated",
                    "affectedSec": round(float(dur[k]), 1), "value": round(float(value), 2),
                    "options": ["yes", "not_me", "unsure", "skip"]})
    return out


def _transition(j: int, i: int, t0, t1, seg, ps, pe, fps, dur=None) -> float:
    gap = t0[i] - t1[j]
    if gap < -1.5 / fps:
        return -np.inf
    gap = max(gap, 0.0)
    if seg[i] != seg[j]:
        return 0.0
    h = max(0.5 * (pe[j][2] + ps[i][2]), 1.0)
    d = float(np.hypot(ps[i][0] - pe[j][0], ps[i][1] - pe[j][1])) / h
    if d > SLACK_BH + MAX_SPEED_BH * gap:
        return -np.inf if gap < 6.0 else -2.0
    if gap <= 0.5 and d <= 0.75 and dur is not None:
        # Clean hand-off (tracker fragmentation): cancels the "probably someone else" prior for
        # the continuation, so it is kept unless its appearance clearly disagrees.
        return 3.0 + (PRIOR_LOGODDS + 0.3) * min(float(dur[i]), 15.0)
    if gap <= 2.0:
        return 3.0 * float(np.exp(-d / 1.5))
    return 0.0


def _best_chain(cands: np.ndarray, unary: np.ndarray, t0, t1, seg, ps, pe, fps, dur=None) -> list[int]:
    """Best-scoring chain of non-overlapping tracklets (one person can't be in two places)."""
    if len(cands) == 0:
        return []
    order = cands[np.argsort(t1[cands])]
    dp, back = {}, {}
    ends = t1[order]
    prefix_best: list[int] = []
    for pos, i in enumerate(order):
        best, arg = 0.0, None
        lo = np.searchsorted(ends, t0[i] - 120.0)
        hi = np.searchsorted(ends, t0[i] + 1.5 / fps, side="right")
        for j in order[lo:min(hi, pos)]:
            tr = _transition(j, i, t0, t1, seg, ps, pe, fps, dur)
            if tr == -np.inf:
                continue
            v = dp[j] + tr
            if v > best:
                best, arg = v, j
        if lo > 0:
            jbest = prefix_best[min(lo, pos) - 1]
            if dp[jbest] > best:
                best, arg = dp[jbest], jbest
        dp[i] = unary[i] + best
        back[i] = arg
        prefix_best.append(i if not prefix_best or dp[i] > dp[prefix_best[-1]] else prefix_best[-1])
    end = max(order, key=lambda i: dp[i])
    chain = []
    while end is not None:
        chain.append(int(end))
        end = back[end]
    return chain[::-1]

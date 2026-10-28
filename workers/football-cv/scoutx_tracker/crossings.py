"""5.1 tracklet-first identity: visual continuity is not identity.

The online tracker keeps two players of different teams apart by shirt colour, but two
team-mates look alike to it. When their boxes overlap (a crossing, a duel for the ball, one
running behind the other) it may continue a track on the wrong person. On IMG_4809 this put the
target's track (number "20" read at 31:42) on a team-mate at 31:43.6, and the rest of that track
was shown as "likely #20".

Here every track is cut where it touches a team-mate, into
  pre  - the part before the contact,
  contact - the overlapping frames (who is who is unknown there),
  post - the part after the contact.
For every contact event the pre and post pieces of all participants are matched by appearance
(head / shorts / socks colour and grid descriptor - the shirt is the same for team-mates) with an
assignment over the event; a link is "clear" only when the best assignment beats the second best by
a margin. Identity resolution may follow clear links; an unclear link never carries identity.
Nothing here is a persistent identity: descriptors are computed per match, in memory.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

CONTACT_COVER = 0.5      # share of the smaller box covered by a team-mate's box
MATE_KIT = 0.3           # kit score that makes the other box a team-mate (same as stats.SAME_KIT_SCORE)
JOIN_FRAMES = 3          # contact runs closer than this are one contact
DESC_WINDOW_SEC = 2.5    # appearance before / after the contact
MIN_DESC_ROWS = 3
# Decision rule, measured on 49 developer-labelled pieces in 27 random contact events (IMG_4809):
# the tracker kept the right person in 49/49; the appearance assignment agreed with it in 46/49 and
# the 3 disagreements were appearance errors with margins <= 0.051. So the tracker's continuation
# is the prior: kept when appearance agrees, unclear when appearance disagrees by less than
# SWAP_MARGIN, a swap only above it (1 such contact in the whole match - not validated on labels).
SWAP_MARGIN = 0.20
# The labelled sample only had pieces >= 90 px. Below that, colour is less reliable: on IMG_4809 a
# tracker swap between two ~75 px team-mates at 19:51 was "confirmed" by appearance with margin
# 0.081. For small players the tracker's continuation needs this margin too.
SMALL_PX = 90.0
SAME_MARGIN_SMALL = 0.10
CLEAR_MARGIN = 0.12      # pieces without a tracker continuation (track started/ended at the contact)
REGION_WEIGHTS = (1.0, 0.25, 1.0, 1.0)  # head, shirt, shorts, socks: the shirt does not separate team-mates
# 5.2 box steals. A tracker can also switch people WITHOUT an overlap in the same frame: the other
# team-mate's track is lost for a frame or two (occluded, missed detection) and this track's box
# jumps onto him. Held-out IMG_4809 17:53 (1073.3 s): track 2250 went from one player (h 113 px)
# to the player whose track 2212 had just ended (h 141 px); the owner's "yes" was given on the
# second player and 5.1 carried it back ~9 s onto the first. A steal: this track's new box matches
# the motion-extrapolated box of a same-kit track that ended within STEAL_LOOK frames (IoU >=
# STEAL_IOU) clearly better than its own previous box (by STEAL_LEAD). The track is cut there and
# the pieces are linked like a contact: identity follows only when appearance decides it.
STEAL_SPLIT = __import__("os").environ.get("SCOUTX_STEAL_SPLIT", "1") != "0"
STEAL_LOOK = 3
STEAL_IOU = 0.4
STEAL_LEAD = 0.15
STEAL_SAME_MARGIN = float(__import__("os").environ.get("SCOUTX_STEAL_SAME_MARGIN", "0.0"))


@dataclass
class Link:
    pre: int                 # tid of the piece before the contact
    post: int                # tid of the piece after the contact
    t: float                 # contact end (s)
    clear: bool              # identity may follow this link
    margin: float            # best vs second-best assignment cost
    cost: float              # appearance distance pre -> post
    decision: str = "same"   # same (tracker kept, appearance agrees) | swap | new (no tracker continuation) | unclear


@dataclass
class ContactSplit:
    rows: np.ndarray                                  # (R, 9) with new tids
    contact_tids: set = field(default_factory=set)    # pieces that ARE the overlapping frames
    links: list = field(default_factory=list)         # Link per pre piece of an event
    events: int = 0
    origin: dict = field(default_factory=dict)        # piece tid -> original tracker tid
    contact_pre: dict = field(default_factory=dict)   # contact piece tid -> the piece before it (same track)
    steals: int = 0                                   # 5.2 box-steal cuts


def contact_rows(R: np.ndarray, row_kit: np.ndarray, cover: float = CONTACT_COVER,
                 mate: float = MATE_KIT) -> tuple[np.ndarray, np.ndarray]:
    """Per row: is it heavily overlapped by a same-kit detection of ANOTHER track in the same frame,
    and which row is the partner (-1 if none). Vectorised per frame."""
    occ = np.zeros(len(R), bool)
    partner = np.full(len(R), -1, np.int64)
    if len(R) == 0:
        return occ, partner
    order = np.argsort(R[:, 0], kind="stable")
    frames = R[order, 0].astype(int)
    bounds = np.flatnonzero(np.diff(frames)) + 1
    for grp in np.split(order, bounds):
        if len(grp) < 2:
            continue
        b = R[grp, 3:7]
        x1 = np.maximum(b[:, None, 0], b[None, :, 0])
        y1 = np.maximum(b[:, None, 1], b[None, :, 1])
        x2 = np.minimum(b[:, None, 2], b[None, :, 2])
        y2 = np.minimum(b[:, None, 3], b[None, :, 3])
        inter = np.clip(x2 - x1, 0, None) * np.clip(y2 - y1, 0, None)
        area = (b[:, 2] - b[:, 0]) * (b[:, 3] - b[:, 1])
        cov = inter / np.maximum(np.minimum(area[:, None], area[None, :]), 1e-9)
        np.fill_diagonal(cov, 0)
        ok = (cov >= cover) & (row_kit[grp] >= mate)[None, :] & (row_kit[grp] >= mate)[:, None]
        ok &= R[grp, 2][:, None] != R[grp, 2][None, :]
        hit = ok.any(1)
        occ[grp] = hit
        best = np.argmax(np.where(ok, cov, -1), 1)
        partner[grp[hit]] = grp[best[hit]]
    return occ, partner


def _iou_many(b: np.ndarray, B: np.ndarray) -> np.ndarray:
    x1 = np.maximum(b[0], B[:, 0])
    y1 = np.maximum(b[1], B[:, 1])
    x2 = np.minimum(b[2], B[:, 2])
    y2 = np.minimum(b[3], B[:, 3])
    i = np.clip(x2 - x1, 0, None) * np.clip(y2 - y1, 0, None)
    u = (b[2] - b[0]) * (b[3] - b[1]) + (B[:, 2] - B[:, 0]) * (B[:, 3] - B[:, 1]) - i
    return np.where(u > 0, i / np.maximum(u, 1e-9), 0.0)


def steal_rows(R: np.ndarray, row_kit: np.ndarray, skip: np.ndarray | None = None, mate: float = MATE_KIT,
               look: int = STEAL_LOOK, min_iou: float = STEAL_IOU, lead: float = STEAL_LEAD) -> list[tuple[int, int]]:
    """(row b, row q): the track of b jumps at b onto the box of the same-kit track of q, whose track
    has no row from q's frame up to b's frame (lost) and q is at most `look` frames before b (q's box
    extrapolated with its own last motion). `skip`: rows never treated as steals (contact frames -
    handled as contacts). Only rows where a track pauses or ends can be q, so the search runs from
    those (~ms per thousand rows)."""
    if len(R) == 0:
        return []
    fr = R[:, 0].astype(int)
    tid = R[:, 2].astype(int)
    order = np.lexsort((fr, tid))
    cont = tid[order[:-1]] == tid[order[1:]]
    nxt = np.full(len(R), np.iinfo(np.int64).max, np.int64)   # next frame of the same track
    nxt[order[:-1][cont]] = fr[order[1:][cont]]
    prv = np.full(len(R), -1, np.int64)                        # previous row of the same track (within `look`)
    near = cont & (fr[order[1:]] - fr[order[:-1]] <= look)
    prv[order[1:][near]] = order[:-1][near]
    by_frame = np.argsort(fr, kind="stable")
    fs = fr[by_frame]
    ok_b = (prv >= 0) & (row_kit >= mate)
    if skip is not None:
        ok_b &= ~skip
        ok_b[prv >= 0] &= ~skip[prv[prv >= 0]]
    best_v = np.zeros(len(R))
    best_q = np.full(len(R), -1, np.int64)
    for q in np.flatnonzero((row_kit >= mate) & (nxt - fr >= 2)):
        pq = prv[q]
        step = (R[q, 3:7] - R[pq, 3:7]) / (fr[q] - fr[pq]) if pq >= 0 and fr[q] > fr[pq] else 0.0
        for d in range(1, look + 1):
            f = fr[q] + d
            if nxt[q] <= f:
                break
            lo, hi = np.searchsorted(fs, f), np.searchsorted(fs, f, side="right")
            cand = by_frame[lo:hi]
            cand = cand[ok_b[cand] & (tid[cand] != tid[q])]
            if not len(cand):
                continue
            v = _iou_many(R[q, 3:7] + step * d, R[cand, 3:7])
            upd = v > best_v[cand]
            best_v[cand[upd]] = v[upd]
            best_q[cand[upd]] = q
    out = []
    for b in np.flatnonzero(best_v >= min_iou):
        own = float(_iou_many(R[b, 3:7], R[prv[b], 3:7][None])[0])
        if own < 1.0 - lead and best_v[b] > own + lead:
            out.append((int(b), int(best_q[b])))
    return out


def _runs(mask: np.ndarray, join: int) -> list[tuple[int, int]]:
    """[a, b) index runs of True, joining runs separated by fewer than `join` False entries."""
    idx = np.flatnonzero(mask)
    if len(idx) == 0:
        return []
    out = [[int(idx[0]), int(idx[0]) + 1]]
    for i in idx[1:]:
        if i - out[-1][1] < join:
            out[-1][1] = int(i) + 1
        else:
            out.append([int(i), int(i) + 1])
    return [tuple(r) for r in out]


def descriptor(sigs: np.ndarray, embs: np.ndarray | None) -> tuple[np.ndarray, np.ndarray | None] | None:
    """Match-scoped appearance of a set of detections: (region-weighted colour signature, mean grid
    colour descriptor or None). Both L2-normalised."""
    if len(sigs) == 0:
        return None
    s = np.asarray(sigs, np.float32).mean(0)
    nb = len(s) // 4
    parts = []
    for k, w in enumerate(REGION_WEIGHTS):
        p = s[k * nb:(k + 1) * nb]
        parts.append(w * p / max(float(np.linalg.norm(p)), 1e-9))
    v = np.concatenate(parts)
    v /= max(float(np.linalg.norm(v)), 1e-9)
    e = None
    if embs is not None and len(embs):
        e = np.asarray(embs, np.float32).mean(0)
        e /= max(float(np.linalg.norm(e)), 1e-9)
    return v, e


EMB_WEIGHT = 0.3  # share of the grid descriptor in the distance when both sides have one


def distance(a, b) -> float:
    """Appearance distance in [0, 2] between two `descriptor` results."""
    d = 1.0 - float(a[0] @ b[0])
    if a[1] is not None and b[1] is not None:
        d = (1 - EMB_WEIGHT) * d + EMB_WEIGHT * (1.0 - float(a[1] @ b[1]))
    return d


def split_at_contacts(R: np.ndarray, row_kit: np.ndarray, sigs: np.ndarray, times: np.ndarray, fps: float,
                      emb_of: dict | None = None, embs: np.ndarray | None = None,
                      segment: np.ndarray | None = None) -> ContactSplit:
    """Cut every track at same-kit contacts and link pre -> post pieces per contact event."""
    R = R.copy()
    occ, partner = contact_rows(R, row_kit)
    # box steals are found on the tracker's own tracks (before any cut: a piece ending at a contact
    # is not a lost track); contact frames are contacts, not steals
    stolen = steal_rows(R, row_kit, skip=occ) if STEAL_SPLIT else []
    next_id = int(R[:, 2].max()) + 1 if len(R) else 1
    out = ContactSplit(R)
    order = np.lexsort((R[:, 0], R[:, 2]))
    tids, first = np.unique(R[order, 2], return_index=True)
    bounds = list(first) + [len(order)]
    # contact pieces per original track, with their pre/post neighbours
    contacts: list[dict] = []
    for k, tid in enumerate(tids):
        ix = order[bounds[k]:bounds[k + 1]]
        out.origin[int(tid)] = int(tid)
        runs = _runs(occ[ix], JOIN_FRAMES)
        if not runs:
            continue
        cuts = sorted({c for a, b in runs for c in (a, b) if 0 < c < len(ix)})
        pieces = np.split(np.arange(len(ix)), cuts)
        piece_tid = []
        for j, p in enumerate(pieces):
            new = int(tid) if j == 0 else next_id
            if j:
                next_id += 1
            R[ix[p], 2] = new
            out.origin[new] = int(tid)
            piece_tid.append((int(p[0]), int(p[-1]) + 1, new))
        for a, b in runs:
            c = next(pt for s0, s1, pt in piece_tid if s0 == a)
            pre = next((pt for s0, s1, pt in piece_tid if s1 == a), None)
            post = next((pt for s0, s1, pt in piece_tid if s0 == b), None)
            out.contact_tids.add(c)
            if pre is not None:
                out.contact_pre[c] = pre
            contacts.append({"contact": c, "pre": pre, "post": post, "rows": ix[a:b],
                             "t0": float(R[ix[a], 1]), "t1": float(R[ix[b - 1], 1])})
    steals = []
    if STEAL_SPLIT:
        for b, q in sorted(stolen, key=lambda x: (R[x[0], 2], R[x[0], 0])):
            old = int(R[b, 2])
            ix = np.flatnonzero(R[:, 2] == old)
            ix = ix[R[ix, 0] >= R[b, 0]]
            R[ix, 2] = next_id
            out.origin[next_id] = out.origin.get(old, old)
            for c in contacts:  # the later part of the piece is now the 'pre' of its next contact
                if c["pre"] == old and c["t0"] >= R[b, 1]:
                    c["pre"] = next_id
                    out.contact_pre[c["contact"]] = next_id
            steals.append({"pre": old, "post": next_id, "q": int(q), "t": float(R[b, 1])})
            next_id += 1
        for st in steals:  # the other track's piece as it is after all cuts
            st["other"] = int(R[st["q"], 2])
    out.steals = len(steals)
    out.rows = R
    # partner rows were labelled with the partner's ORIGINAL tid before splitting: map to pieces
    by_contact = {c["contact"]: c for c in contacts}
    piece_of_row = R[:, 2].astype(int)
    for c in contacts:
        prt = {int(piece_of_row[partner[r]]) for r in c["rows"] if partner[r] >= 0}
        c["partners"] = {p for p in prt if p in by_contact}
    # events: connected components of contacts through partnership
    seen: set[int] = set()
    order2 = np.lexsort((R[:, 0], R[:, 2]))
    tid_rows: dict[int, np.ndarray] = {}
    tt, ff = np.unique(R[order2, 2], return_index=True)
    bb = list(ff) + [len(order2)]
    for k, t_ in enumerate(tt):
        tid_rows[int(t_)] = order2[bb[k]:bb[k + 1]]
    win = int(round(DESC_WINDOW_SEC * fps))

    def height(tid: int | None, side: str) -> float:
        if tid is None or tid not in tid_rows:
            return 0.0
        ix = tid_rows[tid]
        ix = ix[-win:] if side == "pre" else ix[:win]
        return float(np.median(R[ix, 6] - R[ix, 4])) if len(ix) else 0.0

    def desc(tid: int | None, side: str) -> np.ndarray | None:
        if tid is None or tid not in tid_rows:
            return None
        ix = tid_rows[tid]
        ix = ix[-win:] if side == "pre" else ix[:win]
        ix = ix[~occ[ix]]
        if len(ix) < MIN_DESC_ROWS:
            return None
        di = R[ix, 8].astype(int)
        e = None
        if emb_of is not None and embs is not None:
            er = [emb_of[d] for d in di if d in emb_of]
            e = embs[er] if er else None
        return descriptor(sigs[di], e)

    for c in contacts:
        if c["contact"] in seen:
            continue
        comp, stack = [], [c["contact"]]
        while stack:
            x = stack.pop()
            if x in seen:
                continue
            seen.add(x)
            comp.append(by_contact[x])
            stack.extend(p for p in by_contact[x]["partners"] if p not in seen)
        out.events += 1
        pres = [(e["pre"], desc(e["pre"], "pre")) for e in comp]
        posts = [(e["post"], desc(e["post"], "post")) for e in comp]
        pres = [(p, d) for p, d in pres if d is not None]
        posts = [(p, d) for p, d in posts if d is not None]
        if not pres or not posts:
            continue
        cost = np.array([[distance(dp, dq) for _, dq in posts] for _, dp in pres])
        succ = {e["pre"]: e["post"] for e in comp if e["pre"] is not None}
        small = min([height(p, "pre") for p, _ in pres] + [height(p, "post") for p, _ in posts]) < SMALL_PX
        _link_event(out, pres, posts, cost, max(e["t1"] for e in comp), succ, small)
    for st in steals:
        _link_steal(out, st, desc(st["pre"], "pre"), desc(st["other"], "pre"), desc(st["post"], "post"))
    return out


def _link_steal(out: ContactSplit, st: dict, d_own, d_other, d_post) -> None:
    """Link the pieces around a box steal. The tracker continued `pre` with `post`, but its box jumped
    onto where `other` was: post is `other`'s person when appearance says so by SWAP_MARGIN (a swap
    link other -> post), `pre`'s when appearance prefers it (by more than STEAL_SAME_MARGIN), otherwise
    unclear (identity does not cross the jump). Without a usable `other` appearance, `pre` is followed
    only on a close match (CLEAR_MARGIN), as for a contact piece without a competitor."""
    t = round(st["t"], 2)
    if d_post is None or d_own is None:
        out.links.append(Link(pre=st["pre"], post=st["post"], t=t, clear=False, margin=0.0, cost=0.0, decision="unclear"))
        return
    c_own = distance(d_own, d_post)
    if d_other is None:
        # the other piece has no usable appearance (too short / all contact frames): the same rule as
        # a contact piece without a competitor - follow only a close appearance match (CLEAR_MARGIN)
        ok = c_own <= CLEAR_MARGIN
        out.links.append(Link(pre=st["pre"], post=st["post"], t=t, clear=ok, margin=0.0, cost=round(c_own, 3),
                              decision="same" if ok else "unclear"))
        return
    c_oth = distance(d_other, d_post)
    m = c_oth - c_own   # > 0: appearance prefers the tracker's own piece
    if -m >= SWAP_MARGIN:
        out.links.append(Link(pre=st["other"], post=st["post"], t=t, clear=True, margin=round(-m, 3), cost=round(c_oth, 3), decision="swap"))
        out.links.append(Link(pre=st["pre"], post=st["post"], t=t, clear=False, margin=round(-m, 3), cost=round(c_own, 3), decision="unclear"))
    elif m > STEAL_SAME_MARGIN:
        out.links.append(Link(pre=st["pre"], post=st["post"], t=t, clear=True, margin=round(m, 3), cost=round(c_own, 3), decision="same"))
    else:
        out.links.append(Link(pre=st["pre"], post=st["post"], t=t, clear=False, margin=round(m, 3), cost=round(c_own, 3), decision="unclear"))


def _link_event(out: ContactSplit, pres, posts, cost: np.ndarray, t_end: float, succ: dict | None = None,
                small: bool = False) -> None:
    """Optimal pre->post appearance assignment over the event, then the decision rule above.
    `succ`: pre piece -> the post piece the tracker itself continued it with."""
    from scipy.optimize import linear_sum_assignment  # noqa: PLC0415

    succ = succ or {}
    post_ids = [p for p, _ in posts]
    r, c = linear_sum_assignment(cost)
    base = float(cost[r, c].sum())
    for i, j in zip(r, c):
        alt = np.inf
        for j2 in range(cost.shape[1]):
            if j2 == j:
                continue
            forced = cost.copy()
            forced[i, :] = 1e6
            forced[i, j2] = cost[i, j2]
            rr, cc = linear_sum_assignment(forced)
            if forced[rr, cc].max() < 1e6:
                alt = min(alt, float(forced[rr, cc].sum()))
        margin = float(alt - base) if np.isfinite(alt) else None
        pre, post = int(pres[i][0]), int(posts[j][0])
        tracker_post = succ.get(pre)
        if tracker_post is not None and tracker_post in post_ids:
            if tracker_post == post and (not small or (margin is not None and margin >= SAME_MARGIN_SMALL)):
                decision = "same"
            elif tracker_post == post:
                decision = "unclear"
            elif margin is not None and margin >= SWAP_MARGIN:
                decision = "swap"
            else:
                decision, post = "unclear", tracker_post
        else:
            ok = (margin is not None and margin >= CLEAR_MARGIN) or (margin is None and cost[i, j] <= CLEAR_MARGIN)
            decision = "new" if ok else "unclear"
        jj = post_ids.index(post)
        out.links.append(Link(pre=pre, post=post, t=round(t_end, 2), clear=decision != "unclear",
                              margin=round(float(margin if margin is not None else 0.0), 3),
                              cost=round(float(cost[i, jj]), 3), decision=decision))

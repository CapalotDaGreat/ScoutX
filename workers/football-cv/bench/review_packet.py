"""Build a LOCAL annotation-review packet for an independent reviewer (5.3). Bench-only; images stay local.

    python bench/review_packet.py --video IMG_4809_proxy_10fps.exact.mp4 --items ITEMS.json --out PACKET_DIR

ITEMS.json lists review items (see bench/results/5.3/identity-review-packet-20261103/items.json):
  {"id", "kind": "label" | "box", "sourceFrames": [first, last], "step", "boxes": {frame: [x1,y1,x2,y2], ...}?, "question"}

* kind "label": frames with the ORIGINAL label boxes only, drawn as neutral numbered outlines ("L0", "L1" ...). No label
  values (T/N/?) and no predictions are shown, so the reviewer judges each box from the footage alone.
* kind "box": one neutral outline per frame, the box whose identity must be judged. These boxes come from runs, but
  no state, score or evidence type is shown. The reviewer is told only to name the person in the box.

Writes PACKET_DIR/<id>/*.jpg (context crop + enlarged box crop) and PACKET_DIR/answers.csv (one row per box to fill in:
"20", another number, "not 20 (no number)", or "unsure"). Nothing here is written to git.
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))


def main(argv=None) -> int:
    import cv2  # noqa: PLC0415

    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--video", required=True)
    ap.add_argument("--items", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args(argv)
    gt = json.loads((HERE / "results" / "5.1" / "gt_img4809_intervals.json").read_text())
    items = json.loads(Path(a.items).read_text())["items"]
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    cap = cv2.VideoCapture(a.video)
    rows = []
    v2 = json.loads(Path(a.items).read_text()).get("schema", "").endswith("v2")
    if v2:
        return _v2(cap, gt, items, out)
    for it in items:
        d = out / it["id"]
        d.mkdir(exist_ok=True)
        f0, f1 = it["sourceFrames"]
        frames = list(range(f0, f1 + 1, it.get("step", 1)))
        for f in frames:
            cap.set(cv2.CAP_PROP_POS_FRAMES, f)
            ok, im = cap.read()
            if not ok:
                continue
            if it["kind"] == "label":
                boxes = [lab["box"] for lab in gt["frames"].get(str(f), [])]
            else:
                b = it["boxes"].get(str(f))
                boxes = [b] if b else []
            ctx = im.copy()
            for j, b in enumerate(boxes):
                x1, y1, x2, y2 = (int(v) for v in b)
                cv2.rectangle(ctx, (x1, y1), (x2, y2), (255, 255, 255), 2)
                cv2.putText(ctx, f"L{j}" if it["kind"] == "label" else "B", (x1, max(0, y1 - 5)), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
                h = max(1, y2 - y1)
                crop = im[max(0, y1 - h // 4):min(im.shape[0], y2 + h // 8), max(0, x1 - h // 4):min(im.shape[1], x2 + h // 4)]
                if crop.size:
                    cv2.imwrite(str(d / f"{f}_{'L' if it['kind'] == 'label' else 'B'}{j}.jpg"),
                                cv2.resize(crop, (240, int(240 * crop.shape[0] / crop.shape[1]))))
                rows.append({"item": it["id"], "sourceFrame": f, "timeSec": round(f / 10, 1), "box": f"{'L' if it['kind'] == 'label' else 'B'}{j}",
                             "coords": [round(float(v), 1) for v in b], "answer": "", "legibleNumber": "", "notes": ""})
            cv2.imwrite(str(d / f"{f}_context.jpg"), ctx)
    with open(out / "answers.csv", "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    print(f"{len(rows)} boxes to review in {out}")
    return 0


RUBRIC = ("answer: target | other | uncertain  (target = the player wearing #20)",
          "legibleNumber: the shirt number if you can READ it in this frame, else empty",
          "uncertainty: none | occlusion | crowd/contact | small/blurred | identity continuity | other",
          "notes: what the decision rests on (legible number, continuity from a frame with a legible number, ...)")


def _v2(cap, gt, items, out: Path) -> int:
    """v2 items: neutral ids, boxes to judge, context frames without boxes. One answers.csv row per box."""
    import cv2  # noqa: PLC0415

    def frame(f):
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(f))
        ok, im = cap.read()
        return im if ok else None

    rows = []
    for it in items:
        d = out / it["id"]
        d.mkdir(exist_ok=True)
        targets = it["boxes"] if it["kind"] == "box" else it["frames"]
        for f, boxes in sorted(targets.items(), key=lambda kv: int(kv[0])):
            boxes = [boxes] if it["kind"] == "box" else boxes
            im = frame(f)
            if im is None:
                continue
            ctx = im.copy()
            for j, b in enumerate(boxes):
                x1, y1, x2, y2 = (int(v) for v in b)
                tag = f"B{j}" if it["kind"] == "box" else f"L{j}"
                cv2.rectangle(ctx, (x1, y1), (x2, y2), (255, 255, 255), 2)
                cv2.putText(ctx, tag, (x1, max(0, y1 - 5)), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
                h = max(1, y2 - y1)
                crop = im[max(0, y1 - h // 4):min(im.shape[0], y2 + h // 8), max(0, x1 - h // 4):min(im.shape[1], x2 + h // 4)]
                if crop.size:
                    cv2.imwrite(str(d / f"{f}_{tag}.jpg"), cv2.resize(crop, (240, int(240 * crop.shape[0] / crop.shape[1]))))
                rows.append({"item": it["id"], "sourceFrame": int(f), "timeSec": round(int(f) / 10, 1), "box": tag,
                             "coords": [round(float(v), 1) for v in b], "answer": "", "legibleNumber": "",
                             "uncertainty": "", "notes": ""})
            cv2.imwrite(str(d / f"{f}_context.jpg"), ctx)
        for f in it.get("contextFrames", []):
            im = frame(f)
            if im is not None:
                cv2.imwrite(str(d / f"ctx_{f}.jpg"), im)                    # surrounding footage, nothing drawn
    with open(out / "answers.csv", "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    (out / "RUBRIC.txt").write_text("\n".join(RUBRIC) + "\n")
    print(f"{len(rows)} boxes in {len(items)} items -> {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""E9: fine-tune docTR PARSeq (Apache-2.0) on synthetic jersey-number patches from bench/e9/synth.py.

Run it on the GPU session. On CPU it only proves the loop (`--max-steps 20`).

    python -m bench.e9.finetune --data data/e9_synth --out data/e9_run1 --epochs 3 --batch 256 --lr 1e-4

- Starts from the pretrained checkpoint the engine pins (`doctr/models/parseq-56125471.pt`, verified in
  model_hashes.json). With `--random-init` it starts from random weights, for CPU smoke tests only. The result is then
  marked `smokeOnly` and must never be evaluated as a candidate.
- Holds out 5 % of the synthetic patches (by crop index, so the patches of one crop never cross the split) and
  reports exact-match accuracy there. Synthetic accuracy is not evidence of real accuracy; only
  bench/e9/eval_crops.py on real labelled crops decides.
- Writes `parseq_e9.pt` (state dict) and `run.json` (SHA-256, data manifest, settings, losses). Use it in the engine
  with SCOUTX_PARSEQ_WEIGHTS=.../parseq_e9.pt and SCOUTX_PARSEQ_WEIGHTS_SHA256=<sha> (default off).
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import random
import time
from pathlib import Path

import cv2
import numpy as np


def load(data: Path) -> tuple[list[dict], list[dict]]:
    rows = [json.loads(line) for line in (data / "labels.jsonl").open()]
    crops = sorted({r["file"].split("/")[-1].split("_")[0] for r in rows})
    rnd = random.Random(0)
    val_crops = set(rnd.sample(crops, max(1, len(crops) // 20)))
    train = [r for r in rows if r["file"].split("/")[-1].split("_")[0] not in val_crops]
    val = [r for r in rows if r["file"].split("/")[-1].split("_")[0] in val_crops]
    return train, val


def batches(rows: list[dict], data: Path, size: int, shuffle: bool):
    idx = list(range(len(rows)))
    if shuffle:
        random.shuffle(idx)
    for i in range(0, len(idx), size):
        chunk = [rows[j] for j in idx[i: i + size]]
        imgs = [cv2.cvtColor(cv2.imread(str(data / r["file"])), cv2.COLOR_BGR2RGB) for r in chunk]
        yield imgs, [r["label"] for r in chunk]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--epochs", type=int, default=3)
    ap.add_argument("--batch", type=int, default=256)
    ap.add_argument("--lr", type=float, default=1e-4)
    ap.add_argument("--max-steps", type=int, default=0, help="stop after N steps (smoke tests)")
    ap.add_argument("--random-init", action="store_true", help="CPU smoke test without the pretrained weights")
    ap.add_argument("--seed", type=int, default=0)
    a = ap.parse_args()

    import torch  # noqa: PLC0415
    from doctr.models import recognition_predictor  # noqa: PLC0415

    random.seed(a.seed)
    np.random.seed(a.seed)
    torch.manual_seed(a.seed)
    data, out = Path(a.data), Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    pred = recognition_predictor("parseq", pretrained=not a.random_init)
    model, pre = pred.model, pred.pre_processor
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    model.to(dev)
    train, val = load(data)
    opt = torch.optim.AdamW(model.parameters(), lr=a.lr, weight_decay=1e-4)
    total = a.epochs * ((len(train) + a.batch - 1) // a.batch)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=a.lr, total_steps=max(1, a.max_steps or total), pct_start=0.1)
    losses, step, t0 = [], 0, time.time()

    def to_tensor(imgs):
        return torch.cat(list(pre(imgs)), 0).to(dev)

    def evaluate() -> float:
        model.eval()
        ok = n = 0
        with torch.inference_mode():
            for imgs, labels in batches(val, data, a.batch, False):
                preds = model(to_tensor(imgs), return_preds=True)["preds"]
                ok += sum(p[0] == t for p, t in zip(preds, labels))
                n += len(labels)
        model.train()
        return ok / max(n, 1)

    before = evaluate()
    model.train()
    done = False
    for epoch in range(a.epochs):
        for imgs, labels in batches(train, data, a.batch, True):
            loss = model(to_tensor(imgs), target=labels)["loss"]
            opt.zero_grad(set_to_none=True)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 5.0)
            opt.step()
            sched.step()
            losses.append(round(float(loss.detach()), 4))
            step += 1
            if step % 50 == 0:
                print(f"epoch {epoch} step {step} loss {np.mean(losses[-50:]):.4f}", flush=True)
            if a.max_steps and step >= a.max_steps:
                done = True
                break
        if done:
            break
    after = evaluate()
    model.eval()
    buf = io.BytesIO()
    torch.save(model.cpu().state_dict(), buf)
    (out / "parseq_e9.pt").write_bytes(buf.getvalue())
    sha = hashlib.sha256(buf.getvalue()).hexdigest()
    manifest = json.loads((data / "manifest.json").read_text()) if (data / "manifest.json").exists() else None
    run = {"weightsSha256": sha, "smokeOnly": bool(a.random_init or a.max_steps), "device": dev, "steps": step,
           "seconds": round(time.time() - t0, 1), "settings": vars(a), "trainPatches": len(train), "valPatches": len(val),
           "syntheticValExactMatch": {"before": round(before, 4), "after": round(after, 4)},
           "lossFirst50": losses[:50], "lossLast50": losses[-50:], "dataManifest": manifest}
    (out / "run.json").write_text(json.dumps(run, indent=1) + "\n")
    print(json.dumps({k: run[k] for k in ("weightsSha256", "smokeOnly", "steps", "seconds", "syntheticValExactMatch")}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

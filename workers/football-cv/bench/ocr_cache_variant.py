"""Build the OCR cache a reader VARIANT would have produced for the same crops (2026-11-14 experiment E2b).

    python bench/ocr_cache_variant.py --stage1 <work>/stage1 --base-cache cache_snapshot.json --variant combined --out <file>

For every crop the base cache holds (the crops the production resolve chose to read), the colour reader is run and
the variant's rule is applied to the cached production read: 'combined' keeps the production read, uses the colour
read when production abstained, and abstains when the two disagree. The resolve then runs with
SCOUTX_OCR_VARIANT=combined on this cache; crops it selects that are not in the cache are read by combined_read.
Writes a provenance sidecar <out>.provenance.json (input hashes, counts, timing).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

import cv2

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from scoutx_tracker.ocr import colour_agreement_read, shared_reader  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--stage1", required=True)
    ap.add_argument("--base-cache", required=True)
    ap.add_argument("--variant", choices=["combined"], default="combined")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    base_bytes = Path(a.base_cache).read_bytes()
    base = json.loads(base_bytes)
    reader = shared_reader()
    out, counts, t0 = {}, {"kept": 0, "added": 0, "conflictAbstained": 0, "unchangedAbstain": 0, "missingCrop": 0}, time.perf_counter()
    for i, (key, read) in enumerate(sorted(base.items())):
        img = cv2.imread(str(Path(a.stage1) / key))
        if img is None:
            out[key] = read
            counts["missingCrop"] += 1
            continue
        alt = colour_agreement_read(reader, img)
        if read[0] is not None and alt[0] is not None and alt[0] != read[0]:
            out[key] = [None, 0.0, None]
            counts["conflictAbstained"] += 1
        elif read[0] is not None:
            out[key] = read
            counts["kept"] += 1
        elif alt[0] is not None:
            out[key] = [alt[0], round(float(alt[1]), 6), alt[2]]
            counts["added"] += 1
        else:
            out[key] = read
            counts["unchangedAbstain"] += 1
        if i % 200 == 0:
            print(f"{i}/{len(base)} {counts}", flush=True)
    Path(a.out).write_text(json.dumps(out))
    prov = {"schema": "pitchproof.ocr-cache-variant.v1", "variant": a.variant, "baseCacheSha256": hashlib.sha256(base_bytes).hexdigest(),
            "entries": len(out), "counts": counts, "secondsTotal": round(time.perf_counter() - t0, 1),
            "readerDevices": reader.device_report, "outSha256": hashlib.sha256(Path(a.out).read_bytes()).hexdigest()}
    Path(a.out + ".provenance.json").write_text(json.dumps(prov, indent=1))
    print(json.dumps(prov, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Rebuild one full-match proxy from transferred chunks and prove it is the device's proxy.

Usage (workspace): python3 assemble.py STAGED_DIR OUT.mp4
Checks every chunk's SHA-256 against proxy_manifest.json, concatenates with stream copy (+faststart) and
requires the DECODED frames of the assembled file to equal the decoded frames of the verified chunks (frame MD5s,
same count as the device manifest). Packet bytes can legitimately differ: the muxer re-inserts each chunk's
SPS/PPS, so the container stream hash is recorded as the proxy identity here, not compared with the device.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from make_proxy import file_sha, stream_hash


def decoded_md5s(args: list[str]) -> list[str]:
    r = subprocess.run(["ffmpeg", "-v", "error", *args, "-map", "0:v:0", "-f", "framemd5", "-"], capture_output=True,
                       text=True, check=True)
    return [ln.rsplit(",", 1)[1].strip() for ln in r.stdout.splitlines() if ln and not ln.startswith("#")]


def main() -> None:
    staged, out = Path(sys.argv[1]), Path(sys.argv[2])
    man = json.loads((staged / "proxy_manifest.json").read_text())
    if man.get("problems"):
        raise SystemExit(f"device manifest lists problems: {man['problems']}")
    for c in man["chunks"]:
        got = file_sha(staged / c["file"])
        if got != c["sha256"]:
            raise SystemExit(f"{c['file']}: transferred SHA-256 {got} != device {c['sha256']}")
    lst = out.with_suffix(".concat.txt")
    lst.write_text("".join(f"file '{(staged / c['file']).as_posix()}'\n" for c in man["chunks"]))
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", str(lst), "-map", "0:v:0",
                    "-c", "copy", "-movflags", "+faststart", str(out)], check=True)
    a = decoded_md5s(["-f", "concat", "-safe", "0", "-i", str(lst)])
    b = decoded_md5s(["-i", str(out)])
    if len(b) != man["totalFrames"] or a != b:
        raise SystemExit(f"assembled decode differs: frames {len(b)} vs device {man['totalFrames']}, equal={a == b}")
    sh = stream_hash(["-i", str(out)])
    info = {"source": man["source"], "proxy": out.name, "sizeBytes": out.stat().st_size, "sha256": file_sha(out),
            "videoStreamSha256": sh, "decodedFramesVerified": len(b), "frames": man["totalFrames"], "sourceFirstVideoPts": man["sourceFirstVideoPts"],
            "timeMapping": man["timeMapping"], "chunks": [{k: c[k] for k in ("file", "sourceStart", "sourceEnd", "frames", "sha256")}
                                                           for c in man["chunks"]]}
    out.with_suffix(".json").write_text(json.dumps(info, indent=1))
    lst.unlink()
    print(json.dumps({k: info[k] for k in ("source", "sizeBytes", "frames", "videoStreamSha256")}))


if __name__ == "__main__":
    main()

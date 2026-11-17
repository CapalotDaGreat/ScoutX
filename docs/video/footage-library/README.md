# Footage library: inventory, proxies and frozen split (started 2026-11-17)

Briefs c490c61b and 7b64a65e. Originals stay on the owner's PC/iCloud. Footage, frames and review media are never committed.
Only the metadata committed here: `inventory-*.json` (no location tags, no raw metadata), `split.json` and `proxy-*.json`.

## Where things are
| What | Where |
|---|---|
| Originals | `C:\Users\masap\iCloudPhotos\Photos` (iCloud for Windows placeholders until downloaded) |
| Tools | `workers/football-cv/bench/footage/` (repo); copies under `C:\ZLI\M335\ScoutX\.local\footage-lib\tools\` |
| Full private manifest | `.local\footage-lib\manifest.jsonl`: raw tags and hashes; contains location tags, so it is never committed |
| Proxy chunks | `.local\footage-lib\proxies\<IMG>_60s\` |
| Assembled proxies, runs | workspace `/home/claude/work/footage/<IMG>/` |

## Safe download (hydration)
- In the PC Linux VM a cloud placeholder fails to open with `EINVAL`, and reading does **not** download it.
  `inventory.py` therefore scans the whole library without downloading anything.
- A file can be readable and still mid-download ("moov atom not found"). It is then recorded as `incomplete` and
  is never hashed.
- The assistant cannot download files itself: File Explorer and terminals are click-only for computer use, and
  the bridge refuses files over 400 MB.
- The owner runs `.local\footage-lib\hydrate.ps1` per batch. It pins exact files (`attrib +P -U`) and only does
  so if at least 120 GB stays free afterwards. It never evicts, deletes or moves anything.
- Eviction after verified proxies (`attrib -P +U`, iCloud's supported "free up space") stays an owner decision.

## Proxy (product-equivalent)
- Encoding per chunk: `ffmpeg -ss S -t L -i SRC -map 0:v:0 -an -map_metadata -1 -vf "fps=10,scale='min(1920,iw)':-2"
  -c:v libx264 -preset veryfast -crf 24 -g 20`. These are the `scoutx_tracker.cli.make_proxies` settings, with no
  colour conversion.
- Chunk length is 60 s rather than the product's 300 s: the PC VM stops work at the end of each 180-s call.
- Chunks are verified by SHA-256 after transfer and joined with stream copy into **one** full-match proxy.
  `assemble.py` requires the joined file's decoded frames to equal the chunks' decoded frames (frame MD5s and
  the frame count).
- The container stream hash of the joined file is recorded as the proxy identity. It is not compared with the
  device, because the muxer re-inserts each chunk's SPS/PPS.

## Split rule (frozen before any prediction)
See `bench/footage/split.py`.
- Already-exposed match → development.
- Otherwise by SHA-256(group id): validation (40 %) or held-out.
- Append-only. Later recordings of the same match join their group's partition.

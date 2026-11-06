# Local dry run of startup.sh: proves export, manifest and cleanup paths. CPU-only.
# Does not prove GPU behaviour. Requires Docker Desktop with a Linux engine.
$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..\..")
$Repo = Split-Path (Split-Path (Split-Path (Split-Path $PSScriptRoot)))
# $PSScriptRoot = .../bench/results/5.3/gpu-validation-20261106
$Cv = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")).Path
$Local = "C:\ZLI\M335\ScoutX\.local\gpu-session-20261106"
$Dry = Join-Path $Local "dry-run"
New-Item -ItemType Directory -Force -Path $Dry | Out-Null
$Tip = git -C $Cv\..\.. rev-parse HEAD
# Repo root is two levels above workers/football-cv
$RepoRoot = (Resolve-Path (Join-Path $Cv "..\..")).Path
$Tip = git -C $RepoRoot rev-parse HEAD
$PartA = Join-Path $Local "archives\part-a-51d41c9-workers-football-cv.tar"
$PartB = Get-ChildItem (Join-Path $Local "archives\part-b-*-workers-football-cv.tar") | Select-Object -First 1
$PartBSha = (Get-FileHash $PartB.FullName -Algorithm SHA256).Hash.ToLower()
$PartASha = (Get-FileHash $PartA -Algorithm SHA256).Hash.ToLower()
if ($PartASha -ne "308c07a4e209e7b1dbf344247ce9add9cd80f8366e37a7573e040251e795a62f") {
  throw "Part A archive SHA mismatch: $PartASha"
}

# Tiny clip via ffmpeg
$env:PATH = "$env:LOCALAPPDATA\Microsoft\WinGet\Links;" + $env:PATH
$tiny = Join-Path $Dry "tiny.mp4"
if (-not (Test-Path $tiny)) {
  ffmpeg -y -v error -f lavfi -i "testsrc=size=320x180:rate=10:duration=1" -pix_fmt yuv420p $tiny
}

$scriptHost = Join-Path $PSScriptRoot "startup.sh"
# Normalize to LF inside the container bind
docker rm -f pitchproof-gpu-dry 2>$null | Out-Null
$work = Join-Path $Dry "container"
New-Item -ItemType Directory -Force -Path "$work\videos","$work\out" | Out-Null
Copy-Item $PartA (Join-Path $work "part-a-source.tar") -Force
Copy-Item $PartB.FullName (Join-Path $work "part-b-source.tar") -Force
Copy-Item $tiny (Join-Path $work "videos\tiny.mp4") -Force
Copy-Item $scriptHost (Join-Path $work "startup.sh") -Force

$envArgs = @(
  "-e", "SCOUTX_DRY_RUN=1",
  "-e", "PART_B_COMMIT=$Tip",
  "-e", "PART_B_ARCHIVE_SHA=$PartBSha",
  "-e", "PART_A_ARCHIVE_SHA=$PartASha",
  "-e", "PART_A_COMMIT=51d41c9f5f333c7e93a606b7181ba8cb1cee8eac"
)

docker run --rm --name pitchproof-gpu-dry `
  @envArgs `
  -v "${work}:/data" `
  -v "${work}/out:/data/out" `
  ubuntu:24.04 `
  bash -lc "apt-get update -qq && apt-get install -y -qq python3 ca-certificates >/dev/null && sed -i 's/\r$//' /data/startup.sh && cp /data/part-a-source.tar /data/part-b-source.tar /tmp/ 2>/dev/null; ln -sf /data/part-a-source.tar /data/part-a-source.tar; ln -sf /data/part-b-source.tar /data/part-b-source.tar; bash /data/startup.sh"

$code = $LASTEXITCODE
Write-Host "dry_run_exit=$code"
if (-not (Test-Path (Join-Path $work "out\_DONE"))) { throw "_DONE missing" }
$manifest = Join-Path $work "out\..\..\export" 
# export lands in /data/export inside container mapped via /data
$exportManifest = Get-ChildItem -Path $work -Recurse -Filter export_manifest.json | Select-Object -First 1
if (-not $exportManifest) {
  # startup writes to /data/export which is under the same bind if we also map it — check out relative
  $exportManifest = Get-ChildItem -Path (Join-Path $Dry "container") -Recurse -Filter export_manifest.json -ErrorAction SilentlyContinue | Select-Object -First 1
}
if (-not $exportManifest) { throw "export_manifest.json missing" }
Write-Host "manifest=$($exportManifest.FullName)"
Get-Content (Join-Path $work "out\_DONE")
exit $code
